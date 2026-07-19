/**
 * TitleCard — poster card with the score lip, title, and metadata line.
 * The primary card used across the discovery feed. See docs/PRD.md §3.
 */

import { Video } from "lucide-react";

import { getImageUrl } from "~/lib/tmdb";
import type { FeedItem } from "~/lib/schemas";
import type { ScoreBreakdown } from "~/lib/mdblist";
import {
  ScoreLip,
  getScoreTier,
  getTierBorderClass,
} from "~/components/score-badge";
import { cn } from "~/lib/utils";

interface TitleCardProps {
  item: FeedItem;
  onSelect?: (item: FeedItem) => void;
}

export function TitleCard({ item, onSelect }: TitleCardProps) {
  const posterUrl = getImageUrl(item.posterPath, "poster", "medium");
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
  const isUnreleased = item.releaseDate
    ? new Date(item.releaseDate) > new Date()
    : false;
  const tier = getScoreTier(item.score, isUnreleased);

  return (
    <button
      type="button"
      className="group relative flex flex-col text-left cursor-pointer"
      onClick={() => onSelect?.(item)}
      aria-label={item.title}
    >
      {/* Score lip — right-aligned above the poster */}
      <div className="self-end mr-2">
        <ScoreLip
          score={item.score}
          tmdbId={item.tmdbId}
          isUnreleased={isUnreleased}
          sourceCount={item.sourceCount}
          breakdown={item.breakdown as ScoreBreakdown | undefined}
        />
      </div>

      {/* Poster — top border matches the lip gradient's dark end */}
      <div
        className={cn(
          "relative w-full overflow-hidden bg-muted aspect-[2/3] rounded-lg shadow-lg border-t-2",
          getTierBorderClass(tier)
        )}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={item.title}
            loading="lazy"
            width="342"
            height="513"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Video className="size-12" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <h3 className="mt-2 w-full text-sm font-medium truncate leading-tight">
        {item.title}
      </h3>

      {/* Metadata row: type • year (matches modal style) */}
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <span>{item.mediaType === "tv" ? "TV Show" : "Movie"}</span>
        {year && (
          <>
            <span>•</span>
            <span>{year}</span>
          </>
        )}
      </div>
    </button>
  );
}
