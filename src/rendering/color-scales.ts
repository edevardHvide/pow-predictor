export function snowDepthColor(depth: number, isPowder: boolean): [number, number, number, number] {
  if (isPowder) {
    return [0, 230, 200, 255];
  }

  // Brown (scoured) -> white (moderate) -> blue (deep snow)
  if (depth < 0.3) {
    const t = depth / 0.3;
    return [
      Math.round(120 + t * 50),
      Math.round(90 + t * 50),
      Math.round(60 + t * 60),
      255,
    ];
  } else if (depth < 0.6) {
    const t = (depth - 0.3) / 0.3;
    return [
      Math.round(170 + t * 85),
      Math.round(140 + t * 115),
      Math.round(120 + t * 135),
      255,
    ];
  } else {
    const t = (depth - 0.6) / 0.4;
    return [
      Math.round(255 - t * 100),
      Math.round(255 - t * 30),
      255,
      255,
    ];
  }
}

export function windSpeedColor(speedMs: number): [number, number, number, number] {
  const t = Math.min(speedMs / 25, 1);

  if (t < 0.33) {
    const s = t / 0.33;
    return [Math.round(30 + s * 30), Math.round(120 + s * 135), 255, 255];
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [Math.round(60 + s * 195), 255, Math.round(255 - s * 100), 255];
  } else {
    const s = (t - 0.66) / 0.34;
    return [255, Math.round(255 - s * 200), Math.round(155 - s * 135), 255];
  }
}
