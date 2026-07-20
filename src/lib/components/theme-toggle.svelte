<script lang="ts">
	import Sun from "@lucide/svelte/icons/sun";
	import Moon from "@lucide/svelte/icons/moon";
	import Monitor from "@lucide/svelte/icons/monitor";

	import { buttonVariants } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { setTheme } from "$lib/theme";
</script>

<!--
	Light/Dark/System selector. Writes the theme cookie and applies the class
	immediately — no server round-trip (see $lib/theme).
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant: "ghost", size: "icon" })}
		aria-label="Toggle theme"
	>
		<Sun class="size-4 dark:hidden" />
		<Moon class="hidden size-4 dark:block" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onclick={() => setTheme("light")}>
			<Sun class="size-4" /> Light
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setTheme("dark")}>
			<Moon class="size-4" /> Dark
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setTheme("system")}>
			<Monitor class="size-4" /> System
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
