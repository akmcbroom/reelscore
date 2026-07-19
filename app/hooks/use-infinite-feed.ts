/**
 * Infinite feed state: appends /api/feed batches behind the SSR'd first batch,
 * deduplicating by TMDB id (popularity drift between fetches can repeat
 * titles). Resets whenever the loader hands us a new first batch (tab/sort
 * navigation re-runs the loader).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_FEED_PAGES } from "~/lib/feed.constants";
import type { FeedItem, FeedPage, FeedQuery } from "~/lib/schemas";

export function useInfiniteFeed(initial: FeedPage, query: FeedQuery) {
  const [items, setItems] = useState<FeedItem[]>(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef(new Set(initial.items.map((i) => i.tmdbId)));

  // Reset all client state when navigation delivers a new batch 1 —
  // the movie/tv/all blends overlap, and a stale seen-Set would silently
  // swallow cards on the new view.
  useEffect(() => {
    setItems(initial.items);
    setPage(initial.page);
    setHasMore(initial.hasMore);
    seenIds.current = new Set(initial.items.map((i) => i.tmdbId));
  }, [initial]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({
        type: query.type,
        sort: query.sort,
        page: String(next),
      });
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
      const data = (await res.json()) as FeedPage;

      const fresh = data.items.filter((i) => !seenIds.current.has(i.tmdbId));
      for (const i of fresh) seenIds.current.add(i.tmdbId);

      setItems((prev) => [...prev, ...fresh]);
      setPage(next);
      setHasMore(data.hasMore && next < MAX_FEED_PAGES);
    } catch {
      // Network hiccup: stop paginating rather than retry-looping the sentinel.
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, query.type, query.sort]);

  return { items, hasMore, loading, loadMore };
}
