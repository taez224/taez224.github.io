import test from 'node:test';

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleGarden } from '../src/lib/garden.mjs';
import { headingsFor } from '../src/lib/note-body.mjs';
import { seriesNeighbors } from '../src/lib/note-nav.mjs';

test('table of contents excludes headings inside multiline Obsidian comments', () => {
  assert.deepEqual(headingsFor('## 공개\n\n%%\n## 숨김\n%%\n\n## 끝'), [
    { id: '공개', level: 2, title: '공개' },
    { id: '끝', level: 2, title: '끝' }
  ]);
});

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
  basePath: '/obsidian', exclude: [], assets: ['_attachments/reviewed.svg'],
  home: { featured: ['20_Projects/blog/공개 글.md'], contacts: [], about: '소개 문장' },
  include: [
    { path: '01_Slipbox', mode: 'all', graph: true },
    { path: '20_Projects/blog', statuses: ['published'], types: ['series'], graph: false },
    { path: `${dev}/Concepts`, graph: true, graphRule: 'linked', files: [`${dev}/Concepts/연결된 개념.md`, `${dev}/Concepts/고립된 개념.md`] }
  ]
};
const files = {
  '01_Slipbox/생각 A.md': '---\ncreated: 2026-09-01\ntags:\n  - AI\n  - slipbox\n  - 프로젝트/비공개\n---\n# 생각 A\n본문 A는 [[생각 B]]를 참조한다.\n\n![[reviewed.svg]]',
  '01_Slipbox/생각 B.md': '---\ncreated: 2026-09-02\nsummary: B 요약\naliases:\n  - 별칭 B\n---\n# 생각 B\n혼자 있는 문장 UNIQUE_BODY_WORD.',
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
  assert.deepEqual(byPath.get('01_Slipbox/생각 B.md').aliases, ['별칭 B']);
  assert.equal(JSON.stringify(garden).includes('DRAFT_SENTINEL'), false);
  assert.equal(JSON.stringify(garden).includes('WITHHELD_SENTINEL'), false);
  assert.equal(garden.assetCopies.get('_attachments/reviewed.svg'), 'assets/vault/_attachments/reviewed.svg');
  assert.equal(garden.home.about, '소개 문장');
  assert.equal(garden.books[0].url, '/obsidian/books/#book-좋은-책');
  assert.equal(byPath.get('20_Projects/blog/공개 글.md').publication, 'Nextree');
  assert.equal(byPath.get('20_Projects/blog/공개 글.md').topicTag, 'AI', 'blog 태그가 주제로 사용되지 않는다');
  assert.equal(byPath.get('01_Slipbox/생각 A.md').publication, '');
});

test('graphRule linked stops at the first development note: a dev note linked only from another dev note stays out', async () => {
  const chainConfig = { ...config, include: config.include.map((rule) => rule.graphRule ? { ...rule, files: [...rule.files, `${dev}/Concepts/사슬.md`] } : rule) };
  const vaultRoot = await makeVault({ ...files,
    [`${dev}/Concepts/사슬.md`]: '---\ncreated: 2026-09-06\nsummary: 사슬\n---\n# 사슬\n[[연결된 개념]]에서만 이어진다.'
  });
  const garden = await assembleGarden({ vaultRoot, config: chainConfig, basePath: '/obsidian' });
  const ids = garden.nodes.map((node) => node.id);
  assert.ok(ids.includes(`${dev}/Concepts/연결된 개념.md`), '생각 노트가 직접 링크한 개발 노트는 지도에 있다');
  assert.ok(!ids.includes(`${dev}/Concepts/사슬.md`), '개발 노트를 거쳐서만 이어진 개발 노트는 지도에 없다');
  assert.ok(garden.development.concepts.some((record) => record.path === `${dev}/Concepts/사슬.md`), '목록에는 남는다');
});

test('private references are labelled without exposing their metadata, body or links', async () => {
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/초안.md': '---\nstatus: draft\ntitle: HIDDEN_TITLE\n---\nSECRET_DRAFT',
    '20_Projects/blog/공개 글.md': files['20_Projects/blog/공개 글.md'] + '\n[[20_Projects/blog/초안|작업 메모]]와 [이전 기록](초안.md), [[없는 문서]]를 참고했다.'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const html = garden.notes.find((note) => note.path === '20_Projects/blog/공개 글.md').bodyHtml;
  assert.equal((html.match(/class="visibility-mark"/g) ?? []).length, 2);
  assert.match(html, /작업 메모/);
  assert.match(html, /이전 기록/);
  assert.match(html, /없는 문서/);
  assert.doesNotMatch(html, /href="[^"]*초안|20_Projects\/blog\/초안|HIDDEN_TITLE|SECRET_DRAFT/);
  assert.ok(!JSON.stringify(garden).includes('SECRET_DRAFT'));
  assert.ok(!JSON.stringify(garden).includes('HIDDEN_TITLE'));
});

