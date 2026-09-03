import 'dart:io';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
import '../core/sheet_vision.dart';
import '../core/theme.dart';
import '../models/exam.dart';
import '../services/services.dart';
import '../widgets/common.dart';

/// Photograph a completed answer sheet and have it scored.
///
/// Pages are collected before anything is sent: a sheet that runs to two pages
/// is still one paper and one score, so they go up in a single request. Each
/// page carries a run of squares along its bottom edge saying which page it is,
/// so they can be shot in any order.
///
/// The shutter fires by itself. Every preview frame is checked for the corner
/// squares, and the moment a page is recognised it is photographed - there is
/// nothing to line up and no button to find. Once every page of the sheet has
/// been caught the paper is sent without being asked, so pointing the camera
/// at a stack is the whole interaction.
///
/// Only the recognising happens here. The marks themselves are still read on
/// the server from the full-resolution photo, because a preview frame is far
/// too coarse to tell a shaded bubble from an empty one.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.exam});

  final Exam exam;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> with WidgetsBindingObserver {
  CameraController? _camera;
  Future<void>? _cameraReady;
  String? _cameraError;

  final List<File> _pages = [];
  final _studentName = TextEditingController();

  bool _busy = false;
  bool _uploading = false;

  /// Which pages of the sheet have already been caught, so the same page is
  /// not photographed twice while the camera lingers on it.
  final Set<int> _capturedPages = <int>{};

  /// A sighting has to repeat before the shutter fires. One frame is enough
  /// to be a reflection or a half-turned page; two in a row is a sheet.
  int? _pendingPage;
  int _pendingFrames = 0;
  bool _detecting = false;
  bool _streaming = false;
  DateTime _lastLook = DateTime.fromMillisecondsSinceEpoch(0);
  String? _sheetHint;

  /// The paper just scored, shown over the viewfinder. Holding it here rather
  /// than navigating away is the point: a teacher works through a stack, and
  /// the score for the sheet in their hand should appear without the camera
  /// going anywhere.
  ScanOutcome? _scored;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _startCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // Disposing the controller tears the stream down with it, so there is
    // nothing to await here - and dispose() cannot await anyway.
    _streaming = false;
    _camera?.dispose();
    _studentName.dispose();
    super.dispose();
  }

  /// The OS tears the camera down when the app goes to the background; without
  /// this the preview comes back as a frozen frame.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;

    if (state == AppLifecycleState.inactive) {
      _streaming = false;
      camera.dispose();
      _camera = null;
    } else if (state == AppLifecycleState.resumed) {
      _startCamera();
    }
  }

  Future<void> _startCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _cameraError = 'This device has no camera.');
        return;
      }

      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      // A sheet is read by finding small printed squares, so resolution is the
      // one setting that actually decides whether a paper can be scored.
      // yuv420 rather than jpeg: the preview has to be streamed frame by frame
      // for the shutter to fire itself, and its luminance plane is already the
      // greyscale the reader wants. Stills are still full-resolution JPEGs.
      final controller = CameraController(
        back,
        ResolutionPreset.veryHigh,
        enableAudio: false,
        // Each platform native format, so the plugin converts nothing on the
        // way: Android hands over a YUV frame whose first plane is already the
        // luminance the reader wants, iOS hands over BGRA. _toGrey reads both.
        imageFormatGroup:
            Platform.isIOS ? ImageFormatGroup.bgra8888 : ImageFormatGroup.yuv420,
      );

      final ready = controller.initialize();
      setState(() {
        _camera = controller;
        _cameraReady = ready;
        _cameraError = null;
      });
      await ready;
      if (!mounted) return;
      setState(() {});
      _startWatching();
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() {
        _cameraError = error.description ??
            'The camera could not be opened. Check the app’s permissions.';
      });
    }
  }

  /// Starts looking for the sheet in the preview.
  ///
  /// Nothing happens without a printed layout to look for - an exam whose sheet
  /// has not been generated has no markers to find - and in that case the manual
  /// shutter is all there is.
  void _startWatching() {
    final camera = _camera;
    final layout = widget.exam.sheetLayout;
    if (camera == null || layout == null || !layout.usable || _streaming) return;

    _streaming = true;
    camera.startImageStream(_onFrame).catchError((Object _) {
      // A device that will not stream still scans perfectly well by hand.
      _streaming = false;
    });
  }

  Future<void> _stopWatching() async {
    final camera = _camera;
    if (camera == null || !_streaming) return;
    _streaming = false;
    try {
      await camera.stopImageStream();
    } on CameraException {
      // Already stopped, or the camera is going away with the screen.
    }
  }

  /// Looks at one preview frame.
  ///
  /// Frames arrive faster than they can be read, so most are dropped: the
  /// reader is given roughly five looks a second, which is far quicker than a
  /// person can move a sheet into place and leaves the preview smooth.
  Future<void> _onFrame(CameraImage image) async {
    if (_detecting || _busy || _uploading || _scored != null) return;

    final now = DateTime.now();
    if (now.difference(_lastLook).inMilliseconds < 180) return;
    _lastLook = now;

    final layout = widget.exam.sheetLayout;
    if (layout == null) return;

    _detecting = true;
    try {
      final frame = _toGrey(image);
      final seen = frame == null ? null : findSheet(frame, layout);

      if (seen == null) {
        _pendingPage = null;
        _pendingFrames = 0;
        return;
      }

      if (_capturedPages.contains(seen.page)) {
        _showHint(layout.pages > 1
            ? 'Page ${seen.page} is already in. Show the next one.'
            : 'Already caught. Show the next paper.');
        return;
      }

      if (_pendingPage == seen.page) {
        _pendingFrames += 1;
      } else {
        _pendingPage = seen.page;
        _pendingFrames = 1;
      }

      if (_pendingFrames >= 2) {
        _pendingPage = null;
        _pendingFrames = 0;
        await _captureSheet(seen.page, layout);
      }
    } finally {
      _detecting = false;
    }
  }

  /// Photographs the page the reader just recognised, and sends the paper once
  /// every page of the sheet is in.
  Future<void> _captureSheet(int page, SheetLayout layout) async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized || _busy) return;

    setState(() => _busy = true);
    await _stopWatching();

    try {
      final shot = await camera.takePicture();
      if (!mounted) return;

      setState(() {
        _pages.add(File(shot.path));
        _capturedPages.add(page);
        _busy = false;
        _sheetHint = layout.pages > 1
            ? 'Page $page caught — ${_capturedPages.length} of ${layout.pages}'
            : 'Caught';
      });

      if (_capturedPages.length >= layout.pages) {
        await _submit();
        return;
      }
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showToast(context, error.description ?? 'Could not take the photo.',
          isError: true);
    }

    if (mounted && _scored == null && !_uploading) _startWatching();
  }

  void _showHint(String text) {
    if (!mounted || _sheetHint == text) return;
    setState(() => _sheetHint = text);
  }

  /// Pulls the luminance out of a preview frame, small enough to read quickly.
  ///
  /// A YUV frame's first plane is already the greyscale image, so on Android
  /// this is a stride-aware copy and nothing more. BGRA frames, which is what
  /// iOS hands over, are converted with the Rec. 601 luma weights.
  GreyFrame? _toGrey(CameraImage image) {
    if (image.planes.isEmpty) return null;

    const target = 520;
    final step = (image.width / target).ceil().clamp(1, 8);
    final outWidth = image.width ~/ step;
    final outHeight = image.height ~/ step;
    if (outWidth < 40 || outHeight < 40) return null;

    final plane = image.planes.first;
    final bytes = plane.bytes;
    final rowStride = plane.bytesPerRow;
    final pixelStride = plane.bytesPerPixel ?? 1;
    final out = Uint8List(outWidth * outHeight);

    if (pixelStride >= 4) {
      for (var y = 0; y < outHeight; y += 1) {
        final row = (y * step) * rowStride;
        for (var x = 0; x < outWidth; x += 1) {
          final i = row + (x * step) * pixelStride;
          if (i + 2 >= bytes.length) continue;
          out[y * outWidth + x] =
              (bytes[i + 2] * 299 + bytes[i + 1] * 587 + bytes[i] * 114) ~/ 1000;
        }
      }
    } else {
      for (var y = 0; y < outHeight; y += 1) {
        final row = (y * step) * rowStride;
        for (var x = 0; x < outWidth; x += 1) {
          final i = row + (x * step) * pixelStride;
          if (i >= bytes.length) continue;
          out[y * outWidth + x] = bytes[i];
        }
      }
    }

    return GreyFrame(outWidth, outHeight, out);
  }

  Future<void> _capture() async {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized || _busy) return;

    setState(() => _busy = true);
    try {
      final shot = await camera.takePicture();
      if (!mounted) return;
      setState(() {
        _pages.add(File(shot.path));
        _busy = false;
      });
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showToast(context, error.description ?? 'Could not take the photo.',
          isError: true);
    }
  }

  /// A sheet already photographed, or a PDF straight off a document scanner.
  Future<void> _pickFiles() async {
    final picked = await ImagePicker().pickMultiImage();
    if (picked.isEmpty || !mounted) return;
    setState(() => _pages.addAll(picked.map((x) => File(x.path))));
  }

  Future<void> _submit() async {
    if (_pages.isEmpty) return;

    // Held before the await: `context` must not be reached across an async
    // gap, and stopping the preview stream is one.
    final results = context.read<ResultService>();
    await _stopWatching();

    setState(() {
      _uploading = true;
      _progress = 0;
    });

    try {
      final outcome = await results.scan(
        widget.exam.id,
        files: _pages,
        studentName: _studentName.text,
        onProgress: (percent) {
          if (mounted) setState(() => _progress = percent);
        },
      );

      if (!mounted) return;
      setState(() {
        _scored = outcome;
        _uploading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _uploading = false);
      showToast(context, error.message, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Every exit is handled here rather than by the framework. Leaving on a
      // system back after scoring a stack used to pop with no result, so the
      // exam behind it never reloaded and showed none of the papers just
      // scanned. And leaving mid-stack would silently discard pages already
      // shot.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _leave();
      },
      child: Scaffold(
        backgroundColor: Slate.c900,
        appBar: AppBar(
          backgroundColor: Slate.c900,
          foregroundColor: Colors.white,
          title: Text(
            widget.exam.examCode,
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
          iconTheme: const IconThemeData(color: Colors.white),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            tooltip: 'Close scanner',
            onPressed: _leave,
          ),
        ),
        body: _scored != null
            ? _buildScored(_scored!)
            : _uploading
                ? _buildUploading()
                : _buildScanner(),
      ),
    );
  }

  /// The single way out, so the exam behind always learns what happened.
  void _leave() {
    if (_uploading) return;

    // Something was scored: hand the last paper back so the exam reloads.
    if (_scored != null) {
      Navigator.of(context).pop(_scored);
      return;
    }
    if (_pages.isNotEmpty) {
      _confirmDiscard();
      return;
    }
    Navigator.of(context).pop();
  }

  Future<void> _confirmDiscard() async {
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard this paper?'),
        content: Text(
          '${_pages.length} ${plural(_pages.length, "page")} '
          '${_pages.length == 1 ? "has" : "have"} been photographed but not '
          'scored yet.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Keep scanning'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Signal.fail),
            child: const Text('Discard'),
          ),
        ],
      ),
    );

    if (discard == true && mounted) Navigator.of(context).pop();
  }

  /// The score, the moment the paper comes back.
  ///
  /// Deliberately the whole screen rather than a toast: this is the number the
  /// teacher is scanning to find out, and it has to survive them looking down
  /// at the next sheet. The record is already in the database by the time this
  /// draws — the server writes it before replying — so leaving now loses
  /// nothing.
  Widget _buildScored(ScanOutcome outcome) {
    final r = outcome.result;
    final tint = r.passed ? Signal.pass : Signal.fail;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        r.isUnnamed ? 'Paper scored' : r.studentName,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Score out of the total the exam is worth.
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            marks(r.score),
                            style: TextStyle(
                              fontSize: 68,
                              fontWeight: FontWeight.w700,
                              color: tint,
                              height: 1,
                            ),
                          ),
                          Text(
                            ' / ${marks(r.totalPoints)}',
                            style: const TextStyle(
                              fontSize: 30,
                              fontWeight: FontWeight.w600,
                              color: Colors.white54,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        '${percent(r.percentage)}  ·  ${r.passed ? "Passed" : "Did not pass"}',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: tint,
                        ),
                      ),

                      const SizedBox(height: 22),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _Tally(label: 'Correct', value: r.correctAnswers, tint: Signal.pass),
                          _Tally(label: 'Wrong', value: r.wrongAnswers, tint: Signal.fail),
                          if (r.needsAttentionCount > 0)
                            _Tally(
                              label: 'To review',
                              value: r.needsAttentionCount,
                              tint: Signal.warn,
                            ),
                        ],
                      ),

                      if (r.needsAttention) ...[
                        const SizedBox(height: 18),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Signal.warn.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${r.needsAttentionCount} ${plural(r.needsAttentionCount, "item")} '
                            'need a look. Nothing flagged earns marks until you settle it.',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 12.5,
                              color: Colors.white,
                              height: 1.45,
                            ),
                          ),
                        ),
                      ],

                      const SizedBox(height: 14),
                      const Text(
                        'Saved to this exam.',
                        style: TextStyle(fontSize: 12, color: Colors.white38),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            FilledButton.icon(
              onPressed: _scanNext,
              icon: const Icon(Icons.document_scanner_rounded, size: 19),
              label: const Text('Scan the next paper'),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: _leave,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Colors.white24),
              ),
              child: const Text('Open this paper'),
            ),
          ],
        ),
      ),
    );
  }

  /// Clears the finished paper and returns to the viewfinder for the next one.
  void _scanNext() {
    setState(() {
      _scored = null;
      _pages.clear();
      _capturedPages.clear();
      _sheetHint = null;
      _studentName.clear();
      _progress = 0;
    });
  }

  Widget _buildUploading() {
    // Past 100% the bytes are all sent and the server is doing the slow part —
    // finding the corners, reading the bubbles, running the handwriting OCR.
    final sending = _progress < 100;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 64,
              height: 64,
              child: CircularProgressIndicator(
                value: sending ? _progress / 100 : null,
                strokeWidth: 4,
                backgroundColor: Colors.white24,
                valueColor: const AlwaysStoppedAnimation(Colors.white),
              ),
            ),
            const SizedBox(height: 26),
            Text(
              sending ? 'Sending pages… $_progress%' : 'Reading the paper…',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              sending
                  ? '${_pages.length} ${plural(_pages.length, "page")} on the way.'
                  : 'Finding the corner squares, reading the bubbles and the '
                        'handwriting. This can take a moment.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: 13,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScanner() {
    return Column(
      children: [
        Expanded(child: _buildPreview()),
        _buildTray(),
      ],
    );
  }

  Widget _buildPreview() {
    if (_cameraError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.no_photography_outlined,
                color: Colors.white38,
                size: 44,
              ),
              const SizedBox(height: 16),
              Text(
                _cameraError!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13.5,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: _pickFiles,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Choose photos instead'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white30),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final camera = _camera;
    if (camera == null) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }

    return FutureBuilder<void>(
      future: _cameraReady,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done ||
            !camera.value.isInitialized) {
          return const Center(
            child: CircularProgressIndicator(color: Colors.white),
          );
        }

        return Stack(
          fit: StackFit.expand,
          children: [
            FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: camera.value.previewSize?.height ?? 1,
                height: camera.value.previewSize?.width ?? 1,
                child: CameraPreview(camera),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 14,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _hintText(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  /// What the strip along the bottom of the viewfinder says.
  ///
  /// It reports rather than instructs. There is nothing for the teacher to line
  /// up any more, so the only useful thing to show is whether the sheet has
  /// been seen yet and how much of it is in.
  String _hintText() {
    final layout = widget.exam.sheetLayout;
    if (_sheetHint != null) return _sheetHint!;

    if (layout == null || !layout.usable) {
      // No printed layout to recognise, so the shutter is the teacher's.
      return _pages.isEmpty
          ? 'Tap the shutter with the sheet in frame'
          : '${_pages.length} ${plural(_pages.length, "page")} — tap to score';
    }

    if (_pages.isEmpty) return 'Point the camera at the sheet';

    return layout.pages > 1
        ? '${_capturedPages.length} of ${layout.pages} pages'
        : 'Scoring…';
  }

  Widget _buildTray() {
    return Container(
      color: Slate.c900,
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        14 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        children: [
          if (_pages.isNotEmpty) ...[
            SizedBox(
              height: 62,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _pages.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) => _PageThumb(
                  file: _pages[index],
                  index: index,
                  onRemove: () => setState(() => _pages.removeAt(index)),
                ),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _studentName,
              textCapitalization: TextCapitalization.words,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: InputDecoration(
                // Optional on purpose: pointing a camera at a stack of papers
                // should not stop for typing. The server numbers what it gets.
                hintText: 'Student name (optional)',
                hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
                filled: true,
                fillColor: Colors.white10,
                isDense: true,
                prefixIcon: const Icon(
                  Icons.person_outline_rounded,
                  size: 19,
                  color: Colors.white38,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Colors.white24),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Brand.c400, width: 1.6),
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          Row(
            children: [
              _TrayButton(
                icon: Icons.photo_library_outlined,
                tooltip: 'Choose photos',
                onPressed: _pickFiles,
              ),
              const Spacer(),
              _Shutter(onPressed: _busy ? null : _capture, busy: _busy),
              const Spacer(),
              _TrayButton(
                icon: Icons.check_rounded,
                tooltip: 'Score this paper',
                filled: _pages.isNotEmpty,
                onPressed: _pages.isEmpty ? null : _submit,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PageThumb extends StatelessWidget {
  const _PageThumb({
    required this.file,
    required this.index,
    required this.onRemove,
  });

  final File file;
  final int index;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.file(
            file,
            width: 46,
            height: 62,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => Container(
              width: 46,
              height: 62,
              color: Colors.white12,
              child: const Icon(
                Icons.description_outlined,
                color: Colors.white38,
                size: 18,
              ),
            ),
          ),
        ),
        Positioned(
          left: 3,
          bottom: 3,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.65),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              '${index + 1}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        Positioned(
          top: -6,
          right: -6,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                color: Signal.fail,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close_rounded,
                size: 11,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Shutter extends StatelessWidget {
  const _Shutter({required this.onPressed, required this.busy});

  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 70,
        height: 70,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3.5),
        ),
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Container(
            decoration: BoxDecoration(
              color: busy ? Colors.white38 : Colors.white,
              shape: BoxShape.circle,
            ),
            child: busy
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : null,
          ),
        ),
      ),
    );
  }
}

class _TrayButton extends StatelessWidget {
  const _TrayButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.filled = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;

    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: filled && enabled ? Signal.pass : Colors.white12,
            shape: BoxShape.circle,
          ),
          child: Icon(
            icon,
            color: enabled ? Colors.white : Colors.white24,
            size: 22,
          ),
        ),
      ),
    );
  }
}

/// One count under the score — correct, wrong, or waiting on a person.
class _Tally extends StatelessWidget {
  const _Tally({required this.label, required this.value, required this.tint});

  final String label;
  final int value;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        children: [
          Text(
            '$value',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: tint),
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11.5, color: Colors.white54)),
        ],
      ),
    );
  }
}
