<script lang="ts">
	import ThemeToggle from "$lib/components/theme-toggle.svelte";
</script>

<!-- Site header: brand + theme toggle. Search lands here in the search phase,
     account menu in the auth phase. -->
<header class="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
	<div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
		<a href="/" class="text-lg font-bold tracking-tight">
			Reel<span class="text-score-high">Score</span>
		</a>
		<ThemeToggle />
	</div>
</header>
