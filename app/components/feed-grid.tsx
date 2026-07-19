/**
 * FeedGrid — responsive title grid with an IntersectionObserver sentinel for
 * infinite scroll and skeleton cards while a batch loads.
 */

import { useEffect, useRef } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { TitleCard } from "~/components/title-card";
import type { FeedItem } from "~/lib/schemas";

const GRID_CLASSES =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6";

interface FeedGridProps {
  items: FeedItem[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onSelect?: (item: FeedItem) => void;
}

export function FeedGrid({
  items,
  hasMore,
  loading,
  onLoadMore,
  onSelect,
}: FeedGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Observe the sentinel; guard against firing while a fetch is in flight —
  // the loading dep re-creates the observer after each batch so a still-visible
  // sentinel triggers the next load.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loading) onLoadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  return (
    <div>
      <div className={GRID_CLASSES}>
        {items.map((item) => (
          <TitleCard key={item.tmdbId} item={item} onSelect={onSelect} />
        ))}
        {loading &&
          Array.from({ length: 12 }, (_, i) => (
            <div key={`skeleton-${i}`} className="flex flex-col">
              <Skeleton className="mt-[23px] aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-1 h-3 w-1/2" />
            </div>
          ))}
      </div>

      {hasMore && <div ref={sentinelRef} className="h-px" />}

      {!hasMore && items.length > 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          You've reached the end.
        </p>
      )}
    </div>
  );
}