test('thumbnail frontmatter resolves reviewed assets separately from body images', async () => {
  const source = files['20_Projects/blog/공개 글.md'].replace('status: published', 'status: published\nthumbnail: "[[cover.svg]]"\nthumbnail_style: soft');
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/공개 글.md': source,
    '20_Projects/blog/assets/cover.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const note = garden.notes.find((note) => note.path === '20_Projects/blog/공개 글.md');
  assert.equal(note.thumbnail, '20_Projects/blog/assets/cover.svg');
  assert.equal(note.thumbnailStyle, 'soft');
  assert.doesNotMatch(note.bodyHtml, /<img/);
  assert.ok(!garden.assetCopies.has(note.thumbnail), '썸네일만 지정한 원본은 본문 에셋으로 복사하지 않는다');
  assert.equal(garden.notes.find((note) => note.path === '01_Slipbox/생각 A.md').thumbnail, null);
  assert.equal(garden.notes.find((note) => note.path === '01_Slipbox/생각 A.md').thumbnailStyle, 'plain');
});

test('thumbnails cannot bypass the reviewed asset list and invalid styles fail the build', async () => {
  const withThumbnail = (extra) => files['20_Projects/blog/공개 글.md'].replace('status: published', `status: published\n${extra}`);
  const privateRoot = await makeVault({ ...files,
    '20_Projects/blog/공개 글.md': withThumbnail('thumbnail: "[[_attachments/private.svg]]"'),
    '_attachments/private.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>'
  });
  await assert.rejects(assembleGarden({ vaultRoot: privateRoot, config }), /Missing or unreviewed thumbnail/);
  const styleRoot = await makeVault({ ...files,
    '20_Projects/blog/공개 글.md': withThumbnail('thumbnail: "[[_attachments/reviewed.svg]]"\nthumbnail_style: blurry')
  });
  await assert.rejects(assembleGarden({ vaultRoot: styleRoot, config }), /Unknown thumbnail_style/);
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
  assert.equal(devNode.topicTag, '개발');
  assert.equal(devNode.topic, '기타', '지도 노드가 3개 미만인 주제는 색이 기타로 접힌다');
  assert.equal(garden.topicFold['개발'], '기타');
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

test('automatic summaries and references use only the public body without modifying the source', async () => {
  const source = [
    '---', 'created: 2026-09-02', '---', '# 생각 B',
    '공개 문장.', '', '## 운영 메모', 'AUTHOR_ONLY_SENTINEL [[생각 A]]', '',
    '%%', '## 주석 속 가짜 경계', '%%', 'HIDDEN_TAIL_SENTINEL', '',
    '## 공개 절', '공개 끝.'
  ].join('\n');
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/생각 B.md': source });
  const garden = await assembleGarden({ vaultRoot, config });
  const note = garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md');
  assert.equal(note.summary, '공개 문장. 공개 끝.');
  assert.deepEqual(note.outgoing, []);
  assert.deepEqual(garden.edges.filter((edge) => edge.source === note.path), []);
  assert.doesNotMatch(JSON.stringify(garden), /AUTHOR_ONLY_SENTINEL|HIDDEN_TAIL_SENTINEL|주석 속 가짜 경계/);
  assert.equal(await fs.readFile(path.join(vaultRoot, note.path), 'utf8'), source);
});

test('series and publication summaries exclude author-only sections and retain explicit summaries', async () => {
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/연재 S.md': '---\ncreated: 2026-09-01\ntype: series\n---\n# 연재 S\n```md\n## 연재 목적\n코드 속 가짜 소개.\n```\n## 운영 메모\nHUB_SENTINEL\n## 연재 목적\n연재 소개.\n## 운영 메모\nHUB_TAIL_SENTINEL',
    '20_Projects/blog/S1.md': '---\ncreated: 2026-09-01\nstatus: published\nseries: 연재 S\nseries_order: 1\n---\n# S1\n## 운영 메모\nPOST_SENTINEL\n## 공개 절\n첫 편 소개.',
    '20_Projects/blog/공개 글.md': '---\ncreated: 2026-09-01\nstatus: published\n---\n# 공개 글\n## 운영 메모\nSTANDALONE_SENTINEL\n## 공개 절\n독립 글 소개.',
    '01_Slipbox/생각 B.md': '---\ncreated: 2026-09-01\nsummary: 명시한 요약\n---\n# 생각 B\n자동 요약과 다른 본문.'
  });
  const garden = await assembleGarden({ vaultRoot, config });
  assert.equal(garden.blog.series[0].summary, '연재 소개.');
  assert.equal(garden.blog.series[0].posts[0].summary, '첫 편 소개.');
  assert.equal(garden.blog.publications[0].posts[0].summary, '독립 글 소개.');
  assert.equal(garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md').summary, '명시한 요약');
  assert.doesNotMatch(JSON.stringify(garden), /HUB_SENTINEL|HUB_TAIL_SENTINEL|POST_SENTINEL|STANDALONE_SENTINEL/);
});

test('graph and references ignore comments and code while keeping visible links and related', async () => {
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/생각 A.md': [
      '---', 'created: 2026-09-01', 'related:', '  - "[[속성 연결]]"', '---', '# 생각 A',
      '%% [[생각 B]] %%', '<!-- [[생각 B]] -->',
      '`[[생각 B]]`와 ``[예시](생각 B.md)``', '\\[[생각 B]]', '',
      '```md', '[[생각 B]]', '```', '',
      '~~~md', '[[생각 B]]', '~~~', '',
      '    [[생각 B]]', '', '> ```md', '> [[생각 B]]', '> ```', '',
      '[[본문 연결]]과 [본문 연결](본문연결.md).', '',
      '> [!article]', '> [[카드 연결]]', '',
      '> [!note]', '> [[인용 연결]]'
    ].join('\n'),
    '01_Slipbox/본문연결.md': '---\ncreated: 2026-09-01\ntitle: 본문 연결\n---\n# 본문 연결\n공개 본문.',
    '01_Slipbox/카드 연결.md': '---\ncreated: 2026-09-01\n---\n# 카드 연결\n카드 대상.',
    '01_Slipbox/인용 연결.md': '---\ncreated: 2026-09-01\n---\n# 인용 연결\n인용 대상.',
    '01_Slipbox/속성 연결.md': '---\ncreated: 2026-09-01\n---\n# 속성 연결\n속성 대상.'
  });
  const garden = await assembleGarden({ vaultRoot, config });
  const note = garden.notes.find((note) => note.path === '01_Slipbox/생각 A.md');
  const expected = ['본문연결', '카드 연결', '인용 연결', '속성 연결'].map((name) => `01_Slipbox/${name}.md`).sort();
  assert.deepEqual(note.outgoing.toSorted(), expected);
  assert.deepEqual(garden.edges.filter((edge) => edge.source === note.path).map((edge) => edge.target).sort(), expected);
  assert.deepEqual(garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md').incoming, []);
  assert.match(note.bodyHtml, /<code>\[\[생각 B\]\]<\/code>/);
  assert.equal(note.articleCards.length, 1);
});

