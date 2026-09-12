import { getGarden } from '../lib/get-garden.ts';
import { llmsText } from '../lib/seo.ts';
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site-meta.ts';

export async function GET({ site }: { site: URL | undefined }) {
  const garden = await getGarden();
  const body = llmsText(garden.notes, { site: String(site), basePath: garden.config.basePath ?? '', title: SITE_TITLE, description: SITE_DESCRIPTION });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
