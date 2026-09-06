import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.mjs';
import { kindLabel, displayTag } from '../../lib/format.mjs';

export const GET: APIRoute = async () => {
  const garden = await getGarden();
  const records = [
    ...garden.notes.map((note) => ({ kind: note.kind, label: kindLabel(note), url: note.url, title: note.title, summary: note.summary, tags: note.publicTags.map(displayTag), headings: note.headings.map((h) => h.title), text: note.bodyText })),
    ...garden.books.map((book) => ({ kind: 'book', label: '책', url: book.url, title: book.title, summary: book.note, tags: [], headings: [], text: [book.author, book.publisher].filter(Boolean).join(' ') }))
  ];
  return new Response(JSON.stringify(records), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
