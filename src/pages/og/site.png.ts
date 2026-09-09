import { getGarden } from '../../lib/get-garden.mjs';
import { renderSiteOgPng } from '../../lib/og.mjs';
import { SITE_TITLE } from '../../lib/site-meta.mjs';

export const prerender = true;

export async function GET({ site }) {
  const garden = await getGarden();
  const base = String(garden.config.basePath ?? '').replace(/\/$/, '');
  const siteLabel = `${new URL(site ?? 'https://taez224.github.io').host}${base}`;
  // 사이트 제목에서 이름을 뗀다('TaeZ’s Thinking Garden' → 'Thinking Garden'). 이름은 카드 왼쪽 위 워드마크가 맡는다.
  const title = SITE_TITLE.replace(/^TaeZ[’']s\s+/u, '');
  const png = await renderSiteOgPng(garden, { title, siteLabel });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
