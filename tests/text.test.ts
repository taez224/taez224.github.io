import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText } from '../src/lib/text.ts';

const searchText = (body: string) => analyzeText(body).bodyText;

test('search text excludes Obsidian comments but retains literal code examples', () => {
  const text = searchText('공개\n%%\n비공개 메모\n%%\n\n`%%코드 예시%%`');
  assert.ok(text.includes('공개'));
  assert.ok(text.includes('%%코드 예시%%'));
  assert.ok(!text.includes('비공개 메모'));
});

test('search text strips markdown syntax but keeps heading and link text', () => {
  const body = `# 제목\n\n> [!bug] 증상\n> 배포가 **멈춘다**.\n\n## 원인\n\n[[다른 노트|별칭]]과 [[세 번째 노트]]를 보라. [문서](https://x.y)\n\n\`\`\`java\nSEARCHABLE_CODE\n\`\`\`\n\n- 항목 \`inline\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;
  const text = searchText(body);
  assert.match(text, /제목 증상 배포가 멈춘다\. 원인 별칭과 세 번째 노트를 보라\. 문서 SEARCHABLE_CODE 항목 inline a b 1 2/);
  assert.doesNotMatch(text, /\[\[|\*\*|```|\|---/);
});

test('search text keeps fenced code content while dropping the fence markers', () => {
  const text = searchText('설명 문단\n\n```js\nconst cache_key = 1;\n```\n');
  assert.match(text, /cache_key/);
  assert.doesNotMatch(text, /```/);
});

test('search text keeps indented code content', () => {
  assert.match(searchText('일반 문단\n\n    function toLabelValue() {}\n'), /toLabelValue/);
});

test('search text keeps content from tilde-fenced code blocks and drops the fence markers', () => {
  const text = searchText('~~~python\nSEARCHABLE_TILDE\n~~~');
  assert.match(text, /SEARCHABLE_TILDE/);
  assert.doesNotMatch(text, /~~~/);
});

test('search text removes HTML comments entirely, including their content', () => {
  const text = searchText('보이는 텍스트 <!-- 숨겨진 코멘트 COMMENT_SENTINEL --> 계속.');
  assert.doesNotMatch(text, /COMMENT_SENTINEL/);
  assert.match(text, /보이는 텍스트/);
  assert.match(text, /계속\./);
});

test('search text discards script block content, not just the tags', () => {
  const text = searchText('텍스트 시작\n\n<script>const SCRIPT_SENTINEL = 1;</script>\n\n텍스트 끝');
  assert.doesNotMatch(text, /SCRIPT_SENTINEL/);
  assert.doesNotMatch(text, /<script>|<\/script>/);
  assert.match(text, /텍스트 시작/);
  assert.match(text, /텍스트 끝/);
});

test('search text keeps single spacing around emphasis markers inside a sentence', () => {
  const text = searchText('이것은 **중요한** 문장이고 *강조*도 있다.');
  assert.equal(text, '이것은 중요한 문장이고 강조도 있다.');
  assert.doesNotMatch(text, /\*/);
});

test('search text drops prose block ids but keeps code block and inline code content', () => {
  assert.equal(searchText('문장 ^prose-id\n\n```md\n코드 ^code-id\n```\n\n`인라인 ^inline-id`'), '문장 코드 ^code-id 인라인 ^inline-id');
});

test('search text keeps image alt text without Obsidian size suffixes', () => {
  assert.equal(searchText('![설명|300](https://example.com/a.png) ![250](https://example.com/b.png) ![2024년](https://example.com/c.png) 끝'), '설명 2024년 끝');
});

test('search text drops task list markers but keeps escaped ones', () => {
  assert.equal(searchText('- [ ] 할 일\n- [x] 한 일\n- \\[x\\] 글자'), '할 일 한 일 [x] 글자');
});

// 요약 발췌는 검색 텍스트와 같은 파싱에서 나오되, 본문 흐름의 제목과 코드 블록을 뺀다.
test('the summary excerpt drops headings and code blocks but keeps inline code', () => {
  assert.deepEqual(analyzeText('## 제목\n\n본문 `인라인`\n\n```\n코드\n```'), { bodyText: '제목 본문 인라인 코드', excerptText: '본문 인라인' });
});

test('the summary excerpt omits fenced and tilde code that search text keeps', () => {
  const { bodyText, excerptText } = analyzeText([
    '명령의 목적을 설명한다.', '',
    '```sh', 'brew install CODE_ONLY_SENTINEL', '```', '',
    '~~~sh', 'TILDE_ONLY_SENTINEL', '~~~', '',
    '본문의 `inline API`는 남긴다.'
  ].join('\n'));
  assert.equal(excerptText, '명령의 목적을 설명한다. 본문의 inline API는 남긴다.');
  assert.match(bodyText, /CODE_ONLY_SENTINEL/);
  assert.match(bodyText, /TILDE_ONLY_SENTINEL/);
});

test('the summary excerpt keeps table text without image or table markup', () => {
  const { excerptText } = analyzeText('![](https://example.com/tool.png)\n\n| 명령 | 설명 |\n| --- | --- |\n| rg | 검색 |\n\n도구를 고르는 기준.');
  assert.equal(excerptText, '명령 설명 rg 검색 도구를 고르는 기준.');
  assert.doesNotMatch(excerptText, /!\[|https?:\/\/|\|/);
});
