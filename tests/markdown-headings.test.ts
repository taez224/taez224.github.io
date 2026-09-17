import test from 'node:test';
import assert from 'node:assert/strict';
import type { PublicNote } from '../src/lib/content-model.ts';
import { render } from './helpers/markdown.ts';

// 목차는 렌더러가 id를 매기면서 함께 모은다. 조립 전체를 돌리지 않고 렌더러의 출력 인자만 검사한다.
function headingsOf(source: string) {
  const headings: PublicNote['headings'] = [];
  render('x.md', source, { headings });
  return headings;
}

test('heading ids and the table of contents ignore Obsidian-only comments, highlights, and block ids', () => {
  const headings: PublicNote['headings'] = [];
  const html = render('x.md', '## 제목 ^heading-id\n\n## 제목 %%숨김%%\n\n## ==강조 제목==', { headings });
  assert.match(html, /<h2 id="제목">제목/);
  assert.match(html, /<h2 id="제목-2">제목/);
  assert.match(html, /<h2 id="강조-제목">/);
  assert.deepEqual(headings, [
    { id: '제목', level: 2, title: '제목' },
    { id: '제목-2', level: 2, title: '제목' },
    { id: '강조-제목', level: 2, title: '강조 제목' }
  ]);
});

test('table of contents excludes headings inside multiline Obsidian comments', () => {
  assert.deepEqual(headingsOf('## 공개\n\n%%\n## 숨김\n%%\n\n## 끝'), [
    { id: '공개', level: 2, title: '공개' },
    { id: '끝', level: 2, title: '끝' }
  ]);
});

test('the table of contents keeps every heading, strips inline markup and suffixes duplicate ids', () => {
  const body = Array.from({ length: 12 }, (_, i) => `## ${i + 1}. 절`).join('\n\n') + '\n\n## 3. **DX와 DevRel** 그리고 `AX`\n\n### 절\n\n### 절';
  const headings = headingsOf(body);
  assert.equal(headings.length, 15);
  assert.equal(headings[12].title, '3. DX와 DevRel 그리고 AX');
  assert.deepEqual(headings.slice(13).map((h) => h.id), ['절', '절-2']);
});

test('the table of contents skips code examples and matches ids when an h1 shares the same title', () => {
  const body = '# 실제 절\n\n```markdown\n## 예시\n```\n\n    ## 코드\n\n## 실제 절\n\n하위 절\n-------\n\n~~~markdown\n### 숨김\n~~~';
  const headings: PublicNote['headings'] = [];
  const html = render('x.md', body, { headings });
  assert.deepEqual(headings, [
    { id: '실제-절-2', level: 2, title: '실제 절' },
    { id: '하위-절', level: 2, title: '하위 절' }
  ]);
  assert.match(html, /<h1 id="실제-절">실제 절<\/h1>/);
  assert.match(html, /<h2 id="실제-절-2">실제 절<\/h2>/);
});

test('the table of contents skips headings quoted inside blockquotes and callouts', () => {
  const body = '## 배경\n\n본문\n\n> [!note]\n> ## 배경\n> 콜아웃 본문\n\n> ## 인용 안 제목\n\n## 정리';
  assert.deepEqual(headingsOf(body), [
    { id: '배경', level: 2, title: '배경' },
    { id: '정리', level: 2, title: '정리' }
  ]);
});

test('the table of contents drops escape backslashes from outline titles', () => {
  assert.deepEqual(headingsOf('## 1\\. Editor Config 요청'), [
    { id: '1-editor-config-요청', level: 2, title: '1. Editor Config 요청' }
  ]);
});

test('setext heading ids leave the underline out', () => {
  const html = render('x.md', '작은 제목\n----\n\n큰 제목\n====\n\n본문');
  assert.match(html, /<h2 id="작은-제목">작은 제목<\/h2>/);
  assert.match(html, /<h1 id="큰-제목">큰 제목<\/h1>/);
});
