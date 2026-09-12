import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.ts';
import { renderSiteOgPng, siteLabelFor } from '../../lib/og.ts';
import { SITE_TITLE } from '../../lib/site-meta.ts';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const garden = await getGarden();
  const siteLabel = siteLabelFor(garden.config, site);
  // 사이트 제목에서 이름을 뗀다('TaeZ’s Thinking Garden' → 'Thinking Garden'). 이름은 카드 왼쪽 위 워드마크가 맡는다.
  const title = SITE_TITLE.replace(/^TaeZ[’']s\s+/u, '');
  const png = await renderSiteOgPng(garden, { title, siteLabel });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
