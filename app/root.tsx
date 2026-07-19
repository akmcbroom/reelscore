import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { Header } from "~/components/header";
import { themeFromCookieHeader, applyTheme, type Theme } from "~/lib/theme";
import "./app.css";

// Geist Variable is bundled via @fontsource-variable/geist (imported in app.css) —
// no external font links needed.

export function loader({ request }: Route.LoaderArgs) {
  return { theme: themeFromCookieHeader(request.headers.get("Cookie")) };
}

/**
 * Inline no-flash script: only "system" needs client resolution before first
 * paint (SSR can't know the OS preference). Light/dark are rendered directly.
 */
const systemThemeScript = `(function(){if(document.documentElement.dataset.theme==="system"){document.documentElement.classList.toggle("dark",matchMedia("(prefers-color-scheme: dark)").matches);}})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const theme: Theme = data?.theme ?? "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={theme === "light" ? "" : "dark"}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<typeof loader>("root");

  // Track live OS theme changes while in "system" mode.
  useEffect(() => {
    if (data?.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [data?.theme]);

  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
