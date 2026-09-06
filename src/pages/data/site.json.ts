import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.mjs';

export const GET: APIRoute = async () => {
  const garden = await getGarden();
  const pick = (note) => ({ path: note.path, slug: note.slug, url: note.url, kind: note.kind, category: note.category, title: note.title, displayTitle: note.displayTitle, date: note.date, topic: note.topic, publicTags: note.publicTags, summary: note.summary, summaryIsExplicit: note.summaryIsExplicit, headings: note.headings });
  const body = {
    home: garden.home,
    notes: garden.notes.map(pick),
    nodes: garden.nodes.map(({ excerpt, headings, summary, ...node }) => node),
    edges: garden.edges,
    noteEdges: garden.noteEdges,
    paths: garden.paths,
    books: garden.books.map(({ slug, url, title, author, rate, tier, status, note }) => ({ slug, url, title, author, rate, tier, status, note })),
    stats: garden.stats
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