test('series navigation and references survive with related links and no body navigation list', async () => {
  const post = (order, related, body) => `---\ncreated: 2026-09-0${order}\nstatus: published\nseries: 연재 S\nseries_order: ${order}\nrelated:\n${related.map((link) => `  - "${link}"`).join('\n')}\n---\n# S${order}\n${body}`;
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/S1.md': post(1, ['[[S2]]', '[[S2#절|두 번째 편]]', '[[초안]]', '[[없는 문서]]'], '본문 1.'),
    '20_Projects/blog/S2.md': post(2, ['[[S1]]', '[[생각 B]]'], '본문 2. [[생각 B]]를 참고한다.')
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const s1 = garden.notes.find((note) => note.path === '20_Projects/blog/S1.md');
  const s2 = garden.notes.find((note) => note.path === '20_Projects/blog/S2.md');
  assert.equal(s1.bodyText, '본문 1.');
  assert.deepEqual(s1.headings, []);
  assert.deepEqual(s1.outgoing, [s2.path]);
  assert.deepEqual(s2.outgoing.sort(), ['01_Slipbox/생각 B.md', s1.path].sort());
  assert.deepEqual(s1.incoming, [s2.path]);
  assert.deepEqual(s2.incoming, [s1.path]);
  assert.equal(garden.noteEdges.filter((edge) => edge.source === s2.path && edge.target === '01_Slipbox/생각 B.md').length, 1);
  assert.doesNotMatch(JSON.stringify(garden), /초안|없는 문서|DRAFT_SENTINEL/);
  assert.equal(seriesNeighbors(s1, garden.blog.series).next.path, s2.path);
  assert.equal(seriesNeighbors(s2, garden.blog.series).prev.path, s1.path);
  assert.deepEqual(seriesNeighbors(s1, garden.blog.series).posts.map((post) => post.path), [s1.path, s2.path]);
});

test('blog body lists and code mentioning 이전 or 다음 글 are preserved', async () => {
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/공개 글.md': files['20_Projects/blog/공개 글.md'] + '\n\n## 본문\n- 본문에서 보존해야 하는 이전 글\n- [[생각 B]] - 다음 글\n\n```md\n- 예시의 이전 글\n```'
  });
  const garden = await assembleGarden({ vaultRoot, config });
  const note = garden.notes.find((note) => note.path === '20_Projects/blog/공개 글.md');
  assert.match(note.bodyHtml, /본문에서 보존해야 하는 이전 글/);
  assert.match(note.bodyHtml, /생각 B<\/a> - 다음 글/);
  assert.match(note.bodyHtml, /<code class="language-md">- 예시의 이전 글/);
});

