import { afterEach, describe, expect, it, vi } from "vitest";
import { lockTourInteractions } from "./interaction-lock";
class TestElement { matches() { return true; } }
class TestKey extends Event {
  key: string;
  ctrlKey = false;
  metaKey = false;
  constructor(key: string) { super("keydown", { cancelable: true }); this.key = key; }
}
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const window = new EventTarget();
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", { querySelector: () => new TestElement() });
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("KeyboardEvent", TestKey);
  return { window, unlock: lockTourInteractions() };
}
describe("scoped read-only interaction gate", () => {
  it("blocks outside pointer, touch and wheel events and removes every handler on exit", () => {
    const { window, unlock } = setup();
    for (const type of ["click", "pointerdown", "touchmove", "wheel"]) {
      const event = new Event(type, { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    unlock();
    const click = new Event("click", { cancelable: true });
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
  it("allows popover clicks and checkbox keys, Driver navigation and browser reload", () => {
    const { window, unlock } = setup();
    const click = new Event("click", { cancelable: true });
    click.composedPath = () => [new TestElement() as unknown as EventTarget];
    window.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    for (const key of ["Tab", "ArrowRight", "Escape", "F5", " "]) {
      const event = new TestKey(key);
      event.composedPath = () => [new TestElement() as unknown as EventTarget];
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const shortcut = new TestKey("/");
    window.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    unlock();
  });
});
