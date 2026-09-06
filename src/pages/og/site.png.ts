import { getGarden } from '../../lib/get-garden.mjs';
import { renderSiteOgPng } from '../../lib/og.mjs';
import { SITE_TITLE, SITE_DESCRIPTION } from '../../lib/site-meta.mjs';

export const prerender = true;

export async function GET({ site }) {
  const garden = await getGarden();
  const base = String(garden.config.basePath ?? '').replace(/\/$/, '');
  const siteLabel = `${new URL(site ?? 'https://taez224.github.io').host}${base}`;
  const png = await renderSiteOgPng(garden, { title: SITE_TITLE, about: SITE_DESCRIPTION, siteLabel });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