test('related links use the public graph candidates and ignore plain text and unpublished targets', async () => {
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/생각 A.md': '---\ncreated: 2026-09-01\nrelated:\n  - "[[생각 B]]"\n  - "[[생각 B#절|별칭]]"\n  - "[[30_Resources/Development/Concepts/연결된 개념]]"\n  - "[[20_Projects/blog/초안]]"\n  - "[[20_Projects/blog/공개 글]]"\n  - "[[비공개 개념]]"\n  - 고립된 개념\n---\n# 생각 A\n연결은 속성에만 둔다.'
  });
  const garden = await assembleGarden({ vaultRoot, config });
  const a = garden.notes.find((note) => note.path === '01_Slipbox/생각 A.md');
  assert.deepEqual(a.outgoing.sort(), ['01_Slipbox/생각 B.md', `${dev}/Concepts/연결된 개념.md`, '20_Projects/blog/공개 글.md'].sort());
  assert.deepEqual(garden.edges.filter((edge) => edge.source === a.path).map((edge) => edge.target).sort(), ['01_Slipbox/생각 B.md', `${dev}/Concepts/연결된 개념.md`].sort());
  assert.doesNotMatch(JSON.stringify(garden), /초안|비공개 개념|DRAFT_SENTINEL|WITHHELD_SENTINEL/);
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

test('headingsFor keeps every heading, strips inline markup and suffixes duplicate ids', () => {
  const body = Array.from({ length: 12 }, (_, i) => `## ${i + 1}. 절`).join('\n\n') + '\n\n## 3. **DX와 DevRel** 그리고 `AX`\n\n### 절\n\n### 절';
  const headings = headingsFor(body);
  assert.equal(headings.length, 15);
  assert.equal(headings[12].title, '3. DX와 DevRel 그리고 AX');
  assert.deepEqual(headings.slice(13).map((h) => h.id), ['절', '절-2']);
});

test('headingsFor skips code examples and matches ids when an h1 shares the same title', () => {
  const body = '# 실제 절\n\n```markdown\n## 예시\n```\n\n    ## 코드\n\n## 실제 절\n\n하위 절\n-------\n\n~~~markdown\n### 숨김\n~~~';
  assert.deepEqual(headingsFor(body), [
    { id: '실제-절-2', level: 2, title: '실제 절' },
    { id: '하위-절', level: 2, title: '하위 절' }
  ]);
});

test('headingsFor ignores Obsidian-only comments, highlights, and block ids', () => {
  assert.deepEqual(headingsFor('## 제목 ^heading-id\n\n## 제목 %%숨김%%\n\n## ==강조 제목=='), [
    { id: '제목', level: 2, title: '제목' },
    { id: '제목-2', level: 2, title: '제목' },
    { id: '강조-제목', level: 2, title: '강조 제목' }
  ]);
});

const nextreeConfig = {
  ...config,
  externalPublications: [{ hosts: ['nextree.io', 'www.nextree.io'], publications: ['Nextree 기술 블로그'], name: '넥스트리' }]
};

