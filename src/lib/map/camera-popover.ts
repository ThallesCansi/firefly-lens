export interface ScreenRect { left: number; top: number; right: number; bottom: number }
/** Prefer adjacent free space; reduce height with scrolling before covering a
 * workspace control. All coordinates are viewport pixels, including mobile. */
export function placeCameraPopover(anchor: ScreenRect, size: { width: number; height: number }, viewport: ScreenRect, obstacles: ScreenRect[]) {
  const gap = 8, edge = 12;
  const width = Math.min(size.width, viewport.right - viewport.left - edge * 2);
  const top = viewport.top + edge, bottom = viewport.bottom - edge;
  const clampX = (x: number) => Math.max(viewport.left + edge, Math.min(viewport.right - width - edge, x));
  const xs = [anchor.left - width - gap, anchor.right + gap, viewport.left + edge, viewport.right - width - edge,
    ...obstacles.flatMap((r) => [r.left - width - gap, r.right + gap])].map(clampX);
  const candidates: { left: number; top: number; width: number; maxHeight: number; score: number }[] = [];
  for (const x of new Set(xs)) {
    const blocked = obstacles.filter((r) => r.right + gap > x && r.left - gap < x + width && r.bottom > top && r.top < bottom)
      .map((r) => [Math.max(top, r.top - gap), Math.min(bottom, r.bottom + gap)])
      .sort((a, b) => a[0] - b[0]);
    let start = top;
    const free: [number, number][] = [];
    for (const [a, b] of blocked) { if (a > start) free.push([start, a]); start = Math.max(start, b); }
    if (start < bottom) free.push([start, bottom]);
    for (const [a, b] of free) {
      const height = Math.min(size.height, b - a);
      const y = Math.max(a, Math.min(b - height, anchor.bottom - height));
      candidates.push({ left: x, top: y, width, maxHeight: height,
        score: (size.height - height) * 4 + Math.abs(y + height / 2 - (anchor.top + anchor.bottom) / 2)
          + Math.abs(x + width / 2 - (anchor.left + anchor.right) / 2) * 0.2 });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? { left: clampX(anchor.left - width - gap), top, width, maxHeight: bottom - top };
}
