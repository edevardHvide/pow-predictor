// src/hooks/useHistoricalSim.ts
import { useState, useCallback, useRef } from "react";
import type { WindField } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { WeatherTimeSeries } from "../api/nve.ts";
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

  const run = useCallback(
    (weather: WeatherTimeSeries) => {
      const worker = workerRef.current;
      if (!worker) return;

      setLoading(true);
      setProgress({ stage: "Computing simulation...", percent: 0 });

      // Remove any previous listener
      if (listenerRef.current) {
        worker.removeEventListener("message", listenerRef.current);
      }

      const handler = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        // Only handle historical message types
        if (msg.type === "historical-progress") {
          setProgress({ stage: msg.stage, percent: msg.percent });
        } else if (msg.type === "historical-result") {
          const converted = msg.steps.map((s) =>
            stepDataToStep(s, msg.rows, msg.cols, msg.layers, msg.layerHeights),
          );
          setSteps(converted);
          setCurrentStep(0);
          setLoading(false);
          setProgress(null);
          worker.removeEventListener("message", handler);
          listenerRef.current = null;
        } else if (msg.type === "error") {
          console.error("Historical sim error:", msg.message);
          setLoading(false);
          setProgress(null);
          worker.removeEventListener("message", handler);
          listenerRef.current = null;
        }
      };

      listenerRef.current = handler;
      worker.addEventListener("message", handler);

      // Send weather data — convert Dates to epoch ms
      worker.postMessage({
        type: "run-historical",
        weather: {
          timestamps: weather.timestamps.map((d) => d.getTime()),
          temp: Float64Array.from(weather.temp),
          precip: Float64Array.from(weather.precip),
          windSpeed: Float64Array.from(weather.windSpeed),
          windDir: Float64Array.from(weather.windDir),
          altitude: weather.altitude,
        },
      });
    },
    [workerRef],
  );

  const reset = useCallback(() => {
    // Cancel in-flight worker computation
    const worker = workerRef.current;
    if (worker && listenerRef.current) {
      worker.postMessage({ type: "cancel" });
      worker.removeEventListener("message", listenerRef.current);
      listenerRef.current = null;
    }
    setSteps(null);
    setCurrentStep(0);
    setLoading(false);
    setProgress(null);
  }, [workerRef]);

  return { steps, currentStep, setCurrentStep, loading, progress, run, reset };
}
