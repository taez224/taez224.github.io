import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNoteTargets } from '../src/lib/markdown.ts';
import { analyzeText } from '../src/lib/text.ts';
import { render, renderWithVisibility } from './helpers/markdown.ts';

// 각주 문법은 Obsidian과 같다. 본문에는 윗첨자 번호만, 글 끝에는 "각주" 목록이 나온다.
const footnoteList = (html: string) => html.match(/<section class="footnotes">[\s\S]*<\/section>/)?.[0] ?? '';

test('a footnote reference becomes a superscript number linked to the list at the end', () => {
  const html = render('note.md', '본문이다.[^1]\n\n[^1]: 각주 내용이다.');
  assert.match(html, /<p>본문이다\.<sup class="footnote-ref"><a href="#fn:1" id="fnref:1" aria-label="각주 1">1<\/a><\/sup><\/p>/);
  const list = footnoteList(html);
  assert.match(list, /^<section class="footnotes"><h2 class="footnotes-title">각주<\/h2>\s*<ol>/);
  assert.match(list, /<li id="fn:1"><p>각주 내용이다\. <a href="#fnref:1" class="footnote-backref" aria-label="1번 각주를 단 곳으로">↩︎<\/a><\/p>\s*<\/li>/);
  assert.doesNotMatch(html, /\[\^1\]/, '정의 줄이 글자로 남지 않는다');
  assert.doesNotMatch(html, /<hr/, '목록 앞 구분선은 CSS가 그린다');
});

test('named footnotes are numbered in the order they are first referenced, like Obsidian', () => {
  const html = render('note.md', '가[^b] 나[^a]\n\n[^a]: 에이\n[^b]: 비');
  assert.match(html, /가<sup class="footnote-ref"><a href="#fn:1" id="fnref:1" aria-label="각주 1">1<\/a><\/sup>/);
  assert.match(html, /나<sup class="footnote-ref"><a href="#fn:2" id="fnref:2" aria-label="각주 2">2<\/a><\/sup>/);
  assert.ok(footnoteList(html).indexOf('비') < footnoteList(html).indexOf('에이'), '먼저 부른 각주가 목록 앞에 온다');
});

test('an inline footnote joins the same numbered list', () => {
  const html = render('note.md', '본문^[바로 쓴 각주] 다음[^1]\n\n[^1]: 정의한 각주');
  assert.match(html, /본문<sup class="footnote-ref"><a href="#fn:1"/);
  assert.match(html, /다음<sup class="footnote-ref"><a href="#fn:2"/);
  assert.match(footnoteList(html), /<li id="fn:1"><p>바로 쓴 각주 <a/);
  assert.match(footnoteList(html), /<li id="fn:2"><p>정의한 각주 <a/);
});

test('a footnote referenced twice gets one back link per reference', () => {
  const html = render('note.md', '가[^1] 나[^1]\n\n[^1]: 내용');
  assert.match(html, /가<sup class="footnote-ref"><a href="#fn:1" id="fnref:1" aria-label="각주 1">1<\/a>/);
  assert.match(html, /나<sup class="footnote-ref"><a href="#fn:1" id="fnref:1-2" aria-label="각주 1">1<\/a>/);
  const list = footnoteList(html);
  assert.match(list, /<a href="#fnref:1" class="footnote-backref" aria-label="1번 각주를 단 곳으로">/);
  assert.match(list, /<a href="#fnref:1-2" class="footnote-backref" aria-label="1번 각주를 단 2번째 곳으로">/);
});

test('a footnote reference without a definition stays as written', () => {
  const html = render('note.md', '본문[^없음] 끝');
  assert.match(html, /<p>본문\[\^없음\] 끝<\/p>/);
  assert.doesNotMatch(html, /footnotes/);
});

test('footnote text keeps Obsidian inline syntax such as highlights', () => {
  // 인라인 각주의 내용도 형광 규칙을 거친다. 각주 목록을 문서 끝으로 옮기는 규칙이 형광 규칙보다 먼저 돌아야 한다.
  const html = render('note.md', '본문[^1] 인라인^[==바로 쓴 형광==]\n\n[^1]: ==정의한 형광==');
  assert.match(footnoteList(html), /<mark>정의한 형광<\/mark>/);
  assert.match(footnoteList(html), /<mark>바로 쓴 형광<\/mark>/);
});

test('a private note linked from a footnote shows only the safe author label', () => {
  // 각주 내용도 본문 링크와 같은 규칙을 거쳐, 비공개 노트의 경로·제목·조각을 내보내지 않는다.
  const html = renderWithVisibility()('x.md', '본문[^1] 인라인^[[[hidden/private.md#SECRET_FRAGMENT|인라인 별칭]]]\n\n[^1]: [[hidden/private.md#SECRET_FRAGMENT|정의 별칭]]');
  assert.match(footnoteList(html), /<span class="private-note">정의 별칭 /);
  assert.match(footnoteList(html), /<span class="private-note">인라인 별칭 /);
  assert.doesNotMatch(html, /hidden\/|private\.md|SECRET|NEVER_SHOW/);
});

test('the footnote list title stays out of the table of contents', () => {
  const headings: { id: string; level: number; title: string }[] = [];
  render('note.md', '## 절\n\n본문[^1]\n\n[^1]: 내용', { headings });
  assert.deepEqual(headings.map((heading) => heading.title), ['절']);
});

test('a link inside a footnote counts as a reference to that note', () => {
  assert.deepEqual(extractNoteTargets('본문[^1] 인라인^[[[다른 노트]]]\n\n[^1]: [[대상 노트]]'), ['다른 노트', '대상 노트']);
});

test('search text keeps footnote text while the summary excerpt leaves it out', () => {
  const text = analyzeText('본문 문장이다.[^1] 이어지는^[인라인 각주] 문장이다.\n\n[^1]: 정의한 각주 문장이다.');
  assert.equal(text.excerptText, '본문 문장이다. 이어지는 문장이다.', '요약에는 번호도 각주 문장도 섞이지 않는다');
  assert.match(text.bodyText, /정의한 각주 문장이다/);
  assert.match(text.bodyText, /인라인 각주/);
  assert.doesNotMatch(text.bodyText, /\[\^1\]/);
});

test('footnote anchors do not collide with heading or block IDs', () => {
  const html = render('note.md', '## fn-1\n\n## fnref-1\n\n본문[^a] 다시[^a]\n\n블록 ^fn-2\n\n[^a]: 내용');
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('fn-1'));
  assert.ok(ids.includes('fn:1'));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]));
});
