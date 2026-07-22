// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFontSizePreference, applyThemePreference, observeThemePreference } from "./theme";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.style.removeProperty("color-scheme");
  vi.unstubAllGlobals();
});

describe("applyThemePreference", () => {
  it("uses the explicit palette", () => {
    applyThemePreference("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resolves System from the operating-system preference", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    applyThemePreference("system");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("observes an operating-system change for the System preference", () => {
    let listener: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: vi.fn((_event: string, callback: () => void) => { listener = callback; }),
      removeEventListener: vi.fn()
    };
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    const stop = observeThemePreference("system");
    media.matches = true;
    listener?.();

    expect(document.documentElement.dataset.theme).toBe("dark");
    stop();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

describe("applyFontSizePreference", () => {
  it("stores the selected text density on the document root", () => {
    applyFontSizePreference("compact");

    expect(document.documentElement.dataset.fontSize).toBe("compact");
  });
});
