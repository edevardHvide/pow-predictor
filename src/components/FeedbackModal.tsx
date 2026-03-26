import { useState, useRef, useEffect } from "react";
import { API_GATEWAY_URL } from "../api/nve.ts";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

type FeedbackType = "bug" | "feature" | "other";

const TYPE_META: Record<FeedbackType, { label: string; icon: string; color: string }> = {
  bug: { label: "Bug", icon: "M12 9v2m0 4h.01M5.07 19H19a2.13 2.13 0 001.81-3.19L13.81 4.44a2.13 2.13 0 00-3.62 0L3.26 15.81A2.13 2.13 0 005.07 19z", color: "text-amber-400" },
  feature: { label: "Idea", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", color: "text-sky-400" },
  other: { label: "Other", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", color: "text-emerald-400" },
};

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackType>("feature");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setResult(null);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setResult(null);

    const labels = type === "bug" ? "bug" : type === "feature" ? "feature-request" : "question";
    const prefix = type === "bug" ? "[Bug]" : type === "feature" ? "[Feature]" : "[Feedback]";
    const issueTitle = `${prefix} ${title.trim()}`;
    const issueBody = [
      body.trim(),
      email.trim() ? `\n**Contact:** ${email.trim()}` : "",
      "",
      "---",
      `*Submitted from Pow Predictor v${__APP_VERSION__}*`,
    ].filter(Boolean).join("\n");

    const url = import.meta.env.DEV
      ? "/api/feedback"
      : `${API_GATEWAY_URL}/api/feedback`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: issueTitle, body: issueBody, labels: [labels] }),
      });

      if (res.ok) {
        setResult({ ok: true });
        setTitle("");
        setBody("");
        setEmail("");
        setTimeout(onClose, 2000);
      } else {
        setResult({ ok: false, error: `Something went wrong (${res.status}). Please try again.` });
      }
    } catch {
      setResult({ ok: false, error: "Network error. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[3px]"
      onClick={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="glass-panel w-[calc(100%-2rem)] max-w-[360px] p-5 text-white animate-in"
        style={{ animation: "feedbackSlideIn 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-semibold text-sky-100 tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Send Feedback
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-600/60 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Success state */}
        {result?.ok ? (
          <div className="text-center py-4">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm text-slate-200 font-light mb-1">Thank you for your feedback!</p>
            <p className="text-xs text-slate-400 font-light">The developers will look into it as soon as possible, but they are very busy.</p>
            <button onClick={onClose} className="mt-4 text-xs text-slate-400 hover:text-slate-300 block mx-auto transition-colors">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Type selector */}
            <div className="flex gap-1.5 mb-3">
              {(Object.keys(TYPE_META) as FeedbackType[]).map((t) => {
                const meta = TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-slate-600/60 text-white shadow-sm"
                        : "bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
                    }`}
                  >
                    <svg className={`w-3.5 h-3.5 ${active ? meta.color : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={meta.icon} />
                    </svg>
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
              maxLength={100}
              className="w-full bg-slate-800/60 border border-slate-600/30 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all mb-2"
            />

            {/* Body */}
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details (optional)"
              rows={3}
              className="w-full bg-slate-800/60 border border-slate-600/30 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all resize-none mb-2"
            />

            {/* Email (optional) */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional, for follow-up)"
              className="w-full bg-slate-800/60 border border-slate-600/30 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all mb-3"
            />

            {/* Error */}
            {result?.error && (
              <p className="text-xs text-red-400 mb-2 font-light">{result.error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className="w-full bg-gradient-to-b from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white text-sm font-medium py-2.5 rounded-lg shadow-lg shadow-sky-900/20 transition-all"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>

            <p className="text-[10px] text-slate-500 text-center mt-2 font-light">
              Your feedback helps us improve
            </p>
          </>
        )}
      </div>
    </div>
  );
}
