import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleGarden } from '../src/lib/garden.ts';
import { publicNoteSchema, bookSchema } from '../src/lib/content-model.ts';
import { inlineGraph, inlinePanelNotes } from '../src/lib/graph-data.ts';

test('assembled notes and books satisfy their shared contracts and panel data excludes note bodies', async (t) => {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-model-'));
  t.after(() => fs.rm(vaultRoot, { recursive: true, force: true }));
  const files = {
    '01_Slipbox/A.md': '---\ncreated: 2026-01-01\n---\n# A\n[[B]] BODY_ONLY_SENTINEL',
    '01_Slipbox/B.md': '---\ncreated: 2026-01-01\nsummary: 명시한 요약\n---\n# B\n[[A]]',
    '30_Resources/References/Books/Book.md': '---\ncreated: 2026-01-01\nmy_rate: 5\n---\n# Book'
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(vaultRoot, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  }
  const garden = await assembleGarden({ vaultRoot, today: '2026-09-12', config: { include: [{ path: '01_Slipbox', mode: 'all' }], exclude: [] } });
  assert.equal(garden.notes.length, 2);
  for (const note of garden.notes) assert.deepEqual(publicNoteSchema.strict().parse(note), note);
  for (const book of garden.books) assert.deepEqual(bookSchema.strict().parse(book), book);
  const panel = inlinePanelNotes(garden.notes, garden.noteEdges);
  assert.doesNotMatch(JSON.stringify(panel), /BODY_ONLY_SENTINEL|bodyHtml|bodyText/);
  assert.equal(panel.notes.find((note) => note.title === 'B')!.summary, '명시한 요약');
  assert.equal(inlineGraph(garden.nodes, garden.edges).nodes.length, garden.nodes.length);
});
