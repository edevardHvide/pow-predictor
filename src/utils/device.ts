// src/utils/device.ts
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const narrowScreen = window.matchMedia("(max-width: 768px)").matches;
  const touch = navigator.maxTouchPoints > 0;
  return narrowScreen && touch;
}

export const MOBILE_CELL_SIZE = 120;   // meters (vs 75m desktop)
export const DESKTOP_CELL_SIZE = 75;   // meters
export const MOBILE_PARTICLE_COUNT = 2000;
export const DESKTOP_PARTICLE_COUNT = 6000;