test('external blog notes expose metadata and links while excluding original body, cards and assets', async () => {
  const externalSource = [
    '---',
    'created: 2026-09-06',
    'published: 2026-09-07',
    'status: published',
    'source: " HTTPS://WWW.NEXTREE.IO/external-post "',
    'publication: Nextree 기술 블로그',
    'thumbnail: "[[external-cover.svg]]"',
    'summary: 외부 글의 명시 요약',
    '---',
    '# 외부 원문 제목',
    'UNIQUE_EXTERNAL_BODY',
    '',
    '## UNIQUE_EXTERNAL_HEADING',
    '',
    '> [!article] UNIQUE_EXTERNAL_CAPTION',
    '> [[생각 B]]',
    '',
    '![[reviewed.svg]]',
    '![[external-only.svg]]'
  ].join('\n');
  const vaultRoot = await makeVault({
    ...files,
    '01_Slipbox/생각 A.md': `${files['01_Slipbox/생각 A.md']}\n\n[[외부 원문#UNIQUE_EXTERNAL_HEADING|정의]]\n\n> [!article] 외부 글\n> [[외부 원문]]`,
    '20_Projects/blog/외부 원문.md': externalSource,
    '20_Projects/blog/assets/external-only.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '20_Projects/blog/assets/external-cover.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>'
  });
  const garden = await assembleGarden({ vaultRoot, config: nextreeConfig, basePath: '/obsidian' });
  const external = garden.notes.find((note) => note.path === '20_Projects/blog/외부 원문.md');
  const referring = garden.notes.find((note) => note.path === '01_Slipbox/생각 A.md');
  assert.equal(external.contentMode, 'external');
  assert.equal(external.externalPublisher, '넥스트리');
  assert.equal(external.published, '2026-09-07');
  assert.equal(external.summary, '외부 글의 명시 요약');
  assert.equal(external.bodyHtml, '');
  assert.equal(external.bodyText, '');
  assert.deepEqual(external.headings, []);
  assert.equal(external.readingMinutes, 0);
  assert.deepEqual(external.articleCards, []);
  assert.equal(external.publishedUrl, 'https://www.nextree.io/external-post');
  const externalPost = garden.blog.publications.flatMap((group) => group.posts).find((item) => item.path === external.path);
  assert.equal(externalPost.summary, external.summary, '글 목록과 노트 엔트리가 같은 요약 규칙을 쓴다');
  assert.equal(externalPost.contentMode, external.contentMode);
  assert.equal(external.thumbnail, '20_Projects/blog/assets/external-cover.svg');
  assert.match(referring.bodyHtml, /article-card-slot/);
  assert.deepEqual(referring.articleCards, [{ url: external.url, title: '외부 원문 제목', caption: '외부 글' }]);
  assert.ok(garden.noteEdges.some((edge) => edge.source === referring.path && edge.target === external.path));
  for (const sentinel of ['UNIQUE_EXTERNAL_BODY', 'UNIQUE_EXTERNAL_HEADING', 'UNIQUE_EXTERNAL_CAPTION']) {
    assert.equal(JSON.stringify(garden).includes(sentinel), false, sentinel);
  }
  assert.equal(garden.assetCopies.has('_attachments/reviewed.svg'), true, '공개 노트 본문의 에셋은 유지된다');
  assert.equal(garden.assetCopies.has('20_Projects/blog/assets/external-only.svg'), false, '외부 글에서만 쓰던 본문 이미지는 출력하지 않는다');
});

test('external notes without an explicit summary do not fall back to body excerpts', async () => {
  const vaultRoot = await makeVault({
    ...files,
    '20_Projects/blog/요약 없는 외부 글.md': [
      '---', 'created: 2026-09-06', 'published: 2026-09-07', 'status: published',
      'source: https://nextree.io/no-summary', 'publication: Nextree 기술 블로그', '---',
      '# 요약 없는 외부 글', 'EXTERNAL_SUMMARY_SENTINEL'
    ].join('\n')
  });
  const garden = await assembleGarden({ vaultRoot, config: nextreeConfig, basePath: '/obsidian' });
  const note = garden.notes.find((item) => item.path === '20_Projects/blog/요약 없는 외부 글.md');
  const post = garden.blog.publications.flatMap((group) => group.posts).find((item) => item.path === note.path);
  assert.equal(note.summary, '');
  assert.equal(note.summaryIsExplicit, false);
  assert.equal(post.summary, '');
  assert.equal(note.bodyText, '');
  assert.equal(JSON.stringify(garden).includes('EXTERNAL_SUMMARY_SENTINEL'), false);
});

test('published posts from other publishers keep the full body and ordinary summary fallback', async () => {
  const vaultRoot = await makeVault({
    ...files,
    '20_Projects/blog/다른 발행처 글.md': [
      '---', 'created: 2026-09-06', 'published: 2026-09-07', 'status: published',
      'source: https://example.com/other', 'publication: Other Publisher', '---',
      '# 다른 발행처 글', 'OTHER_PUBLISHER_BODY'
    ].join('\n')
  });
  const garden = await assembleGarden({ vaultRoot, config: nextreeConfig, basePath: '/obsidian' });
  const note = garden.notes.find((item) => item.path === '20_Projects/blog/다른 발행처 글.md');
  assert.equal(note.contentMode, 'full');
  assert.equal(note.externalPublisher, '');
  assert.match(note.bodyHtml, /OTHER_PUBLISHER_BODY/);
  assert.match(note.summary, /OTHER_PUBLISHER_BODY/);
  assert.ok(note.readingMinutes > 0);
});

test('headingsFor skips headings quoted inside blockquotes and callouts', () => {
  const body = '## 배경\n\n본문\n\n> [!note]\n> ## 배경\n> 콜아웃 본문\n\n> ## 인용 안 제목\n\n## 정리';
  assert.deepEqual(headingsFor(body), [
    { id: '배경', level: 2, title: '배경' },
    { id: '정리', level: 2, title: '정리' }
  ]);
});

test('headingsFor drops escape backslashes from outline titles', () => {
  assert.deepEqual(headingsFor('## 1\\. Editor Config 요청'), [
    { id: '1-editor-config-요청', level: 2, title: '1. Editor Config 요청' }
  ]);
});

