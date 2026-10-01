import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FEEDBACK_LABEL, FEEDBACK_TEMPLATE, feedbackUrl } from '../src/lib/feedback.ts';

const templates = new URL('../.github/ISSUE_TEMPLATE/', import.meta.url);
const form = readFileSync(new URL(FEEDBACK_TEMPLATE, templates), 'utf8');
const field = (key: string) => form.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1] ?? '';

test('the link opens the feedback form with the page address filled in', () => {
  const url = new URL(feedbackUrl('https://taez224.github.io/posts/a/'));
  assert.equal(`${url.origin}${url.pathname}`, 'https://github.com/taez224/taez224.github.io/issues/new');
  assert.deepEqual([...url.searchParams], [['template', 'feedback.yml'], ['page', 'https://taez224.github.io/posts/a/']]);
});

test('a page without a known address leaves the page field empty', () => {
  assert.deepEqual([...new URL(feedbackUrl(null)).searchParams.keys()], ['template']);
});

// 제목을 글 제목으로 채우면 독자가 그대로 보내, 같은 글의 제보가 모두 같은 제목이 되고 제목에 증상이 남지 않는다.
// 링크도 폼도 제목을 채우지 않으면 GitHub이 제목 없이는 제출을 막으므로 독자가 한 줄로 증상을 적는다.
test('the title is left for the reader to write', () => {
  assert.equal(new URL(feedbackUrl('https://taez224.github.io/posts/a/')).searchParams.has('title'), false);
  assert.doesNotMatch(form, /^title:/m, '폼에 기본 제목이 없다');
});

test('the link names the form and fills fields the form really has', () => {
  assert.ok(existsSync(new URL(FEEDBACK_TEMPLATE, templates)), '폼 파일이 있다');
  assert.equal(field('name'), FEEDBACK_LABEL, '링크 문구와 폼 이름이 같다');
  const ids = [...form.matchAll(/^\s+id: (\w+)$/gm)].map((match) => match[1]);
  const keys = [...new URL(feedbackUrl('https://taez224.github.io/')).searchParams.keys()].filter((key) => key !== 'template');
  for (const key of keys) assert.ok(ids.includes(key), `폼에 ${key} 칸이 있다`);
});
