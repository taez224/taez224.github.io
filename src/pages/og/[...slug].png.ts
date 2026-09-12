import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.ts';
import { kindPrefix } from '../../lib/slug.ts';
import { renderOgPng, siteLabelFor } from '../../lib/og.ts';

export const prerender = true;

export async function getStaticPaths() {
  const garden = await getGarden();
  return garden.notes.map((note) => ({ params: { slug: `${kindPrefix(note.kind)}/${note.slug}` }, props: { path: note.path } }));
}

export const GET: APIRoute<{ path: string }> = async ({ props, site }) => {
  const garden = await getGarden();
  const siteLabel = siteLabelFor(garden.config, site);
  const png = await renderOgPng(garden, props.path, { siteLabel });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