test('every outline id exists in the rendered body so sidebar links land on a heading', async () => {
  const note = '---\ncreated: 2026-09-07\n---\n# 콜아웃 노트\n## 배경\n본문\n\n> [!note]\n> ## 배경\n> 콜아웃 본문\n';
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/콜아웃 노트.md': note });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const entry = garden.notes.find((item) => item.path === '01_Slipbox/콜아웃 노트.md');
  const renderedIds = [...entry.bodyHtml.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(renderedIds, [...new Set(renderedIds)], '헤딩 id가 중복되지 않는다');
  for (const heading of entry.headings) assert.ok(renderedIds.includes(heading.id), `목차 id ${heading.id}가 본문에 없다`);
});

test('a basename shared with an unpublished draft still links to the public note', async () => {
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/AI 활용.md': '---\ncreated: 2026-09-06\nstatus: published\n---\n# AI 활용\n공개 글.',
    '20_Projects/blog/초고/AI 활용.md': '---\nstatus: draft\n---\n# AI 활용\nDRAFT_SENTINEL',
    '01_Slipbox/참조.md': '---\ncreated: 2026-09-07\n---\n# 참조\n[[AI 활용]]을 참조한다.'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const referrer = garden.notes.find((note) => note.path === '01_Slipbox/참조.md');
  const target = garden.notes.find((note) => note.path === '20_Projects/blog/AI 활용.md');
  assert.match(referrer.bodyHtml, new RegExp(`href="${target.url}"`));
  assert.doesNotMatch(referrer.bodyHtml, /private-note/);
  assert.ok(referrer.outgoing.includes('20_Projects/blog/AI 활용.md'));
});

test('frontmatter normalizes null values and scalar whitespace', async () => {
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/정규화.md': '---\ncreated: 2026-09-07\nstatus: null\ntype: hub   \npublication: null\n---\n# 정규화\n본문.'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const note = garden.notes.find((item) => item.path === '01_Slipbox/정규화.md');
  assert.equal(note.status, '');
  assert.equal(note.type, 'hub');
  assert.equal(note.publication, '');
});

test('a series hub stays off the site until one of its posts is published', async () => {
  const hub = (name) => `---\ncreated: 2026-09-01\ntype: series\nstatus: active\nsummary: ${name} 소개\n---\n# ${name}\n연재 소개.`;
  const episode = (name, status) => `---\ncreated: 2026-09-02\nstatus: ${status}\nseries: ${name}\nseries_order: 1\nsource: https://example.com/${status}\n---\n# ${name} 1화\n본문.`;
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/준비 중 연재.md': hub('준비 중 연재'),
    '20_Projects/blog/준비 중 연재 1화.md': episode('준비 중 연재', 'draft'),
    '20_Projects/blog/시작한 연재.md': hub('시작한 연재'),
    '20_Projects/blog/시작한 연재 1화.md': episode('시작한 연재', 'published')
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const titles = garden.notes.map((note) => note.title);
  assert.ok(!titles.includes('준비 중 연재'), '발행한 편이 하나도 없는 연재는 사이트에 나오지 않는다');
  assert.ok(titles.includes('시작한 연재'), '한 편이라도 발행하면 허브가 올라온다');
  assert.deepEqual(garden.blog.series.map((s) => s.title), ['시작한 연재']);
});

test('a series is dated by its latest published episode, not by the hub last_published field', async () => {
  // 허브의 last_published는 손으로 적는 값이라 새 편을 발행하고 고치지 않으면 옛 날짜로 남는다.
  const hub = (name, lastPublished) => `---\ncreated: 2026-01-01\ntype: series\nlast_published: ${lastPublished}\n---\n# ${name}\n연재 소개.`;
  const episode = (name, order, published) => `---\ncreated: 2026-01-01\npublished: ${published}\nstatus: published\nseries: ${name}\nseries_order: ${order}\n---\n# ${name} ${order}화\n본문.`;
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/잊힌 허브.md': hub('잊힌 허브', '2020-01-01'),
    '20_Projects/blog/잊힌 허브 1화.md': episode('잊힌 허브', 1, '2026-09-05'),
    '20_Projects/blog/잊힌 허브 2화.md': episode('잊힌 허브', 2, '2026-08-01'),
    '20_Projects/blog/앞선 허브.md': hub('앞선 허브', '2026-09-10'),
    '20_Projects/blog/앞선 허브 1화.md': episode('앞선 허브', 1, '2026-01-01')
  });
  const garden = await assembleGarden({ vaultRoot, config, today: '2026-09-11' });
  assert.deepEqual(garden.blog.series.map((s) => [s.title, s.lastPublished]), [['잊힌 허브', '2026-09-05'], ['앞선 허브', '2026-01-01']],
    '편의 순서가 아니라 가장 늦은 발행일을 쓰고, 그 날짜로 연재를 정렬한다');
});

