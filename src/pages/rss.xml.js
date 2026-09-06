import { getGarden } from '../lib/get-garden.mjs';
import { feedEntries, renderFeed } from '../lib/rss.mjs';
export const prerender = true;
export async function GET({ site }) {
  const garden = await getGarden();
  return new Response(renderFeed(feedEntries(garden), { site, basePath: garden.config.basePath }), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
