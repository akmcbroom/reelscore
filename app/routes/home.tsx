import { env } from "cloudflare:workers";
import { useCallback } from "react";
import { useSearchParams } from "react-router";

import type { Route } from "./+types/home";
import { FeedGrid } from "~/components/feed-grid";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useInfiniteFeed } from "~/hooks/use-infinite-feed";
import { getFeedPage } from "~/lib/feed.server";
import { feedQuerySchema } from "~/lib/schemas";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ReelScore — audience scores, one number" },
    {
      name: "description",
      content: "Watch what you like, not what the critics like.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = feedQuerySchema.parse(Object.fromEntries(url.searchParams));
  const feed = await getFeedPage(
    env.DB,
    env.TMDB_API_KEY,
    env.MDBLIST_API_KEY,
    query
  );
  return { feed, query };
}

const SORT_LABELS = {
  popular: "Popular",
  top_rated: "Top Rated",
  new_releases: "New Releases",
  upcoming: "Upcoming",
} as const;

export default function Home({ loaderData }: Route.ComponentProps) {
  const { feed, query } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const { items, hasMore, loading, loadMore } = useInfiniteFeed(feed, query);

  // Tab/sort changes just update URL params — the loader re-runs and
  // useInfiniteFeed resets from the new batch 1. Defaults are omitted from
  // the URL to keep it clean and shareable.
  const updateParams = useCallback(
    (updates: Partial<{ type: string; sort: string }>) => {
      const next = { ...query, ...updates };
      const params = new URLSearchParams();
      if (next.type !== "all") params.set("type", next.type);
      if (next.sort !== "popular") params.set("sort", next.sort);
      setSearchParams(params, { preventScrollReset: false });
    },
    [query, setSearchParams]
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={query.type} onValueChange={(v) => updateParams({ type: v })}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="movie">Movies</TabsTrigger>
            <TabsTrigger value="tv">TV Shows</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={query.sort} onValueChange={(v) => updateParams({ sort: v })}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FeedGrid
        items={items}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={loadMore}
      />
    </main>
  );
}
