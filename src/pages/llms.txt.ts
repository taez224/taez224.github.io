import { getGarden } from '../lib/get-garden.mjs';
import { llmsText } from '../lib/seo.mjs';
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site-meta.mjs';

export async function GET({ site }: { site: URL | undefined }) {
  const garden = await getGarden();
  const body = llmsText(garden.notes, { site: String(site), basePath: garden.config.basePath ?? '', title: SITE_TITLE, description: SITE_DESCRIPTION });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
