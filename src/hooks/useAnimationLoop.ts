import { useEffect, useRef } from "react";

export function useAnimationLoop(
  callback: () => void,
  active: boolean,
  fps = 30,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;

    let rafId: number;
    let lastTime = 0;
    const interval = 1000 / fps;

    function loop(time: number) {
      rafId = requestAnimationFrame(loop);
      if (time - lastTime < interval) return;
      lastTime = time;
      callbackRef.current();
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [active, fps]);
}
