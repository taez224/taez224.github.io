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
  assert.match(a.bodyHtml, /src="\/obsidian\/assets\/vault\/_attachments\/reviewed\.svg"/);
  assert.deepEqual(a.publicTags, ['AI']);
  assert.deepEqual(a.outgoing, ['01_Slipbox/생각 B.md']);
  assert.deepEqual(byPath.get('01_Slipbox/생각 B.md').incoming.sort(), ['01_Slipbox/생각 A.md']);
  assert.match(byPath.get('01_Slipbox/생각 B.md').bodyText, /UNIQUE_BODY_WORD/);
  assert.equal(JSON.stringify(garden).includes('DRAFT_SENTINEL'), false);
  assert.equal(JSON.stringify(garden).includes('WITHHELD_SENTINEL'), false);
  assert.equal(garden.assetCopies.get('_attachments/reviewed.svg'), 'assets/vault/_attachments/reviewed.svg');
  assert.equal(garden.home.about, '소개 문장');
  assert.equal(garden.books[0].url, '/obsidian/books/#book-좋은-책');
  assert.equal(byPath.get('20_Projects/blog/공개 글.md').publication, 'Nextree');
  assert.equal(byPath.get('01_Slipbox/생각 A.md').publication, '');
});

test('graphRule linked keeps only development notes connected to the thought map, slipbox isolates stay', async () => {
  const pairConfig = { ...config, include: config.include.map((rule) => rule.graphRule ? { ...rule, files: [...rule.files, `${dev}/Concepts/짝 A.md`, `${dev}/Concepts/짝 B.md`] } : rule) };
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/외톨이.md': '---\ncreated: 2026-09-06\n---\n# 외톨이\n링크 없음.',
    [`${dev}/Concepts/짝 A.md`]: '---\ncreated: 2026-09-06\nsummary: 짝 A\n---\n# 짝 A\n[[짝 B]]만 참조.',
    [`${dev}/Concepts/짝 B.md`]: '---\ncreated: 2026-09-06\nsummary: 짝 B\n---\n# 짝 B\n[[짝 A]]만 참조.'
  });
  const paired = await assembleGarden({ vaultRoot, config: pairConfig, basePath: '/obsidian' });
  const pairedIds = paired.nodes.map((node) => node.id);
  assert.ok(!pairedIds.includes(`${dev}/Concepts/짝 A.md`) && !pairedIds.includes(`${dev}/Concepts/짝 B.md`), '서로만 참조하는 개발 노트 쌍은 지도에 들어오지 않는다');
  assert.ok(paired.development.concepts.some((record) => record.path === `${dev}/Concepts/짝 A.md`), '목록에는 남는다');
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
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/다른 생각.md': '---\ncreated: 2026-09-07\nslug: 생각-a\n---\n# 다른 생각\n중복 슬러그.' });
  await assert.rejects(() => assembleGarden({ vaultRoot, config, basePath: '/obsidian' }), /생각 A\.md[\s\S]*다른 생각\.md|다른 생각\.md[\s\S]*생각 A\.md/);
});

test('summary fallback uses plain text without image or table markup', async () => {
  const fallbackConfig = {
    ...config,
    include: [...config.include, {
      path: `${dev}/Tools`, graph: false, files: [`${dev}/Tools/도구.md`]
    }]
  };
  const vaultRoot = await makeVault({ ...files,
    [`${dev}/Tools/도구.md`]: '---\ncreated: 2026-09-06\n---\n# 도구\n![](https://example.com/tool.png)\n\n| 명령 | 설명 |\n| --- | --- |\n| rg | 검색 |\n\n도구를 고르는 기준.'
  });
  const garden = await assembleGarden({ vaultRoot, config: fallbackConfig, basePath: '/obsidian' });
  const tool = garden.development.tools.find((record) => record.path === `${dev}/Tools/도구.md`);
  assert.equal(tool.summary, '명령 설명 rg 검색 도구를 고르는 기준.');
  assert.doesNotMatch(tool.summary, /!\[|https?:\/\/|\|/);
});

test('short summary fallback preserves the final word', async () => {
  const fallbackConfig = {
    ...config,
    include: [...config.include, {
      path: `${dev}/Tools`, graph: false, files: [`${dev}/Tools/짧은 도구.md`]
    }]
  };
  const vaultRoot = await makeVault({ ...files,
    [`${dev}/Tools/짧은 도구.md`]: '---\ncreated: 2026-09-06\n---\n# 짧은 도구\n마지막 어절 보존.'
  });
  const garden = await assembleGarden({ vaultRoot, config: fallbackConfig, basePath: '/obsidian' });
  const tool = garden.development.tools.find((record) => record.path === `${dev}/Tools/짧은 도구.md`);
  assert.equal(tool.summary, '마지막 어절 보존.');
});

test('summary omits fenced code while body search preserves it', async () => {
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/생각 B.md': [
      '---', 'created: 2026-09-02', '---', '# 생각 B',
      '명령의 목적을 설명한다.', '',
      '```sh', 'brew install CODE_ONLY_SENTINEL', '```', '',
      '~~~sh', 'TILDE_ONLY_SENTINEL', '~~~', '',
      '본문의 `inline API`는 남긴다.'
    ].join('\n')
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const note = garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md');
  assert.equal(note.summary, '명령의 목적을 설명한다. 본문의 inline API는 남긴다.');
  assert.match(note.bodyText, /CODE_ONLY_SENTINEL/);
  assert.match(note.bodyText, /TILDE_ONLY_SENTINEL/);
});

