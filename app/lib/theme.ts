/**
 * Theme system: cookie-persisted light/dark/system with dark as the default.
 *
 * The cookie is plain (not HttpOnly) on purpose — the client writes it directly
 * via `document.cookie` when the user toggles, and the root loader reads it on
 * the next SSR pass. No API round-trip needed for a preference this trivial.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "theme";

/** Coerce any stored value to a valid theme. ReelScore is dark-first, so unknown/absent → "dark". */
export function parseTheme(value: string | undefined | null): Theme {
  return value === "light" || value === "system" ? value : "dark";
}

/** Extract the theme from a raw Cookie header (server side, in the root loader). */
export function themeFromCookieHeader(cookieHeader: string | null): Theme {
  const match = cookieHeader?.match(/(?:^|;\s*)theme=([^;]+)/);
  return parseTheme(match?.[1]);
}

/** Persist the theme client-side and apply the `dark` class immediately. */
export function setTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  applyTheme(theme);
}

/** Apply the resolved theme class to <html>. "system" resolves via matchMedia. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
}
