<script lang="ts">
	import { goto } from '$app/navigation';

	import FeedGrid from '$lib/components/feed-grid.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Select from '$lib/components/ui/select';
	import { MAX_FEED_PAGES } from '$lib/feed.constants';
	import type { FeedItem, FeedPage } from '$lib/schemas';

	let { data } = $props();

	const SORT_LABELS = {
		popular: 'Popular',
		top_rated: 'Top Rated',
		new_releases: 'New Releases',
		upcoming: 'Upcoming'
	} as const;

	// Infinite-feed state, seeded from the SSR'd batch 1 and reset whenever
	// navigation delivers a new one (tab/sort change re-runs the load). The
	// seen-Set drops duplicates from popularity drift between fetches.
	// Capturing the initial `data` here is deliberate — the $effect below
	// handles every subsequent load.
	// svelte-ignore state_referenced_locally
	let items = $state(data.feed.items);
	// svelte-ignore state_referenced_locally
	let page = $state(data.feed.page);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(data.feed.hasMore);
	let loading = $state(false);
	// svelte-ignore state_referenced_locally
	let seen = new Set(data.feed.items.map((i) => i.tmdbId));

	$effect(() => {
		items = data.feed.items;
		page = data.feed.page;
		hasMore = data.feed.hasMore;
		seen = new Set(data.feed.items.map((i) => i.tmdbId));
	});

	async function loadMore() {
		if (loading || !hasMore) return;
		loading = true;
		try {
			const next = page + 1;
			const params = new URLSearchParams({
				type: data.query.type,
				sort: data.query.sort,
				page: String(next)
			});
			const res = await fetch(`/api/feed?${params}`);
			if (!res.ok) throw new Error(`feed fetch failed: ${res.status}`);
			const batch = (await res.json()) as FeedPage;

			const fresh = batch.items.filter((i) => !seen.has(i.tmdbId));
			for (const i of fresh) seen.add(i.tmdbId);

			items = [...items, ...fresh];
			page = next;
			hasMore = batch.hasMore && next < MAX_FEED_PAGES;
		} catch {
			// Network hiccup: stop paginating rather than retry-looping the sentinel.
			hasMore = false;
		} finally {
			loading = false;
		}
	}

	// Tab/sort changes just update URL params — the load re-runs and the
	// $effect above resets from the new batch 1. Defaults are omitted from
	// the URL to keep it clean and shareable.
	function updateParams(updates: Partial<{ type: string; sort: string }>) {
		const next = { ...data.query, ...updates };
		const params = new URLSearchParams();
		if (next.type !== 'all') params.set('type', next.type);
		if (next.sort !== 'popular') params.set('sort', next.sort);
		const qs = params.toString();
		goto(qs ? `/?${qs}` : '/', { keepFocus: true });
	}

	function openTitle(item: FeedItem) {
		// Wired to the title modal via shallow routing in the next phase.
		void item;
	}
</script>

<svelte:head>
	<title>ReelScore — audience scores, one number</title>
	<meta name="description" content="Watch what you like, not what the critics like." />
</svelte:head>

<main class="mx-auto max-w-7xl px-4 py-6">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<Tabs.Root value={data.query.type} onValueChange={(v) => updateParams({ type: v })}>
			<Tabs.List>
				<Tabs.Trigger value="all">All</Tabs.Trigger>
				<Tabs.Trigger value="movie">Movies</Tabs.Trigger>
				<Tabs.Trigger value="tv">TV Shows</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		<Select.Root
			type="single"
			value={data.query.sort}
			onValueChange={(v) => v && updateParams({ sort: v })}
		>
			<Select.Trigger class="w-40" aria-label="Sort">
				{SORT_LABELS[data.query.sort]}
			</Select.Trigger>
			<Select.Content>
				{#each Object.entries(SORT_LABELS) as [value, label] (value)}
					<Select.Item {value} {label} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<FeedGrid {items} {hasMore} {loading} onloadmore={loadMore} onselect={openTitle} />
</main>
