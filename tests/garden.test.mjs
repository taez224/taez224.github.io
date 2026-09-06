import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleGarden } from '../src/lib/garden.mjs';

const dev = '30_Resources/Development';
async function makeVault(files) {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-vault-'));
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(vaultRoot, file)), { recursive: true });
    await fs.writeFile(path.join(vaultRoot, file), content);
  }
  return vaultRoot;
}
const config = {
  basePath: '/obsidian', depth: 2, maxGraphNodes: 80, seeds: [], paths: [], exclude: [], assets: ['_attachments/reviewed.svg'],
  home: { featured: ['20_Projects/blog/공개 글.md'], contacts: [], about: '소개 문장' },
  include: [
    { path: '01_Slipbox', mode: 'all', graph: true },
    { path: '20_Projects/blog', statuses: ['published'], types: ['series'], graph: false },
    { path: `${dev}/Concepts`, graph: true, graphRule: 'linked', files: [`${dev}/Concepts/연결된 개념.md`, `${dev}/Concepts/고립된 개념.md`] }
  ]
};
const files = {
  '01_Slipbox/생각 A.md': '---\ncreated: 2026-09-01\ntags:\n  - AI\n  - slipbox\n  - 프로젝트/비공개\n---\n# 생각 A\n본문 A는 [[생각 B]]를 참조한다.\n\n![[reviewed.svg]]',
  '01_Slipbox/생각 B.md': '---\ncreated: 2026-09-02\nsummary: B 요약\n---\n# 생각 B\n혼자 있는 문장 UNIQUE_BODY_WORD.',
  '20_Projects/blog/공개 글.md': '---\ncreated: 2026-09-03\nstatus: published\nsource: https://example.com/post\npublication: Nextree\nsummary: 글 요약\ntags:\n  - blog\n  - AI/에이전트\n---\n# 공개 글\n[[생각 A]]를 인용한다.',
  '20_Projects/blog/초안.md': '---\nstatus: draft\n---\n# 초안\nDRAFT_SENTINEL',
  [`${dev}/Concepts/연결된 개념.md`]: '---\ncreated: 2026-09-04\nsummary: 개념 요약\ntags:\n  - 개발/설계\n---\n# 연결된 개념\n[[생각 A]]에서 출발.',
  [`${dev}/Concepts/고립된 개념.md`]: '---\ncreated: 2026-09-05\nsummary: 고립 요약\n---\n# 고립된 개념\n링크 없음.',
  [`${dev}/Concepts/비공개 개념.md`]: '---\ncreated: 2026-09-05\n---\n# 비공개 개념\nWITHHELD_SENTINEL',
  '30_Resources/References/Books/좋은 책.md': '---\ntitle: 좋은 책\nauthor: 저자\nmy_rate: 5\nbook_note: 강력 추천\nstatus: 완독\ncreated: 2026-08-01\n---\n# 좋은 책',
  '_attachments/reviewed.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
};

test('assembleGarden publishes reviewed notes with slug urls and no private strings', async () => {
  const vaultRoot = await makeVault(files);
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const byPath = new Map(garden.notes.map((note) => [note.path, note]));
  assert.deepEqual([...byPath.keys()].sort(), [
    '01_Slipbox/생각 A.md', '01_Slipbox/생각 B.md', '20_Projects/blog/공개 글.md',
    `${dev}/Concepts/고립된 개념.md`, `${dev}/Concepts/연결된 개념.md`
  ].sort());
  assert.equal(byPath.get('20_Projects/blog/공개 글.md').url, '/obsidian/posts/공개-글/');
  assert.equal(byPath.get('01_Slipbox/생각 A.md').url, '/obsidian/notes/생각-a/');
  assert.equal(byPath.get(`${dev}/Concepts/연결된 개념.md`).url, '/obsidian/dev/연결된-개념/');
  const a = byPath.get('01_Slipbox/생각 A.md');
  assert.match(a.bodyHtml, /href="\/obsidian\/notes\/생각-b\/"/);
  assert.match(a.bodyHtml, /assets\/vault\/_attachments\/reviewed\.svg/);
  assert.deepEqual(a.publicTags, ['AI']);
  assert.deepEqual(a.outgoing, ['01_Slipbox/생각 B.md']);
  assert.deepEqual(byPath.get('01_Slipbox/생각 B.md').incoming.sort(), ['01_Slipbox/생각 A.md']);
  assert.match(byPath.get('01_Slipbox/생각 B.md').bodyText, /UNIQUE_BODY_WORD/);
  assert.equal(JSON.stringify(garden).includes('DRAFT_SENTINEL'), false);
  assert.equal(JSON.stringify(garden).includes('WITHHELD_SENTINEL'), false);
  assert.equal(garden.assetCopies.get('_attachments/reviewed.svg'), 'assets/vault/_attachments/reviewed.svg');
  assert.equal(garden.home.about, '소개 문장');
  assert.equal(garden.books[0].url, '/obsidian/books/#book-좋은-책');
});

test('graphRule linked keeps only development notes with a public link, slipbox isolates stay', async () => {
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/외톨이.md': '---\ncreated: 2026-09-06\n---\n# 외톨이\n링크 없음.' });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const ids = garden.nodes.map((node) => node.id).sort();
  assert.ok(ids.includes(`${dev}/Concepts/연결된 개념.md`));
  assert.ok(!ids.includes(`${dev}/Concepts/고립된 개념.md`));
  assert.ok(ids.includes('01_Slipbox/외톨이.md'));
  assert.ok(garden.development.concepts.some((record) => record.path === `${dev}/Concepts/고립된 개념.md`), '고립 노트는 목록에는 남는다');
  const devNode = garden.nodes.find((node) => node.id === `${dev}/Concepts/연결된 개념.md`);
  assert.equal(devNode.topic, '개발');
  assert.ok(garden.edges.some((edge) => edge.source === devNode.id && edge.target === '01_Slipbox/생각 A.md'));
});

test('slug collisions fail the build with both paths named', async () => {
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/생각 a.md': '---\ncreated: 2026-09-07\n---\n# 생각 a\n중복 슬러그.' });
  await assert.rejects(() => assembleGarden({ vaultRoot, config, basePath: '/obsidian' }), /생각 A\.md[\s\S]*생각 a\.md|생각 a\.md[\s\S]*생각 A\.md/);
});
