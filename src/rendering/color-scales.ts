export function snowDepthColor(depthCm: number, isPowder: boolean, baseCm = 30): [number, number, number, number] {
  if (isPowder) {
    return [0, 230, 200, 255];
  }

  // Normalize to 0-1 relative to base snowfall
  const t = Math.min(depthCm / (baseCm * 2), 1); // 0 = bare, 1 = 2x base

  // Brown (scoured/thin) → white (base) → blue (deep accumulation)
  if (t < 0.3) {
    const s = t / 0.3;
    return [
      Math.round(120 + s * 50),
      Math.round(90 + s * 50),
      Math.round(60 + s * 60),
      255,
    ];
  } else if (t < 0.6) {
    const s = (t - 0.3) / 0.3;
    return [
      Math.round(170 + s * 85),
      Math.round(140 + s * 115),
      Math.round(120 + s * 135),
      255,
    ];
  } else {
    const s = (t - 0.6) / 0.4;
    return [
      Math.round(255 - s * 100),
      Math.round(255 - s * 30),
      255,
      255,
    ];
  }
}

export function historicalSnowColor(depthCm: number): [number, number, number, number] {
  if (depthCm < 0.5) return [220, 235, 255, 30]; // near-transparent

  const t = Math.min(depthCm / 60, 1); // 0 = no snow, 1 = 60cm+

  if (t < 0.17) {
    // 0-10cm: very light → light blue
    const s = t / 0.17;
    return [
      Math.round(220 - s * 90),
      Math.round(235 - s * 55),
      Math.round(255 - s * 15),
      Math.round(80 + s * 175),
    ];
  } else if (t < 0.5) {
    // 10-30cm: light blue → medium blue
    const s = (t - 0.17) / 0.33;
    return [
      Math.round(130 - s * 80),
      Math.round(180 - s * 80),
      Math.round(240 - s * 40),
      255,
    ];
  } else {
    // 30-60cm+: medium blue → deep blue/purple
    const s = (t - 0.5) / 0.5;
    return [
      Math.round(50 - s * 20),
      Math.round(100 - s * 70),
      Math.round(200 - s * 60),
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
