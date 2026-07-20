// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Title modal target — set by shallow-routing pushState on the feed */
			showTitle?: { tmdbId: number; mediaType: "movie" | "tv" };
		}
		interface Platform {
			/** Cloudflare bindings + vars — Env comes from `wrangler types` (worker-configuration.d.ts) */
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
