/**
 * ScoreLip — the signature ReelScore element and the ONE sanctioned custom
 * visual (DECISIONS 2026-07-19). A gradient tab with concave curves on both
 * sides, sitting on the poster/backdrop top edge. Shows the score, a clock
 * icon (unreleased), or "—" (insufficient sources).
 */

import { getSourceLabel } from "~/lib/scoring";
import type { ScoreBreakdown } from "~/lib/mdblist";

/** Gradient stops per tier — light (top) → dark (bottom). */
const SCORE_TIERS = {
  green: { from: "#22c55e", to: "#166534", border: "border-green-800", text: "rgba(255,255,255,0.9)" },
  gold: { from: "#f59e0b", to: "#92400e", border: "border-amber-800", text: "rgba(255,255,255,0.9)" },
  red: { from: "#ef4444", to: "#991b1b", border: "border-red-800", text: "rgba(255,255,255,0.9)" },
  none: { from: "#525252", to: "#262626", border: "border-neutral-800", text: "rgba(255,255,255,0.6)" },
} as const;

export type ScoreTierName = keyof typeof SCORE_TIERS;

/** Resolves the display tier for a score/release state. */
export function getScoreTier(
  score: number | null,
  isUnreleased: boolean
): ScoreTierName {
  if (isUnreleased || score === null) return "none";
  if (score >= 70) return "green";
  if (score >= 60) return "gold";
  return "red";
}

/** Poster/backdrop top-border class matching the tier's dark gradient end. */
export function getTierBorderClass(tier: ScoreTierName): string {
  return SCORE_TIERS[tier].border;
}

interface ScoreLipProps {
  /** Base ReelScore 0–100, or null when insufficient sources */
  score: number | null;
  /** Namespaces the SVG gradient id — use the tmdbId (60+ cards per page) */
  tmdbId: number;
  isUnreleased?: boolean;
  sourceCount?: number;
  /** Full score math — renders a hover tooltip in dev builds only */
  breakdown?: ScoreBreakdown;
  /** "card" (70×23) or "modal" (larger, for the title modal header) */
  size?: "card" | "modal";
}

export function ScoreLip({
  score,
  tmdbId,
  isUnreleased = false,
  sourceCount = 0,
  breakdown,
  size = "card",
}: ScoreLipProps) {
  const tier = SCORE_TIERS[getScoreTier(score, isUnreleased)];
  const gradId = `grad-${size}-${tmdbId}`;
  const hasScore = score !== null && !isUnreleased;

  let tooltip = isUnreleased
    ? "Not yet released"
    : hasScore
      ? `ReelScore: ${score}`
      : "Not enough ratings";
  if (import.meta.env.DEV && breakdown) {
    const perSource = breakdown.sources
      .map((s) => `${getSourceLabel(s.source)}: ${s.normalizedScore}`)
      .join(" | ");
    tooltip = hasScore
      ? `ReelScore: ${score} (${sourceCount} sources)\n${perSource}\nweighted avg ${breakdown.weightedAverage}, reliability ${breakdown.reliabilityAdjustment >= 0 ? "+" : ""}${breakdown.reliabilityAdjustment}`
      : `Insufficient sources (${sourceCount}/2)\n${perSource}`;
  }

  const dims =
    size === "modal"
      ? { width: 96, height: 32, fontSize: 17 }
      : { width: 70, height: 23, fontSize: 15 };

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox="0 0 84 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{tooltip}</title>
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="0"
          x2="0"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={tier.from} />
          <stop offset="100%" stopColor={tier.to} />
        </linearGradient>
      </defs>
      {/* The branded concave-sided tab shape */}
      <path
        d="M56 0C63.6112 0 69.8035 6.07368 69.9951 13.6387L70.0049 14.3613C70.1965 21.9263 76.3888 28 84 28H0C7.61118 28 13.8035 21.9263 13.9951 14.3613L14.0049 13.6387C14.1965 6.07368 20.3888 0 28 0H56Z"
        fill={`url(#${gradId})`}
      />
      {isUnreleased ? (
        <g transform="translate(33.6, 5.6) scale(0.7)">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="2.5"
            fill="none"
          />
          <polyline
            points="12 6 12 12 16 14"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      ) : (
        <text
          x="42"
          y="14"
          textAnchor="middle"
          dominantBaseline="central"
          fill={tier.text}
          fontSize={dims.fontSize}
          fontFamily="ui-monospace, monospace"
          fontWeight="bold"
        >
          {hasScore ? score : "—"}
        </text>
      )}
    </svg>
  );
}
