import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initErrorReporter } from "./utils/error-reporter.ts";

initErrorReporter();

// No StrictMode — Cesium's Viewer does direct DOM manipulation
// that conflicts with React's double-mount in development
createRoot(document.getElementById("root")!).render(<App />);