test('an author-only section is cut from the published body but stays in the vault file', async () => {
  const hub = [
    '---', 'created: 2026-09-01', 'type: series', 'status: active', 'summary: 연재 소개', '---',
    '# 검증 연재', '연재 소개 문장.', '',
    '## 연재 흐름', '- 1화 소개', '',
    '## 운영 메모', '- 실제 발행 상태는 각 글의 frontmatter를 정본으로 삼는다.', '- OPERATIONAL_SENTINEL', '',
    '## 연관된 노트', '- [[생각 B]]'
  ].join('\n');
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/검증 연재.md': hub,
    '20_Projects/blog/검증 연재 1화.md': '---\ncreated: 2026-09-02\nstatus: published\nseries: 검증 연재\nseries_order: 1\n---\n# 검증 연재 1화\n본문.'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const note = garden.notes.find((item) => item.path === '20_Projects/blog/검증 연재.md');
  assert.ok(note, '허브는 사이트에 있다');
  assert.doesNotMatch(note.bodyHtml, /운영 메모|OPERATIONAL_SENTINEL|frontmatter/);
  assert.doesNotMatch(note.bodyText, /OPERATIONAL_SENTINEL/, '검색 색인에도 남지 않는다');
  assert.equal(garden.notes.some((n) => JSON.stringify(n.headings).includes('운영 메모')), false, '목차에도 없다');
  assert.match(note.bodyHtml, /연재 흐름/, '앞 절은 남는다');
  assert.match(note.bodyHtml, /연관된 노트/, '뒤 절도 남는다');
  const raw = await fs.readFile(path.join(vaultRoot, '20_Projects/blog/검증 연재.md'), 'utf8');
  assert.match(raw, /OPERATIONAL_SENTINEL/, 'vault 원문은 그대로다');
});

test('an author-only section ends at the next heading, not at a comment line inside its code block', async () => {
  const hub = [
    '---', 'created: 2026-09-01', 'type: series', 'status: active', 'summary: 연재 소개', '---',
    '# 검증 연재', '연재 소개 문장.', '',
    '## 운영 메모', '```sh', '# 발행 확인', 'echo OPERATIONAL_SENTINEL', '```', '- 꼬리 메모 TAIL_SENTINEL', '',
    '## 연관된 노트', '- [[생각 B]]'
  ].join('\n');
  const vaultRoot = await makeVault({ ...files,
    '20_Projects/blog/검증 연재.md': hub,
    '20_Projects/blog/검증 연재 1화.md': '---\ncreated: 2026-09-02\nstatus: published\nseries: 검증 연재\nseries_order: 1\n---\n# 검증 연재 1화\n본문.'
  });
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const note = garden.notes.find((item) => item.path === '20_Projects/blog/검증 연재.md');
  assert.doesNotMatch(note.bodyHtml, /운영 메모|OPERATIONAL_SENTINEL|TAIL_SENTINEL/, '코드 블록 안의 # 줄에서 절이 끝나지 않는다');
  assert.match(note.bodyHtml, /연관된 노트/, '다음 절은 남는다');
});

test('a note date that is not a real day fails the build and names the file', async () => {
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/생각 B.md': files['01_Slipbox/생각 B.md'].replace('created: 2026-09-02', 'created: 2026-02-30') });
  await assert.rejects(assembleGarden({ vaultRoot, config }), /created[\s\S]*2026-02-30[\s\S]*01_Slipbox\/생각 B\.md/);
});

test('blank optional YAML dates are accepted while blank created is rejected', async () => {
  const notePath = '01_Slipbox/생각 B.md';
  const vaultRoot = await makeVault({ ...files, [notePath]: '---\ncreated: 2026-09-02\npublished:\nupdated:\n---\n# 생각 B\n공개 본문.' });
  const garden = await assembleGarden({ vaultRoot, config, today: '2026-09-11' });
  const note = garden.notes.find((note) => note.path === notePath);
  assert.equal(note.date, '2026-09-02');
  assert.equal(note.published, '');
  assert.equal(note.updated, '');
  await fs.writeFile(path.join(vaultRoot, notePath), '---\ncreated:\n---\n# 생각 B\n공개 본문.');
  await assert.rejects(assembleGarden({ vaultRoot, config, today: '2026-09-11' }), /Missing created date.*생각 B/);
});

