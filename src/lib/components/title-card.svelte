<script lang="ts">
	import Video from '@lucide/svelte/icons/video';

	import ScoreLip, { getScoreTier, getTierBorderClass } from '$lib/components/score-lip.svelte';
	import { getImageUrl } from '$lib/tmdb';
	import type { FeedItem } from '$lib/schemas';
	import type { ScoreBreakdown } from '$lib/mdblist';
	import { cn } from '$lib/utils';

	interface Props {
		item: FeedItem;
		onselect?: (item: FeedItem) => void;
	}

	let { item, onselect }: Props = $props();

	const posterUrl = $derived(getImageUrl(item.posterPath, 'poster', 'medium'));
	const year = $derived(item.releaseDate ? new Date(item.releaseDate).getFullYear() : null);
	const isUnreleased = $derived(item.releaseDate ? new Date(item.releaseDate) > new Date() : false);
	const tier = $derived(getScoreTier(item.score, isUnreleased));
</script>

<!-- TitleCard — poster card with the score lip, title, and metadata line. -->
<button
	type="button"
	class="group relative flex cursor-pointer flex-col text-left"
	onclick={() => onselect?.(item)}
	aria-label={item.title}
>
	<!-- Score lip — right-aligned above the poster -->
	<div class="mr-2 self-end">
		<ScoreLip
			score={item.score}
			tmdbId={item.tmdbId}
			{isUnreleased}
			sourceCount={item.sourceCount}
			breakdown={item.breakdown as ScoreBreakdown | undefined}
		/>
	</div>

	<!-- Poster — top border matches the lip gradient's dark end -->
	<div
		class={cn(
			'bg-muted relative aspect-[2/3] w-full overflow-hidden rounded-lg border-t-2 shadow-lg',
			getTierBorderClass(tier)
		)}
	>
		{#if posterUrl}
			<img
				src={posterUrl}
				alt={item.title}
				loading="lazy"
				width="342"
				height="513"
				class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
			/>
		{:else}
			<div class="text-muted-foreground/40 flex h-full w-full items-center justify-center">
				<Video class="size-12" strokeWidth={1.5} />
			</div>
		{/if}
	</div>

	<h3 class="mt-2 w-full truncate text-sm leading-tight font-medium">
		{item.title}
	</h3>

	<!-- Metadata row: type • year (matches modal style) -->
	<div class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
		<span>{item.mediaType === 'tv' ? 'TV Show' : 'Movie'}</span>
		{#if year}
			<span>•</span><span>{year}</span>
		{/if}
	</div>
</button>
