import { getGarden } from '../../lib/get-garden.mjs';
import { feedEntries, renderFeed } from '../../lib/rss.mjs';
import { FEEDS } from '../../lib/feeds.mjs';

export const prerender = true;
export function getStaticPaths() {
  return Object.keys(FEEDS).map(kind => ({ params: { kind } }));
}

export async function GET({ site, params }) {
  const garden = await getGarden();
  return new Response(renderFeed(feedEntries(garden), {
    site,
    basePath: garden.config.basePath,
    feedPath: `feeds/${params.kind}.xml`,
    ...FEEDS[params.kind],
  }), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
