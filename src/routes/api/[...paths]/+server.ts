import type { RequestHandler } from "./$types";

import api from "$lib/server/api";

/**
 * Mounts the Hono API app under /api/* — every method delegates to Hono with
 * the Cloudflare bindings as its env. SvelteKit only routes requests here
 * that didn't match a page route, so pages and API coexist in one Worker.
 */
const handler: RequestHandler = ({ request, platform }) =>
  api.fetch(request, platform!.env);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
