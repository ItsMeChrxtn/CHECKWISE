import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/formatters.dart';
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
/// Unlike the web scanner this does not fire by itself — it has no port of the
/// browser's corner-square detector — so the shutter is yours. The server does
/// all the actual reading either way.
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
      final controller = CameraController(
        back,
        ResolutionPreset.veryHigh,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      final ready = controller.initialize();
      setState(() {
        _camera = controller;
        _cameraReady = ready;
        _cameraError = null;
      });
      await ready;
      if (mounted) setState(() {});
    } on CameraException catch (error) {
      if (!mounted) return;
      setState(() {
        _cameraError = error.description ??
            'The camera could not be opened. Check the app’s permissions.';
      });
    }
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

    setState(() {
      _uploading = true;
      _progress = 0;
    });

    try {
      final outcome = await context.read<ResultService>().scan(
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
            // A frame the paper is meant to fill. Filling it is what makes the
            // corner squares big enough in pixels to be found reliably.
            const _SheetGuide(),
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
                    _pages.isEmpty
                        ? 'Fill the frame with the sheet, flat and square'
                        : 'Page ${_pages.length + 1} — or score what you have',
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

/// The corner brackets the sheet should sit inside.
class _SheetGuide extends StatelessWidget {
  const _SheetGuide();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: FractionallySizedBox(
          widthFactor: 0.86,
          heightFactor: 0.82,
          child: CustomPaint(painter: _GuidePainter()),
        ),
      ),
    );
  }
}

class _GuidePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.85)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    // Length of each bracket arm.
    final arm = size.shortestSide * 0.1;

    void corner(Offset origin, double dx, double dy) {
      canvas.drawLine(origin, origin.translate(arm * dx, 0), paint);
      canvas.drawLine(origin, origin.translate(0, arm * dy), paint);
    }

    corner(Offset.zero, 1, 1);
    corner(Offset(size.width, 0), -1, 1);
    corner(Offset(0, size.height), 1, -1);
    corner(Offset(size.width, size.height), -1, -1);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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
