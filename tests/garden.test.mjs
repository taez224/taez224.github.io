import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { headingsFor, assembleGarden } from '../src/lib/garden.mjs';

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
  assert.deepEqual(s1.headings, []);
  assert.ok(s1.outgoing.includes('20_Projects/blog/S2.md'));
  assert.match(s2.bodyHtml, /연결된 노트/);
  assert.ok(s2.headings.some((heading) => heading.id === '연결된-노트'));
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

const aboutPath = '20_Projects/obsidian-garden/이 위키에 대해.md';

test('renderPage links public notes and marks unpublished ones instead of failing the build', async () => {
  const vaultRoot = await makeVault(files);
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const target = garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md');
  const html = garden.renderPage({ sourcePath: aboutPath, title: '이 위키에 대해', body: '# 이 위키에 대해\n[[생각 B]]와 [[초안]]을 가리킨다.' });
  assert.match(html, new RegExp(`href="${target.url}"`));
  assert.match(html, /private-note/);
  assert.doesNotMatch(html, /DRAFT_SENTINEL/, '비공개 노트의 본문은 새지 않는다');
  assert.doesNotMatch(html, /<h1/, '페이지가 제목을 직접 그리므로 본문의 첫 제목은 뺀다');
});

test('renderPage turns a section link to the page itself into an anchor', async () => {
  const vaultRoot = await makeVault(files);
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const html = garden.renderPage({ sourcePath: aboutPath, title: '이 위키에 대해', body: '## 기록을 다루는 방식\n[[#기록을 다루는 방식]]으로 돌아간다.' });
  assert.match(html, /href="#기록을-다루는-방식"/);
});

test('renderPage collects article cards the way a note body does', async () => {
  const vaultRoot = await makeVault(files);
  const garden = await assembleGarden({ vaultRoot, config, basePath: '/obsidian' });
  const target = garden.notes.find((note) => note.path === '01_Slipbox/생각 B.md');
  const articleCards = [];
  const html = garden.renderPage({ sourcePath: aboutPath, title: '이 위키에 대해', body: '> [!article] 함께 읽기\n> [[생각 B]]', articleCards });
  assert.match(html, /article-card-slot/);
  assert.deepEqual(articleCards, [{ url: target.url, title: target.title, caption: '함께 읽기' }]);
});
