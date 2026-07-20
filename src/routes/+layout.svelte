<script lang="ts">
	import '../app.css';

	import Header from '$lib/components/header.svelte';
	import { applyTheme, type Theme } from '$lib/theme';

	let { children } = $props();

	// Track live OS theme changes while in "system" mode. The current theme is
	// whatever's stamped on <html data-theme> (SSR hook, updated by setTheme).
	$effect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = () => {
			const theme = document.documentElement.dataset.theme as Theme;
			if (theme === 'system') applyTheme('system');
		};
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});
</script>

<svelte:head><link rel="icon" href="/favicon.ico" /></svelte:head>

<div class="bg-background text-foreground min-h-svh antialiased">
	<Header />
	{@render children()}
</div>
