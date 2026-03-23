import {
  Cartesian3,
  Color,
  NearFarScalar,
  PointPrimitiveCollection,
  type Viewer,
  type PointPrimitive,
} from "cesium";
import type { ParticlePool } from "../simulation/wind-particles.ts";
import { windSpeedColor } from "./color-scales.ts";

let points: PointPrimitiveCollection | null = null;
let pointRefs: PointPrimitive[] = [];
let addedToScene = false;

export function initWindParticles(
  viewer: Viewer,
  particleCount: number,
): void {
  removeWindParticles(viewer);

  points = new PointPrimitiveCollection();
  pointRefs = [];

  for (let i = 0; i < particleCount; i++) {
    const p = points.add({
      position: Cartesian3.ZERO,
      pixelSize: 6,
      color: Color.CYAN,
      show: false,
      // Disable depth test so points render on top of terrain
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(1000, 1.0, 50000, 0.4),
    });
    pointRefs.push(p);
  }

  viewer.scene.primitives.add(points);
  addedToScene = true;
  console.log(`Wind particles initialized: ${particleCount} points`);
}

export function updateWindParticles(
  viewer: Viewer,
  pool: ParticlePool,
): void {
  if (!points || !addedToScene) {
    initWindParticles(viewer, pool.particles.length);
  }

  const particles = pool.particles;
  let visibleCount = 0;

  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];
    const point = pointRefs[i];
    if (!point) continue;

    const trail = particle.trail;
    if (trail.length === 0) {
      point.show = false;
      continue;
    }

    const pos = trail[trail.length - 1];

    // Validate position
    if (!isFinite(pos.lat) || !isFinite(pos.lng) || !isFinite(pos.height)) {
      point.show = false;
      continue;
    }

    point.position = Cartesian3.fromDegrees(pos.lng, pos.lat, pos.height);
    point.show = true;
    visibleCount++;

    const [r, g, b, a] = windSpeedColor(particle.speed);
    point.color = new Color(r / 255, g / 255, b / 255, a / 255);
    point.pixelSize = 5 + Math.min(particle.speed / 3, 7);
  }

  // Log once on first update
  if (!updateWindParticles._logged && visibleCount > 0) {
    console.log(`Wind particles rendering: ${visibleCount}/${particles.length} visible`);
    updateWindParticles._logged = true;
  }
}
updateWindParticles._logged = false;

export function removeWindParticles(viewer: Viewer): void {
  if (points && addedToScene) {
    viewer.scene.primitives.remove(points);
  }
  points = null;
  pointRefs = [];
  addedToScene = false;
  updateWindParticles._logged = false;
}
