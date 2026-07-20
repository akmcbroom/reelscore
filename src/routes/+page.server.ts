import type { PageServerLoad } from "./$types";

import { getFeedPage } from "$lib/server/feed";
import { feedQuerySchema } from "$lib/schemas";

/**
 * SSR batch 1 of the feed. Reads ONLY the type/sort params — SvelteKit tracks
 * search-param reads individually, so modal params (?title/?mt, managed via
 * shallow routing) never re-run this (expensive) load.
 */
export const load: PageServerLoad = async ({ url, platform }) => {
  const query = feedQuerySchema.parse({
    type: url.searchParams.get("type") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });

  const { env } = platform!;
  const feed = await getFeedPage(
    env.DB,
    env.TMDB_API_KEY,
    env.MDBLIST_API_KEY,
    query
  );

  return { feed, query };
};
