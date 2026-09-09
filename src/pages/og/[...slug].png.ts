import { getGarden } from '../../lib/get-garden.mjs';
import { kindPrefix } from '../../lib/slug.mjs';
import { renderOgPng } from '../../lib/og.mjs';

export const prerender = true;

export async function getStaticPaths() {
  const garden = await getGarden();
  return garden.notes.map((note) => ({ params: { slug: `${kindPrefix(note.kind)}/${note.slug}` }, props: { path: note.path } }));
}

export async function GET({ props, site }) {
  const garden = await getGarden();
  const base = String(garden.config.basePath ?? '').replace(/\/$/, '');
  const siteLabel = `${new URL(site ?? 'https://taez224.github.io').host}${base}`;
  const png = await renderOgPng(garden, props.path, { siteLabel });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
