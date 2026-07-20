<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TitleCard from '$lib/components/title-card.svelte';
	import type { FeedItem } from '$lib/schemas';

	interface Props {
		items: FeedItem[];
		hasMore: boolean;
		loading: boolean;
		onloadmore: () => void;
		onselect?: (item: FeedItem) => void;
	}

	let { items, hasMore, loading, onloadmore, onselect }: Props = $props();

	let sentinel = $state<HTMLElement>();

	// Observe the sentinel; the effect re-runs when loading flips, so a
	// still-visible sentinel triggers the next batch after each load.
	$effect(() => {
		if (!sentinel || !hasMore) return;
		const isLoading = loading;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && !isLoading) onloadmore();
			},
			{ rootMargin: '600px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<!-- FeedGrid — responsive title grid with an IntersectionObserver sentinel
     for infinite scroll and skeleton cards while a batch loads. -->
<div>
	<div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
		{#each items as item (item.tmdbId)}
			<TitleCard {item} {onselect} />
		{/each}
		{#if loading}
			{#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
				<div class="flex flex-col">
					<Skeleton class="mt-[23px] aspect-[2/3] w-full rounded-lg" />
					<Skeleton class="mt-2 h-4 w-3/4" />
					<Skeleton class="mt-1 h-3 w-1/2" />
				</div>
			{/each}
		{/if}
	</div>

	{#if hasMore}
		<div bind:this={sentinel} class="h-px"></div>
	{:else if items.length > 0}
		<p class="text-muted-foreground py-10 text-center text-sm">You've reached the end.</p>
	{/if}
</div>
