// src/hooks/useHistoricalSim.ts
import { useState, useCallback, useRef } from "react";
import type { WindField } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { SpatialWeatherTimeSeries } from "../api/nve.ts";
import type { WorkerResponse, HistoricalStepData } from "../simulation/worker-protocol.ts";

export interface HistoricalStep {
  timestamp: Date;
  temp: number;
  precip: number;
  windSpeed: number;
  windDir: number;
  snowGrid: SnowDepthGrid;
  windField: WindField;
}

function stepDataToStep(
  d: HistoricalStepData,
  rows: number,
  cols: number,
  layers: number,
  layerHeights: number[],
): HistoricalStep {
  return {
    timestamp: new Date(d.timestamp),
    temp: d.temp,
    precip: d.precip,
    windSpeed: d.windSpeed,
    windDir: d.windDir,
    snowGrid: { depth: d.snowDepth, isPowderZone: d.isPowderZone, rows, cols },
    windField: {
      u: d.windU,
      v: d.windV,
      w: d.windW,
      exposure: d.exposure,
      rows,
      cols,
      layers,
      layerHeights,
    },
  };
}

export function useHistoricalSim(workerRef: { current: Worker | null }) {
  const [steps, setSteps] = useState<HistoricalStep[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number } | null>(null);

  const listenerRef = useRef<((e: MessageEvent<WorkerResponse>) => void) | null>(null);
  const silentRef = useRef(false);

  const run = useCallback(
    (weather: SpatialWeatherTimeSeries, options?: { silent?: boolean }) => {
      const worker = workerRef.current;
      if (!worker) return;

      const silent = options?.silent ?? false;
      silentRef.current = silent;

      if (!silent) {
        setLoading(true);
        setProgress({ stage: "Computing simulation...", percent: 0 });
      }

      // Remove any previous listener
      if (listenerRef.current) {
        worker.removeEventListener("message", listenerRef.current);
      }

      const handler = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "historical-progress") {
          // Only update UI if not silent
          if (!silentRef.current) {
            setProgress({ stage: msg.stage, percent: msg.percent });
          }
        } else if (msg.type === "historical-result") {
          const converted = msg.steps.map((s) =>
            stepDataToStep(s, msg.rows, msg.cols, msg.layers, msg.layerHeights),
          );
          setSteps(converted);
          // Default to the step closest to "now"
          const now = Date.now();
          let nowIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < converted.length; i++) {
            const dist = Math.abs(converted[i].timestamp.getTime() - now);
            if (dist < minDist) { minDist = dist; nowIdx = i; }
          }
          setCurrentStep(nowIdx);
          setLoading(false);
          setProgress(null);
          silentRef.current = false;
          worker.removeEventListener("message", handler);
          listenerRef.current = null;
        } else if (msg.type === "error") {
          console.error("Historical sim error:", msg.message);
          setLoading(false);
          setProgress(null);
          silentRef.current = false;
          worker.removeEventListener("message", handler);
          listenerRef.current = null;
        }
      };

      listenerRef.current = handler;
      worker.addEventListener("message", handler);

      // Convert stations to worker format with typed arrays
      const stationData = weather.stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        altitude: s.altitude,
        temp: Float64Array.from(s.temp),
        precip: Float64Array.from(s.precip),
        windSpeed: Float64Array.from(s.windSpeed),
        windDir: Float64Array.from(s.windDir),
      }));

      worker.postMessage({
        type: "run-historical",
        weather: {
          timestamps: weather.timestamps.map((d) => d.getTime()),
          stations: stationData,
        },
      });
    },
    [workerRef],
  );

  // Transition from silent to visible — show progress if sim is still in-flight
  const reveal = useCallback(() => {
    if (listenerRef.current && silentRef.current) {
      silentRef.current = false;
      setLoading(true);
      setProgress({ stage: "Computing simulation...", percent: 0 });
    }
  }, []);

  // True if a sim is running (silent or visible)
  const running = listenerRef.current !== null;

  const reset = useCallback(() => {
    const worker = workerRef.current;
    if (worker && listenerRef.current) {
      worker.postMessage({ type: "cancel" });
      worker.removeEventListener("message", listenerRef.current);
      listenerRef.current = null;
    }
    silentRef.current = false;
    setSteps(null);
    setCurrentStep(0);
    setLoading(false);
    setProgress(null);
  }, [workerRef]);

  return { steps, currentStep, setCurrentStep, loading, progress, run, reveal, running, reset };
}
