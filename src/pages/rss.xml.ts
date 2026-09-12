import type { APIRoute } from 'astro';
import { getGarden } from '../lib/get-garden.ts';
import { renderFeed } from '../lib/rss.ts';
import { UNIFIED_QUOTA } from '../lib/feeds.ts';
export const prerender = true;
export const GET: APIRoute = async ({ site }) => {
  const garden = await getGarden();
  return new Response(renderFeed(garden.notes, { site: site!, basePath: garden.config.basePath, quota: UNIFIED_QUOTA }), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
