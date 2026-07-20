<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import User from '@lucide/svelte/icons/user';
	import X from '@lucide/svelte/icons/x';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ScoreLip, { getScoreTier, getTierBorderClass } from '$lib/components/score-lip.svelte';
	import { getImageUrl } from '$lib/tmdb';
	import type { Episode, SeasonResponse, TitleDetail } from '$lib/schemas';
	import type { ScoreBreakdown } from '$lib/mdblist';
	import { cn } from '$lib/utils';

	interface Props {
		tmdbId: number;
		mediaType: 'movie' | 'tv';
		onclose: () => void;
	}

	let { tmdbId, mediaType, onclose }: Props = $props();

	let detail = $state<TitleDetail | null>(null);
	let trailerOpen = $state(false);
	let overviewOpen = $state(false);
	let episode = $state<Episode | null>(null);

	// Seasons state (TV only)
	let activeSeason = $state<number | null>(null);
	let episodes = $state<Episode[] | null>(null);

	$effect(() => {
		const id = tmdbId;
		const mt = mediaType;
		detail = null;
		activeSeason = null;
		let cancelled = false;
		fetch(`/api/title/${id}?type=${mt}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (cancelled) return;
				detail = data as TitleDetail | null;
				if (!detail) onclose();
				else if (detail.seasons.length > 0) activeSeason = detail.seasons[0]!.seasonNumber;
			})
			.catch(() => {
				if (!cancelled) onclose();
			});
		return () => {
			cancelled = true;
		};
	});

	// Fetch episodes whenever the active season changes.
	$effect(() => {
		const season = activeSeason;
		if (season === null) return;
		const id = tmdbId;
		episodes = null;
		let cancelled = false;
		fetch(`/api/season/${id}?season=${season}`)
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!cancelled) episodes = (data as SeasonResponse | null)?.episodes ?? [];
			})
			.catch(() => {
				if (!cancelled) episodes = [];
			});
		return () => {
			cancelled = true;
		};
	});

	const isUnreleased = $derived(
		detail?.releaseDate ? new Date(detail.releaseDate) > new Date() : false
	);
	const tier = $derived(getScoreTier(detail?.score ?? null, isUnreleased));
	const backdropUrl = $derived(detail ? getImageUrl(detail.backdropPath, 'backdrop', 'large') : null);
	const logoUrl = $derived(detail ? getImageUrl(detail.logoPath, 'logo', 'original') : null);
	const year = $derived(detail?.releaseDate ? new Date(detail.releaseDate).getFullYear() : null);
	const runtimeDisplay = $derived.by(() => {
		if (!detail?.runtime || detail.mediaType !== 'movie') return null;
		const hrs = Math.floor(detail.runtime / 60);
		const mins = detail.runtime % 60;
		return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
	});

	function formatAirDate(date: string | null): string {
		return date
			? new Date(date).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: '';
	}
</script>

<!--
	TitleModal — the inline title detail dialog (docs/PRD.md §4). Opened via
	shallow routing (?title=…&mt=…) so links are shareable and back closes it.
-->
<Dialog.Root open onOpenChange={(open) => !open && onclose()}>
	<Dialog.Content
		showCloseButton={false}
		class="max-w-[calc(100%-2rem)] gap-0 overflow-visible p-0 sm:max-w-2xl"
	>
		<Dialog.Title class="sr-only">{detail?.title ?? 'Title details'}</Dialog.Title>

		{#if !detail}
			<div class="p-4">
				<Skeleton class="aspect-video w-full rounded-lg" />
				<Skeleton class="mt-4 h-6 w-1/2" />
				<Skeleton class="mt-2 h-4 w-3/4" />
				<Skeleton class="mt-6 h-20 w-full" />
			</div>
		{:else}
			<!-- min-w-0: grid items default to min-width:auto, so the episode
			     carousel's min-content width would blow the dialog out sideways -->
			<div class="flex max-h-[85svh] min-w-0 flex-col">
				<!-- Backdrop header -->
				<div class="relative shrink-0">
					<div
						class={cn(
							'bg-muted relative aspect-video w-full overflow-hidden rounded-t-xl border-t-4',
							getTierBorderClass(tier)
						)}
					>
						{#if backdropUrl}
							<img src={backdropUrl} alt="" class="h-full w-full object-cover" />
						{/if}
						<!-- Dark gradient so the overlaid text stays readable in both themes -->
						<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
					</div>

					<!-- Score lip — extends above the modal edge -->
					<div class="absolute -top-7 right-4 z-20">
						<ScoreLip
							score={detail.score}
							tmdbId={detail.tmdbId}
							{isUnreleased}
							sourceCount={detail.sourceCount}
							breakdown={detail.breakdown as ScoreBreakdown | undefined}
							size="modal"
						/>
					</div>

					<button
						type="button"
						onclick={onclose}
						aria-label="Close"
						class="absolute top-3 right-3 z-20 rounded-full bg-black/50 p-1.5 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
					>
						<X class="size-5" />
					</button>

					<!-- Title info overlay — always over the dark backdrop, so white text -->
					<div class="absolute inset-x-0 bottom-0 p-4 sm:p-6">
						<div class="max-w-md">
							{#if logoUrl}
								<img
									src={logoUrl}
									alt={detail.title}
									class="max-h-22 min-h-12 w-auto max-w-44 object-contain object-left"
								/>
							{:else}
								<h2 class="text-xl leading-tight font-bold text-white sm:text-2xl">
									{detail.title}
								</h2>
							{/if}

							<div class="mt-2 flex flex-wrap items-center gap-1 text-sm text-white/60">
								<span>{detail.mediaType === 'tv' ? 'TV Show' : 'Movie'}</span>
								{#if year}<span>•</span><span>{year}</span>{/if}
								{#if runtimeDisplay}<span>•</span><span>{runtimeDisplay}</span>{/if}
								{#if detail.contentRating}
									<span>•</span>
									<span class="rounded border border-white/60 px-0.5 py-0.5 text-xs leading-none font-bold">
										{detail.contentRating}
									</span>
								{/if}
							</div>

							{#if detail.genres.length > 0}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each detail.genres as genre (genre.id)}
										<Badge variant="secondary" class="bg-white/10 text-white backdrop-blur">
											{genre.name}
										</Badge>
									{/each}
								</div>
							{/if}

							{#if detail.overview}
								<button
									type="button"
									onclick={() => (overviewOpen = true)}
									title="Click to read full overview"
									class="mt-2 line-clamp-2 cursor-pointer text-left text-sm leading-tight text-white/70 transition-colors hover:text-white/90"
								>
									{detail.overview}
								</button>
							{/if}

							{#if detail.trailerKey || detail.providers.length > 0}
								<div class="mt-2.5 flex flex-wrap items-center gap-2">
									{#if detail.trailerKey}
										<Button size="sm" onclick={() => (trailerOpen = true)}>
											<Play class="size-4" /> Watch Trailer
										</Button>
									{/if}
									{#each detail.providers as provider (provider.id)}
										{@const providerLogo = getImageUrl(provider.logoPath, 'logo', 'small')}
										{#if providerLogo}
											<img
												src={providerLogo}
												alt={provider.name}
												title={provider.name}
												loading="lazy"
												class="size-8 rounded-md"
											/>
										{/if}
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Scrollable body -->
				<div class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
					{#if detail.directors.length > 0}
						<div class="flex flex-col gap-3">
							{#each detail.directors as director (director.id)}
								<div class="flex items-center gap-3">
									{@render personPhoto(director.name, director.profilePath, 'size-10 shrink-0')}
									<div>
										<p class="text-muted-foreground text-xs">Director</p>
										<p class="text-sm font-medium">{director.name}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					{#if detail.mediaType === 'tv' && detail.seasons.length > 0}
						<div>
							<h3 class="text-muted-foreground mb-2 text-sm font-semibold">Seasons</h3>
							<div class="flex gap-2 overflow-x-auto pb-2">
								{#each detail.seasons as season (season.seasonNumber)}
									<Button
										size="sm"
										variant={season.seasonNumber === activeSeason ? 'default' : 'secondary'}
										class="shrink-0 rounded-full"
										onclick={() => (activeSeason = season.seasonNumber)}
									>
										{season.seasonNumber}
									</Button>
								{/each}
							</div>
							<div class="mt-2 flex gap-3 overflow-x-auto pb-2">
								{#if episodes === null}
									{#each Array.from({ length: 4 }, (_, i) => i) as i (i)}
										<div class="w-40 shrink-0">
											<Skeleton class="aspect-video rounded-md" />
											<Skeleton class="mt-1.5 h-3 w-16" />
											<Skeleton class="mt-1 h-3.5 w-32" />
										</div>
									{/each}
								{:else}
									{#each episodes as ep (ep.id)}
										{@const still = getImageUrl(ep.stillPath, 'backdrop', 'small')}
										<button
											type="button"
											onclick={() => (episode = ep)}
											class="w-40 shrink-0 text-left"
										>
											<div class="bg-muted aspect-video overflow-hidden rounded-md">
												{#if still}
													<img src={still} alt={ep.name} loading="lazy" class="h-full w-full object-cover" />
												{/if}
											</div>
											<p class="text-muted-foreground mt-1.5 text-xs">Episode {ep.episodeNumber}</p>
											<p class="truncate text-sm font-medium">{ep.name}</p>
										</button>
									{/each}
								{/if}
							</div>
						</div>
					{/if}

					{#if detail.cast.length > 0}
						<div>
							<h3 class="text-muted-foreground mb-3 text-sm font-semibold">Cast</h3>
							<div class="flex gap-4 overflow-x-auto pb-2">
								{#each detail.cast as member (member.id)}
									<div class="w-20 shrink-0 text-center">
										{@render personPhoto(member.name, member.profilePath, 'mx-auto size-20')}
										<p class="mt-1.5 truncate text-xs font-medium">{member.name}</p>
										<p class="text-muted-foreground truncate text-[10px]">{member.character}</p>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Trailer overlay -->
{#if detail?.trailerKey}
	<Dialog.Root bind:open={trailerOpen}>
		<Dialog.Content class="aspect-video max-w-[calc(100%-2rem)] overflow-hidden p-0 sm:max-w-3xl">
			<Dialog.Title class="sr-only">Trailer</Dialog.Title>
			{#if trailerOpen}
				<iframe
					src="https://www.youtube.com/embed/{detail.trailerKey}?autoplay=1"
					title="{detail.title} trailer"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
					allowfullscreen
					class="h-full w-full"
				></iframe>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- Full overview overlay -->
{#if detail}
	<Dialog.Root bind:open={overviewOpen}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Title>{detail.title}</Dialog.Title>
			<p class="text-muted-foreground text-sm leading-relaxed">{detail.overview}</p>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- Episode detail overlay -->
{#if episode && detail}
	<Dialog.Root open onOpenChange={(open) => !open && (episode = null)}>
		<Dialog.Content class="overflow-hidden p-0 sm:max-w-lg" showCloseButton={!episode.stillPath}>
			<Dialog.Title class="sr-only">{episode.name}</Dialog.Title>
			<div class="relative">
				{#if episode.stillPath}
					<img
						src={getImageUrl(episode.stillPath, 'backdrop', 'large')}
						alt=""
						class="aspect-video w-full object-cover"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"></div>
					<button
						type="button"
						onclick={() => (episode = null)}
						aria-label="Close"
						class="absolute top-3 right-3 z-20 rounded-full bg-black/50 p-1.5 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
					>
						<X class="size-5" />
					</button>
				{/if}
				<div class={cn('space-y-1', episode.stillPath ? 'absolute inset-x-0 bottom-0 p-4 text-white' : 'p-4')}>
					<p class={cn('text-xs', episode.stillPath ? 'text-white/60' : 'text-muted-foreground')}>
						{detail.title} — Season {episode.seasonNumber}, Episode {episode.episodeNumber}
					</p>
					<h3 class="text-lg font-bold">{episode.name}</h3>
					<p class={cn('text-xs', episode.stillPath ? 'text-white/60' : 'text-muted-foreground')}>
						{formatAirDate(episode.airDate)}{episode.runtime ? ` • ${episode.runtime}m` : ''}
					</p>
				</div>
			</div>
			{#if episode.overview}
				<p class="text-muted-foreground p-4 pt-0 text-sm leading-relaxed">{episode.overview}</p>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

{#snippet personPhoto(name: string, profilePath: string | null, className: string)}
	{@const url = getImageUrl(profilePath, 'profile', 'medium')}
	<div class={cn('bg-muted overflow-hidden rounded-full', className)}>
		{#if url}
			<img src={url} alt={name} loading="lazy" class="h-full w-full object-cover" />
		{:else}
			<div class="text-muted-foreground/40 flex h-full w-full items-center justify-center">
				<User class="size-1/2" strokeWidth={1.5} />
			</div>
		{/if}
	</div>
{/snippet}
