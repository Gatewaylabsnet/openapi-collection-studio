import type { FontSizePreference, ThemePreference } from "./types";

/** Apply the preference as a resolved palette so legacy styles can share one selector. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const resolvedTheme =
    preference === "system" && prefersDark
      ? "dark"
      : preference === "system"
        ? "light"
        : preference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

/** Keep the System selection aligned when the operating-system palette changes. */
export function observeThemePreference(preference: ThemePreference): () => void {
  if (preference !== "system" || !window.matchMedia) {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyThemePreference("system");
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

/** Apply the user's preferred text density without changing layout scale. */
export function applyFontSizePreference(preference: FontSizePreference): void {
  document.documentElement.dataset.fontSize = preference;
}
