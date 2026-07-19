/**
 * Site header: brand + theme toggle. Search lands here in Phase 5,
 * account menu in Phase 4.
 */

import { Link } from "react-router";

import { ThemeToggle } from "~/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-bold tracking-tight">
          Reel<span className="text-score-high">Score</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