test('assembly uses first publication dates for blog, slipbox and development notes', async () => {
  const metadata = 'created: 2026-09-01\npublished: 2026-09-10\nupdated: 2026-09-08';
  const vaultRoot = await makeVault({ ...files,
    '01_Slipbox/생각 B.md': `---\n${metadata}\n---\n# 생각 B\n공개 본문.`,
    [`${dev}/Concepts/연결된 개념.md`]: `---\n${metadata}\nsummary: 개념 요약\n---\n# 연결된 개념\n공개 본문.`,
    '20_Projects/blog/공개 글.md': `---\n${metadata}\nstatus: published\n---\n# 공개 글\n공개 본문.`
  });
  const garden = await assembleGarden({ vaultRoot, config, today: '2026-09-11' });
  for (const notePath of ['01_Slipbox/생각 B.md', `${dev}/Concepts/연결된 개념.md`, '20_Projects/blog/공개 글.md']) {
    const note = garden.notes.find((note) => note.path === notePath);
    assert.equal(note.date, '2026-09-10');
    assert.equal(note.updated, '');
  }
});

test('a note dated after the given build day fails the build', async () => {
  const vaultRoot = await makeVault(files);
  await assert.rejects(assembleGarden({ vaultRoot, config, today: '2026-09-03' }), /created[\s\S]*2026-09-0[45]/);
  await assert.doesNotReject(assembleGarden({ vaultRoot, config, today: '2026-09-05' }));
});

test('public notes carry updated only when it is later than their date, and external articles never do', async () => {
  const vaultRoot = await makeVault({
    ...files,
    '01_Slipbox/생각 A.md': files['01_Slipbox/생각 A.md'].replace('created: 2026-09-01', 'created: 2026-09-01\nupdated: 2026-09-08'),
    '20_Projects/blog/외부 원문.md': '---\ncreated: 2026-09-06\npublished: 2026-09-07\nupdated: 2026-09-09\nstatus: published\nsource: https://www.nextree.io/external-post\npublication: Nextree 기술 블로그\nsummary: 외부 글 요약\n---\n# 외부 원문\n본문.'
  });
  const garden = await assembleGarden({ vaultRoot, config: nextreeConfig, today: '2026-09-11' });
  const byPath = (notePath) => garden.notes.find((note) => note.path === notePath);
  assert.equal(byPath('01_Slipbox/생각 A.md').updated, '2026-09-08');
  assert.equal(byPath('01_Slipbox/생각 B.md').updated, '');
  assert.equal(byPath('20_Projects/blog/외부 원문.md').updated, '', '본문을 싣지 않는 외부 발행 글은 수정일을 내보내지 않는다');
});

// 폴더가 없는 것(ENOENT)만 건너뛴다. 그 밖의 읽기 오류를 건너뛰면 공개할 노트가 조용히 사이트에서 빠진다.
const rootIgnoresPermissions = process.getuid?.() === 0 && 'root는 파일 권한 검사를 받지 않는다';

test('a missing books folder is skipped with a warning', async () => {
  const withoutBooks = Object.fromEntries(Object.entries(files).filter(([file]) => !file.startsWith('30_Resources/References/Books/')));
  const vaultRoot = await makeVault(withoutBooks);
  const garden = await assembleGarden({ vaultRoot, config });
  assert.deepEqual(garden.books, []);
});

test('an include path that is a file fails the build instead of being skipped as missing', async () => {
  const vaultRoot = await makeVault({ ...files, '00_Inbox/파일.md': '---\ncreated: 2026-09-01\n---\n# 파일' });
  await assert.rejects(assembleGarden({ vaultRoot, config: { ...config, include: [...config.include, { path: '00_Inbox/파일.md', mode: 'all' }] } }), { code: 'ENOTDIR' });
});

test('an unreadable folder inside a public folder fails the build instead of dropping the whole folder', { skip: rootIgnoresPermissions }, async () => {
  const vaultRoot = await makeVault({ ...files, '01_Slipbox/잠긴 폴더/노트.md': '---\ncreated: 2026-09-01\n---\n# 노트' });
  const locked = path.join(vaultRoot, '01_Slipbox/잠긴 폴더');
  await fs.chmod(locked, 0o000);
  try {
    await assert.rejects(assembleGarden({ vaultRoot, config }), { code: 'EACCES' });
  } finally {
    await fs.chmod(locked, 0o755);
  }
});

test('an unreadable book fails the build instead of leaving the shelf half full', { skip: rootIgnoresPermissions }, async () => {
  const vaultRoot = await makeVault({ ...files, '30_Resources/References/Books/잠긴 책.md': '---\ntitle: 잠긴 책\ncreated: 2026-08-01\n---\n# 잠긴 책' });
  const locked = path.join(vaultRoot, '30_Resources/References/Books/잠긴 책.md');
  await fs.chmod(locked, 0o000);
  try {
    await assert.rejects(assembleGarden({ vaultRoot, config }), { code: 'EACCES' });
  } finally {
    await fs.chmod(locked, 0o644);
  }
});
