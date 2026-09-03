import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import Button from "./Button.jsx";

const DISMISSED = "checkwise.installHintDismissed";

/**
 * Offers to put CheckWise on the phone's home screen.
 *
 * Installed, the site runs without an address bar, keeps its own icon and its
 * own entry in the task switcher - which is as close to an app as an iPhone
 * allows without a paid Apple developer account, and it is close enough: the
 * scanner uses the browser camera, so an installed iPhone gets the real thing.
 *
 * The two platforms need opposite handling. Chrome offers to install and only
 * needs a button wired to the event it fires. Safari never offers and has no
 * API for it, so the only thing that works is telling people which two taps to
 * make - which is why an instruction, normally a bad sign in an interface, is
 * the right answer here.
 *
 * Shown on phones only, once, and never again after it is dismissed or the app
 * is opened from the home screen. It is mounted by the screens that can spare
 * the room - never over a form, because a banner that covers the sign-in
 * button is worse than no banner at all.
 *
 * `aboveTabBar` lifts it clear of the bottom navigation, which is fixed too.
 */
export default function InstallHint({ aboveTabBar = false }) {
  const [prompt, setPrompt] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // Private browsing. Showing the hint again is a smaller cost than crashing.
    }
    if (dismissed) return;

    // Already installed: iOS reports it on navigator, everyone else through the
    // display-mode media query.
    const installed =
      window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (installed) return;

    // A phone, not a desktop browser with a narrow window.
    if (!window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
    // Chrome and Firefox on iOS cannot add to the home screen at all; only
    // Safari can, so telling anyone else to do it would be a dead end.
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    if (isIos && isSafari) {
      setShowIos(true);
      setGone(false);
      return;
    }

    const onPrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
      setGone(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setGone(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do; it simply shows again next time.
    }
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    dismiss();
  };

  if (gone) return null;

  return (
    <div
      className={[
        "fixed inset-x-3 z-50 rounded-xl border border-ink-200 bg-white p-4 shadow-lg",
        aboveTabBar
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-3"
          : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">Add CheckWise to your home screen</p>

          {showIos ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Tap{" "}
              <Share size={13} className="inline align-text-bottom text-brand-600" aria-hidden="true" />{" "}
              <span className="font-medium">Share</span>, then{" "}
              <span className="font-medium">Add to Home Screen</span>. It opens full screen, with
              the camera, like an app.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              It opens full screen, with the camera, like an app.
            </p>
          )}

          {!showIos && (
            <Button size="sm" onClick={install} className="mt-2.5">
              Install
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
