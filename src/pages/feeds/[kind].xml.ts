import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.ts';
import { renderFeed } from '../../lib/rss.ts';
import { FEEDS } from '../../lib/feeds.ts';

export const prerender = true;
export function getStaticPaths() {
  return Object.keys(FEEDS).map(kind => ({ params: { kind } }));
}

export const GET: APIRoute = async ({ site, params }) => {
  const garden = await getGarden();
  return new Response(renderFeed(garden.notes, {
    site: site!,
    basePath: garden.config.basePath,
    feedPath: `feeds/${params.kind}.xml`,
    ...FEEDS[params.kind!],
  }), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
