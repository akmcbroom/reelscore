import type { Handle } from "@sveltejs/kit";

import { themeFromCookieHeader } from "$lib/theme";

/**
 * Stamps the theme onto the HTML shell during SSR — the app.html placeholders
 * %reelscore.theme%/%reelscore.theme.class% become the cookie's value, so
 * light/dark render with zero flash (system resolves via the inline script).
 */
export const handle: Handle = async ({ event, resolve }) => {
  const theme = themeFromCookieHeader(event.request.headers.get("cookie"));

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace("%reelscore.theme.class%", theme === "light" ? "" : "dark")
        .replace("%reelscore.theme%", theme),
  });
};
