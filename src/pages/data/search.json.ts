import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.ts';
import { kindLabel, displayTag, cleanTitle } from '../../lib/format.ts';
import { bookDisplayTitle } from '../../lib/books.ts';

export const GET: APIRoute = async () => {
  const garden = await getGarden();
  const records = [
    ...garden.notes.map((note) => ({ kind: note.kind, label: kindLabel(note), url: note.url, title: cleanTitle(note.title), aliases: note.contentMode === 'external' ? [] : note.aliases ?? [], summary: note.summary, tags: note.contentMode === 'external' ? [] : note.publicTags.map(displayTag), headings: note.headings.map((h) => h.title), text: note.bodyText })),
    // 결과 줄에는 책장과 같은 파일 이름을 보인다. 띠지 원제는 별칭으로 두어 그 이름으로도 찾을 수 있게 한다.
    ...garden.books.map((book) => {
      const title = bookDisplayTitle(book);
      return { kind: 'book', label: '책', url: book.url, title, aliases: book.title && book.title !== title ? [book.title] : [], summary: book.note, tags: [], headings: [], text: [book.author, book.publisher].filter(Boolean).join(' ') };
    })
  ];
  return new Response(JSON.stringify(records), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
