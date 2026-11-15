/**
 * The glow under unusually high cells: a slow breath, like a firefly, never a
 * flash. One cycle takes 2.6 s, far below the three flashes per second that
 * accessibility guidance sets as the limit, and the glow never goes fully out.
 */
export const GLOW = {
  /** Milliseconds per breath. */
  period: 2600,
  min: 0.28,
  max: 0.8,
  /** Steady opacity when motion is reduced or the breath is paused. */
  rest: 0.6,
  /** Milliseconds between repaints: about 22 a second is smooth for a slow fade and spares the GPU. */
  step: 45,
};

/** Opacity of the glow at a moment in time. */
export function glowAt(ms: number): number {
  const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * ms) / GLOW.period);
  return GLOW.min + (GLOW.max - GLOW.min) * wave;
}
