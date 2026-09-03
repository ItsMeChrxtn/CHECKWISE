import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, CheckCircle2, RefreshCw, X } from "lucide-react";
import Button from "./Button.jsx";
import { ANALYSIS_WIDTH, inspectFrame } from "../utils/sheetVision.js";
import { resultService } from "../services/resultService.js";
import { useToast } from "../hooks/useToast.js";

/**
 * Point the camera at a paper and the score appears.
 *
 * Every few frames the preview is checked for the sheet's four corner squares
 * and its page mark. Once the same page has been seen steadily for a moment the
 * frame is captured by itself - no shutter button, because a teacher working
 * through a stack has a paper in each hand.
 *
 * Pages are collected until the whole sheet is in hand and only then sent, so a
 * two-page sheet still produces one score rather than two half-papers.
 */

/** Consecutive good frames before firing - stops a blurred half-view triggering. */
const STABLE_FRAMES = 4;
/** How often the preview is analysed. Faster than this only heats the phone. */
const ANALYSE_EVERY_MS = 180;
/** Pause after a paper is scored, so the same sheet is not read twice. */
const COOLDOWN_MS = 2200;

export default function CameraScanner({ exam, onScored, onClose }) {
  const toast = useToast();

  const videoRef = useRef(null);
  const analysisCanvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef = useRef(null);

  // Refs, not state: the analysis loop must not restart on every frame.
  const stableRef = useRef({ page: null, count: 0 });
  const capturedRef = useRef(new Map());
  const busyRef = useRef(false);
  const cooldownRef = useRef(0);

  const [status, setStatus] = useState("starting");
  const [hint, setHint] = useState("Line the whole sheet up in the frame.");
  const [captured, setCaptured] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  const layout = exam.answerSheetLayout;
  const totalPages = layout
    ? Math.max(...layout.bubbles.map((b) => b.page ?? 1))
    : 1;

  /** Sends whatever pages have been collected and shows the score. */
  const submit = useCallback(async () => {
    const pages = [...capturedRef.current.entries()].sort((a, b) => a[0] - b[0]);
    if (pages.length === 0) return;

    busyRef.current = true;
    setStatus("reading");
    try {
      const response = await resultService.scan(exam._id, {
        files: pages.map(([, blob], index) => new File([blob], `page-${index + 1}.png`, { type: "image/png" })),
      });
      setLastResult(response.data.result);
      onScored?.(response.data.result);
      setStatus("scored");
    } catch (err) {
      toast.error(err.message);
      setStatus("live");
    } finally {
      capturedRef.current = new Map();
      setCaptured([]);
      stableRef.current = { page: null, count: 0 };
      cooldownRef.current = Date.now() + COOLDOWN_MS;
      busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam._id]);

  /** Grabs the current frame at full resolution for the server to read. */
  const capture = useCallback(
    (page) =>
      new Promise((resolve) => {
        const video = videoRef.current;
        const canvas = captureCanvasRef.current;
        if (!video || !canvas) return resolve();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (blob) {
            capturedRef.current.set(page, blob);
            setCaptured([...capturedRef.current.keys()].sort((a, b) => a - b));
          }
          resolve();
        }, "image/png");
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("live");
        loop();
      } catch (err) {
        setStatus("denied");
        setHint(
          err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in the browser's address bar, then reopen this."
            : `The camera could not be opened (${err.message}).`
        );
      }
    }

    function loop() {
      if (cancelled) return;
      analyse();
      timer = setTimeout(loop, ANALYSE_EVERY_MS);
    }

    function analyse() {
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      if (busyRef.current || Date.now() < cooldownRef.current) return;

      const scale = ANALYSIS_WIDTH / video.videoWidth;
      canvas.width = ANALYSIS_WIDTH;
      canvas.height = Math.round(video.videoHeight * scale);
      canvas
        .getContext("2d", { willReadFrequently: true })
        .drawImage(video, 0, 0, canvas.width, canvas.height);

      const seen = inspectFrame(canvas, layout);

      if (!seen) {
        stableRef.current = { page: null, count: 0 };
        setHint("Get the whole sheet in frame — all four black corners visible. Tilt is fine.");
        return;
      }

      if (capturedRef.current.has(seen.page)) {
        const missing = remainingPages(capturedRef.current, totalPages);
        setHint(
          missing.length > 0
            ? `Page ${seen.page} is done. Now show page ${missing[0]}.`
            : "Reading…"
        );
        return;
      }

      // The same page, steadily, for a few frames: not a blur or a half-view.
      if (stableRef.current.page === seen.page) stableRef.current.count += 1;
      else stableRef.current = { page: seen.page, count: 1 };

      setHint(`Page ${seen.page} — hold still…`);

      if (stableRef.current.count >= STABLE_FRAMES) {
        stableRef.current = { page: null, count: 0 };
        busyRef.current = true;
        capture(seen.page).then(() => {
          busyRef.current = false;
          if (remainingPages(capturedRef.current, totalPages).length === 0) submit();
        });
      }
    }

    if (layout) start();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [layout, totalPages, capture, submit]);

  if (!layout) {
    return (
      <p className="text-sm text-ink-500">
        Generate the answer sheet first — the camera needs its layout to recognise a paper.
      </p>
    );
  }

  return (
    // Above the install hint and the tab bar, both of which are fixed to the
    // bottom of the screen and would otherwise sit on the viewfinder - which is
    // the one thing on this screen that has to be seen.
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-900 lg:relative lg:z-auto lg:block lg:overflow-hidden lg:rounded-xl lg:border lg:border-ink-200">
      <div className="relative min-h-0 flex-1 bg-black lg:aspect-[4/3] lg:w-full lg:flex-none">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Answer sheet camera"
        />

        {status === "denied" && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/90 p-6 text-center">
            <div>
              <CameraOff size={28} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-2 text-sm text-ink-200">{hint}</p>
            </div>
          </div>
        )}

        {status === "scored" && lastResult && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/92 p-6 text-center">
            <div>
              <CheckCircle2 size={30} className="mx-auto text-pass-300" aria-hidden="true" />
              <p className="mt-2 text-3xl font-bold text-white">
                {lastResult.score} / {lastResult.totalPoints}
              </p>
              <p className="text-lg font-semibold text-pass-300">{lastResult.percentage}%</p>
              <p className="mt-1 text-sm text-ink-300">{lastResult.studentName}</p>
              {lastResult.pendingReview > 0 && (
                <p className="mt-2 text-xs text-warn-300">
                  {lastResult.pendingReview} written answer
                  {lastResult.pendingReview === 1 ? "" : "s"} still to type in
                </p>
              )}
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => {
                  setLastResult(null);
                  setStatus("live");
                }}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Next paper
              </Button>
            </div>
          </div>
        )}

        {(status === "live" || status === "reading") && (
          <div className="pointer-events-none absolute inset-0">
            <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white drop-shadow">
              {status === "reading" ? "Reading…" : hint}
            </p>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
        <p className="text-xs text-ink-300">
          {totalPages > 1
            ? `${captured.length} of ${totalPages} pages captured${captured.length ? ` (${captured.join(", ")})` : ""}`
            : "Point the camera at the sheet."}
        </p>
        <Button variant="secondary" size="sm" onClick={onClose}>
          <X size={15} aria-hidden="true" />
          Close camera
        </Button>
      </div>

      <canvas ref={analysisCanvasRef} className="hidden" />
      <canvas ref={captureCanvasRef} className="hidden" />
    </div>
  );
}

function remainingPages(captured, totalPages) {
  const pages = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (!captured.has(page)) pages.push(page);
  }
  return pages;
}
