import { API_GATEWAY_URL } from "../api/nve.ts";

const ERRORS_ENDPOINT = import.meta.env.DEV
  ? "/api/errors"
  : `${API_GATEWAY_URL}/api/errors`;

const MAX_ERRORS_PER_SESSION = 10;
let errorCount = 0;
const errorQueue: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const seen = new Set<string>();

function dedupeKey(error: Record<string, unknown>): string {
  return `${error.message}|${error.source}|${error.lineno}`;
}

function enqueue(error: Record<string, unknown>) {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  const key = dedupeKey(error);
  if (seen.has(key)) return;
  seen.add(key);
  errorCount++;
  errorQueue.push(error);

  // Batch: flush after 2s or when queue hits 5
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 2000);
  }
  if (errorQueue.length >= 5) {
    flush();
  }
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (errorQueue.length === 0) return;

  const batch = errorQueue.splice(0);
  fetch(ERRORS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errors: batch }),
    keepalive: true,
  }).catch(() => {
    // Silently fail — don't create error loops
  });
}

export function initErrorReporter() {
  window.addEventListener("error", (event) => {
    enqueue({
      type: "uncaught",
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack || "",
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    enqueue({
      type: "unhandledrejection",
      message: reason?.message || String(reason),
      stack: reason?.stack || "",
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    });
  });
}

/** Report a caught error explicitly. Named sendErrorReport to avoid collision with window.reportError. */
export function sendErrorReport(error: Error, context?: string) {
  enqueue({
    type: "caught",
    message: error.message,
    stack: error.stack || "",
    context: context || "",
    url: location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  });
}