test('series posts drop the 이전·다음 글 lines from the public body but keep the edges', async () => {
  const post = (order, extra) => `---\ncreated: 2026-09-0${order}\nstatus: published\nsource: https://example.com/s${order}\npublication: Brunch\nseries: 연재 S\nseries_order: ${order}\ntags:\n  - blog\n---\n# S${order}\n본문 ${order}.\n\n## 연결된 노트\n\n${extra}`;
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/S1.md': post(1, '- [[S2]] - 다음 글\n'),
    '20_Projects/blog/S2.md': post(2, '- [[S1]] - 이전 글\n- [[생각 B]]\n')
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const s1 = garden.notes.find((note) => note.path === '20_Projects/blog/S1.md');
  const s2 = garden.notes.find((note) => note.path === '20_Projects/blog/S2.md');
  assert.doesNotMatch(s1.bodyHtml, /연결된 노트|다음 글/);
  assert.doesNotMatch(s1.bodyText, /연결된 노트|다음 글/);
  assert.ok(s1.outgoing.includes('20_Projects/blog/S2.md'));
  assert.match(s2.bodyHtml, /연결된 노트/);
  assert.doesNotMatch(s2.bodyHtml, /이전 글/);
  assert.match(s2.bodyHtml, /생각 B/);
});

test('folder publication picks up new development notes without publishing helper files', async () => {
  const folderConfig = {
    ...config,
    include: config.include.map((rule) => rule.path === `${dev}/Concepts`
      ? { path: rule.path, mode: 'all', graph: true, graphRule: 'linked' } : rule),
    exclude: [`${dev}/Concepts/비공개 개념.md`]
  };
  const vaultRoot = await makeVault({ ...files,
    [`${dev}/Concepts/새 개념.md`]: '---\ncreated: 2026-09-06\nsummary: 새 개념 요약\n---\n# 새 개념\n[[연결된 개념]]으로 연결한다.',
    [`${dev}/Concepts/_index.md`]: '# 내부 운영 안내\nHELPER_SENTINEL',
    [`${dev}/Concepts/_local/보류.md`]: '# 로컬 초안\nLOCAL_SENTINEL',
    [`${dev}/Concepts/qmd-eval.json`]: '{"query":"EVAL_SENTINEL"}'
  });
  const garden = await assembleGarden({ vaultRoot, config: folderConfig, basePath: '/obsidian' });
  const added = garden.notes.find((note) => note.path === `${dev}/Concepts/새 개념.md`);
  assert.ok(added);
  assert.match(added.bodyHtml, /href="\/obsidian\/dev\/연결된-개념\/"/);
  for (const sentinel of ['HELPER_SENTINEL', 'LOCAL_SENTINEL', 'EVAL_SENTINEL', 'WITHHELD_SENTINEL']) {
    assert.equal(JSON.stringify(garden).includes(sentinel), false);
  }
  assert.equal([...garden.assetCopies.keys()].some((asset) => asset.endsWith('qmd-eval.json')), false);
});

test('public notes carry a reading time of at least one minute', async () => {
  const vaultRoot = await makeVault(files);
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const short = garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md');
  assert.equal(short.readingMinutes, 1);
  for (const note of garden.notes) assert.ok(Number.isInteger(note.readingMinutes) && note.readingMinutes >= 1, note.path);
});
