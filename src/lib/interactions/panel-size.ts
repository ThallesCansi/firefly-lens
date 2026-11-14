export type PanelLimits = { min: number; max: number; mobile: boolean };
export function panelLimits(
  viewport: number,
  minPanel = 320,
  maxPanel = 960,
  minMap = 320,
): PanelLimits {
  if (!Number.isFinite(viewport) || viewport < 0)
    throw new Error("Invalid workspace width");
  const max = Math.max(
    0,
    Math.min(maxPanel, viewport * 0.7, viewport - minMap),
  );
  return { min: Math.min(minPanel, max), max, mobile: viewport <= 700 };
}
export class PanelSizeController {
  private listeners = new Set<() => void>();
  private preferred: number;
  private drag: { x: number; width: number; preferred: number } | null = null;
  private state: {
    width: number;
    viewport: number;
    limits: PanelLimits;
    resizing: boolean;
  };
  constructor(
    private options: {
      defaultWidth?: number;
      minWidth?: number;
      maxWidth?: number;
      minMapWidth?: number;
    } = {},
  ) {
    this.preferred = options.defaultWidth ?? 600;
    const limits = panelLimits(
      1280,
      options.minWidth,
      options.maxWidth,
      options.minMapWidth,
    );
    this.state = {
      width: this.clamp(this.preferred, limits),
      viewport: 1280,
      limits,
      resizing: false,
    };
  }
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private clamp(width: number, limits: PanelLimits) {
    return Math.min(limits.max, Math.max(limits.min, width));
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  setViewport(viewport: number) {
    const limits = panelLimits(
      viewport,
      this.options.minWidth,
      this.options.maxWidth,
      this.options.minMapWidth,
    );
    const width = this.clamp(this.preferred, limits);
    if (viewport === this.state.viewport && width === this.state.width) return;
    this.state = { ...this.state, viewport, limits, width };
    this.emit();
  }
  setWidth(width: number) {
    if (!Number.isFinite(width)) return;
    this.preferred = this.clamp(width, this.state.limits);
    this.state = { ...this.state, width: this.preferred };
    this.emit();
  }
  begin(x: number) {
    if (this.state.limits.mobile || !Number.isFinite(x)) return;
    this.drag = { x, width: this.state.width, preferred: this.preferred };
    this.state = { ...this.state, resizing: true };
    this.emit();
  }
  update(x: number) {
    if (this.drag && Number.isFinite(x))
      this.setWidth(this.drag.width + this.drag.x - x);
  }
  end() {
    this.drag = null;
    if (this.state.resizing) {
      this.state = { ...this.state, resizing: false };
      this.emit();
    }
  }
  cancel() {
    if (!this.drag) return;
    this.preferred = this.drag.preferred;
    this.drag = null;
    this.state = {
      ...this.state,
      width: this.clamp(this.preferred, this.state.limits),
      resizing: false,
    };
    this.emit();
  }
  reset() {
    this.preferred = this.options.defaultWidth ?? 600;
    this.state = {
      ...this.state,
      width: this.clamp(this.preferred, this.state.limits),
      resizing: false,
    };
    this.drag = null;
    this.emit();
  }
}
