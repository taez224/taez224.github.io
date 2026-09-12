import test from 'node:test';
import assert from 'node:assert/strict';
import { headingsFor } from '../src/lib/note-body.ts';

// 공개 본문에서 목차를 뽑는 규칙. 조립 전체를 돌리지 않고 함수만 검사한다.

test('table of contents excludes headings inside multiline Obsidian comments', () => {
  assert.deepEqual(headingsFor('## 공개\n\n%%\n## 숨김\n%%\n\n## 끝'), [
    { id: '공개', level: 2, title: '공개' },
    { id: '끝', level: 2, title: '끝' }
  ]);
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
