import { useState, useEffect } from "react";

const STORAGE_KEY = "pow-predictor-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  const touch = navigator.maxTouchPoints > 0;
  return narrow && touch;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function InstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || !isMobile()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Delay slightly so it doesn't compete with WelcomePage
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  if (!visible) return null;

  const ios = isIOS();

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-40 md:hidden"
      style={{
        animation: "installSlideUp 0.35s ease-out",
      }}
    >
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3 shadow-xl"
        style={{
          background: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(125, 211, 252, 0.2)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/15 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400">
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-slate-200 font-medium leading-snug">
            Add to Home Screen
          </p>
          <p className="text-[11px] text-slate-400 font-light leading-relaxed mt-0.5">
            {ios ? (
              <>Tap <span className="text-sky-300">Share</span> <svg className="inline w-3 h-3 -mt-0.5 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg> then <span className="text-sky-300">Add to Home Screen</span></>
            ) : (
              <>Tap the <span className="text-sky-300">menu</span> (three dots) then <span className="text-sky-300">Add to Home Screen</span></>
            )}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 shrink-0 mt-0.5"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes installSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
