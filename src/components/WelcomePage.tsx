import { useState, useEffect } from "react";

const STORAGE_KEY = "pow-predictor-welcome-dismissed";

export default function WelcomePage() {
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<"enter" | "ready" | "exit">("enter");

  useEffect(() => {
    const dismissed = sessionStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setVisible(true);
      requestAnimationFrame(() => setStage("ready"));
    }
  }, []);

  const dismiss = () => {
    setStage("exit");
    setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem(STORAGE_KEY, "1");
    }, 500);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        opacity: stage === "ready" ? 1 : 0,
        transition: "opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" />

      {/* Subtle mountain silhouette — pure CSS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute bottom-0 left-0 right-0 h-[45%]"
          style={{
            background: `
              linear-gradient(135deg, transparent 33%, rgba(30,41,59,0.4) 33%, rgba(30,41,59,0.4) 34%, transparent 34%),
              linear-gradient(160deg, transparent 40%, rgba(30,41,59,0.25) 40%, rgba(30,41,59,0.25) 41%, transparent 41%),
              linear-gradient(120deg, transparent 28%, rgba(30,41,59,0.35) 28%, rgba(30,41,59,0.35) 29%, transparent 29%),
              linear-gradient(145deg, transparent 55%, rgba(30,41,59,0.2) 55%)
            `,
          }}
        />
        {/* Falling snow dots */}
        <div className="welcome-snow" />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[520px] mx-4"
        style={{
          transform: stage === "ready" ? "translateY(0)" : "translateY(24px)",
          transition: "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="glass-panel p-5 sm:p-8 md:p-10 text-white max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(125,211,252,0.15), rgba(52,211,153,0.1))",
                border: "1px solid rgba(125,211,252,0.2)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sky-300">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1
                className="text-2xl sm:text-3xl font-semibold tracking-wide text-sky-50 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Pow Predictor
              </h1>
              <p className="text-sm text-slate-400 font-light mt-0.5">
                Alpine snow redistribution simulator
              </p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-sky-500/30 via-slate-500/20 to-transparent mb-6" />

          {/* Description */}
          <p className="text-sm sm:text-[15px] text-slate-300 font-light leading-relaxed mb-4 sm:mb-6">
            Predict where powder accumulates after storms. This simulator models how
            wind transports snow through mountain terrain — scouring exposed ridges
            and depositing on sheltered lee slopes — using real physics and weather data.
          </p>

          {/* How to use — two modes */}
          <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
            <h2
              className="text-xs font-medium tracking-[0.15em] uppercase text-slate-500"
            >
              Two ways to explore
            </h2>

            {/* Exploration mode */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(30, 41, 59, 0.45)",
                border: "1px solid rgba(148, 163, 184, 0.08)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-sky-500/15 text-sky-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-sky-200">Exploration Mode</span>
                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full ml-auto">default</span>
              </div>
              <p className="text-xs text-slate-400 font-light leading-relaxed pl-[34px]">
                Click anywhere on the terrain to see current weather conditions
                and analyze field observations. Adjust wind direction, speed, and
                temperature to see snow redistribute in real time.
              </p>
            </div>

            {/* Historical mode */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(30, 41, 59, 0.45)",
                border: "1px solid rgba(148, 163, 184, 0.08)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-emerald-500/15 text-emerald-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-emerald-200">Simulation Mode</span>
              </div>
              <p className="text-xs text-slate-400 font-light leading-relaxed pl-[34px]">
                Click <span className="text-slate-300">Simulation Mode</span> in the control panel,
                then pick a mountain on the map or search by name. Runs a 12-day weather
                simulation (7 days history + 5 forecast) with a playable timeline.
                Click anywhere on the map during playback to probe snow depth.
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-6 sm:mb-8 text-[11px] text-slate-500 font-light">
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-sky-500/50 inline-block" />
              Search any Norwegian mountain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-500/50 inline-block" />
              Cyan→yellow→red = wind speed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-emerald-500/50 inline-block" />
              Click compass to reset north
            </span>
          </div>

          {/* CTA */}
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all duration-200 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(52,211,153,0.15))",
              border: "1px solid rgba(125,211,252,0.25)",
              boxShadow: "0 4px 20px rgba(56,189,248,0.1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(56,189,248,0.3), rgba(52,211,153,0.22))";
              e.currentTarget.style.borderColor = "rgba(125,211,252,0.4)";
              e.currentTarget.style.boxShadow = "0 4px 24px rgba(56,189,248,0.18)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(52,211,153,0.15))";
              e.currentTarget.style.borderColor = "rgba(125,211,252,0.25)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(56,189,248,0.1)";
            }}
          >
            Explore the Mountains
          </button>

          <p className="text-center text-[10px] text-slate-600 mt-3 font-light">
            Press Escape or click to dismiss
          </p>
        </div>
      </div>

      {/* Keyboard dismiss */}
      <KeyboardDismiss onDismiss={dismiss} />

      {/* Snow animation styles */}
      <style>{`
        .welcome-snow {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.3) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 25% 35%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 40% 10%, rgba(255,255,255,0.25) 50%, transparent 50%),
            radial-gradient(1px 1px at 55% 45%, rgba(255,255,255,0.15) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 70% 20%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 85% 30%, rgba(255,255,255,0.25) 50%, transparent 50%),
            radial-gradient(1px 1px at 15% 60%, rgba(255,255,255,0.15) 50%, transparent 50%),
            radial-gradient(1.5px 1.5px at 50% 70%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 75% 55%, rgba(255,255,255,0.2) 50%, transparent 50%),
            radial-gradient(1px 1px at 90% 65%, rgba(255,255,255,0.15) 50%, transparent 50%);
          background-size: 100% 100%;
          animation: snowfall 8s linear infinite;
        }
        @keyframes snowfall {
          0% { transform: translateY(-10%); opacity: 0.6; }
          50% { opacity: 1; }
          100% { transform: translateY(100%); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function KeyboardDismiss({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);
  return null;
}
