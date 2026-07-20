<script lang="ts" module>
	/** Gradient stops per tier — light (top) → dark (bottom). */
	const SCORE_TIERS = {
		green: { from: '#22c55e', to: '#166534', border: 'border-green-800', text: 'rgba(255,255,255,0.9)' },
		gold: { from: '#f59e0b', to: '#92400e', border: 'border-amber-800', text: 'rgba(255,255,255,0.9)' },
		red: { from: '#ef4444', to: '#991b1b', border: 'border-red-800', text: 'rgba(255,255,255,0.9)' },
		none: { from: '#525252', to: '#262626', border: 'border-neutral-800', text: 'rgba(255,255,255,0.6)' }
	} as const;

	export type ScoreTierName = keyof typeof SCORE_TIERS;

	/** Resolves the display tier for a score/release state. */
	export function getScoreTier(score: number | null, isUnreleased: boolean): ScoreTierName {
		if (isUnreleased || score === null) return 'none';
		if (score >= 70) return 'green';
		if (score >= 60) return 'gold';
		return 'red';
	}

	/** Poster/backdrop top-border class matching the tier's dark gradient end. */
	export function getTierBorderClass(tier: ScoreTierName): string {
		return SCORE_TIERS[tier].border;
	}
</script>

<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { getSourceLabel } from '$lib/scoring';
	import type { ScoreBreakdown } from '$lib/mdblist';

	interface Props {
		/** Base ReelScore 0–100, or null when insufficient sources */
		score: number | null;
		/** Namespaces the SVG gradient id — use the tmdbId (60+ lips per page) */
		tmdbId: number;
		isUnreleased?: boolean;
		sourceCount?: number;
		/** Full score math — renders the dev-only score-receipt tooltip */
		breakdown?: ScoreBreakdown;
		/** "card" (70×23) or "modal" (larger, for the title modal header) */
		size?: 'card' | 'modal';
	}

	let { score, tmdbId, isUnreleased = false, sourceCount = 0, breakdown, size = 'card' }: Props =
		$props();

	const tier = $derived(SCORE_TIERS[getScoreTier(score, isUnreleased)]);
	const gradId = $derived(`grad-${size}-${tmdbId}`);
	const hasScore = $derived(score !== null && !isUnreleased);
	const dims = $derived(
		size === 'modal' ? { width: 96, height: 32, fontSize: 17 } : { width: 70, height: 23, fontSize: 15 }
	);

	const tooltip = $derived(
		isUnreleased ? 'Not yet released' : hasScore ? `ReelScore: ${score}` : 'Not enough ratings'
	);
</script>

<!--
	ScoreLip — the signature ReelScore element and the ONE sanctioned custom
	visual (DECISIONS 2026-07-19). A gradient tab with concave curves on both
	sides, sitting on the poster/backdrop top edge.
-->
{#snippet lip()}
	<svg width={dims.width} height={dims.height} viewBox="0 0 84 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<defs>
		<linearGradient id={gradId} x1="0" y1="0" x2="0" y2="28" gradientUnits="userSpaceOnUse">
			<stop offset="0%" stop-color={tier.from} />
			<stop offset="100%" stop-color={tier.to} />
		</linearGradient>
	</defs>
	<!-- The branded concave-sided tab shape -->
	<path
		d="M56 0C63.6112 0 69.8035 6.07368 69.9951 13.6387L70.0049 14.3613C70.1965 21.9263 76.3888 28 84 28H0C7.61118 28 13.8035 21.9263 13.9951 14.3613L14.0049 13.6387C14.1965 6.07368 20.3888 0 28 0H56Z"
		fill="url(#{gradId})"
	/>
	{#if isUnreleased}
		<g transform="translate(33.6, 5.6) scale(0.7)">
			<circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" fill="none" />
			<polyline
				points="12 6 12 12 16 14"
				stroke="rgba(255,255,255,0.9)"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				fill="none"
			/>
		</g>
	{:else}
		<text
			x="42"
			y="14"
			text-anchor="middle"
			dominant-baseline="central"
			fill={tier.text}
			font-size={dims.fontSize}
			font-family="ui-monospace, monospace"
			font-weight="bold"
		>
			{hasScore ? score : '—'}
		</text>
	{/if}
	</svg>
{/snippet}

{#if import.meta.env.DEV && breakdown}
	<!-- Dev-only score receipt — this branch is compiled out of prod builds,
		so the base math (weights, factors) is never shipped publicly. -->
	<Tooltip.Provider delayDuration={150}>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<!-- span, not the default button — the lip sits inside the card's <button> -->
					<span class="block" role="img" aria-label={tooltip} {...props}>{@render lip()}</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" class="px-3 py-2">
				<div class="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
					{#each breakdown.sources as s (s.source)}
						<span>{getSourceLabel(s.source)}</span>
						<span class="text-right opacity-50">×{s.effectiveWeight.toFixed(2)}</span>
						<span class="text-right">{s.normalizedScore}</span>
					{/each}
					<span class="border-background/30 col-span-3 my-1 border-t"></span>
					<span>weighted avg</span>
					<span></span>
					<span class="text-right">{breakdown.weightedAverage}</span>
					<span>reliability</span>
					<span></span>
					<span class="text-right">
						{breakdown.reliabilityAdjustment >= 0 ? '+' : ''}{breakdown.reliabilityAdjustment}
					</span>
					<span class="border-background/30 col-span-3 my-1 border-t"></span>
					<span class="font-semibold">ReelScore</span>
					<span class="text-right opacity-50">{sourceCount} src</span>
					<span class="text-right font-semibold">{hasScore ? score : '—'}</span>
				</div>
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{:else}
	<span class="block" title={tooltip} role="img" aria-label={tooltip}>{@render lip()}</span>
{/if}
