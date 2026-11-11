import test from 'node:test';
import assert from 'node:assert/strict';
import { hubSections, readingConnections } from '../src/lib/reading-connections.ts';
import { seriesNeighbors } from '../src/lib/note-nav.ts';
import type { PublicNote } from '../src/lib/content-model.ts';
const n = (path: string, extra: Partial<PublicNote> = {}) => ({ path, url: `/notes/${path}/`, displayTitle: path, title: path, type: 'note', topic: 'AI', bodyHtml: '', headings: [], outgoing: [], incoming: [], ...extra }) as PublicNote;
const a = n('a'), b = n('b');
const hub = n('hub', { type: 'hub', headings: [{ id: 'one', title: '첫 절', level: 2 }, { id: 'two', title: '둘째 절', level: 2 }], bodyHtml: '<h2 id="one">첫 절</h2><ul><li><a href="/notes/a/#detail">A</a></li><li><a href="/notes/a/">A</a></li><li><a href="/private/">비공개</a></li></ul><blockquote><h2 id="two">인용 제목</h2></blockquote><div class="article-card-slot"><a href="/notes/b/">B</a></div><h2 id="two">둘째 절</h2><ul><li><a href="/notes/a/">A</a></li></ul>' });
test('hub sections preserve authored order and resolve only public list and card links', () => {
  assert.deepEqual(hubSections(hub, [hub, a, b]).map(s => [s.id, s.items.map(i => i.path)]), [['one', ['a', 'b']], ['two', ['a']]]);
});
test('reader connections deduplicate directions and separate hubs with independent section links', () => {
  const current = n('a', { outgoing: ['b', 'hub'], incoming: ['b', 'hub'] });
  const r = readingConnections(current, [current, b, hub], [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'hub', target: 'a' }]);
  assert.deepEqual(r.neighbors.map(n => n.path), ['b']);
  assert.equal(r.edges.length, 1);
  assert.deepEqual(r.hubs[0].sections.map(s => s.id), ['one', 'two']);
});
test('only pure public related lists are moved; prose and unresolved links remain intact', () => {
  const html = '<p>본문</p><h2 id="related">연관된 노트</h2>\n<ul><li><a class="internal-note-link" href="/notes/b/">별칭</a></li></ul>\n<h2 id="refs">자료</h2><p>자료 설명</p>';
  const current = n('a', { outgoing: ['b'], bodyHtml: html, headings: [{ id: 'related', title: '연관된 노트', level: 2 }] });
  const moved = readingConnections(current, [current, b], []);
  assert.equal(moved.headingId, 'related');
  assert.equal(moved.bodyHtml, '<p>본문</p><h2 id="refs">자료</h2><p>자료 설명</p>');
  for (const unsafe of [html.replace('</a></li>', '</a> 설명</li>'), html.replace('/notes/b/', '/private/'), html.replace('<ul>', '<p>설명</p><ul>'), html.replace('</a></li>', '</a><a href="/notes/b/">두 번째 링크</a></li>'), html.replace('별칭</a>', '<img src="/image.webp">별칭</a>')]) {
    const kept = readingConnections({ ...current, bodyHtml: unsafe }, [current, b], []);
    assert.equal(kept.bodyHtml, unsafe);
    assert.equal(kept.headingTitle, '더 읽기');
  }
});
test('hub-only and empty neighborhoods remain useful without inventing neighbors', () => {
  const current = n('a', { incoming: ['hub'] });
  const r = readingConnections(current, [current, hub], []);
  assert.equal(r.neighbors.length, 0);
  assert.equal(r.hubs.length, 1);
  assert.equal(readingConnections(a, [a], []).hubs.length, 0);
});

test('series entries and their hub are not repeated in reader connections', () => {
  const c = n('c'), seriesHub = n('series', { type: 'series' });
  const current = n('a', { outgoing: ['b', 'c', 'series'] });
  const series = seriesNeighbors(current, [{ title: '연재', noteUrl: seriesHub.url, posts: [current, b] }]);
  const result = readingConnections(current, [current, b, c, seriesHub], [], series);
  assert.deepEqual(result.neighbors.map(n => n.path), ['c']);
});

test('authored recommendations and article cards keep their prose without repeating automatic links', () => {
  const c = n('c'), d = n('d');
  const html = '<p><a href="/notes/d/">본문 링크</a></p><div class="article-card-slot"><a href="/notes/c/">글 카드</a></div><h2 id="related">연관된 노트</h2><p>설명</p><ul><li><a href="/notes/b/#part">B</a> - 추천 이유</li><li>공개하지 않은 자료</li></ul><h2 id="next">다음 절</h2><p><a href="/notes/d/">D</a></p>';
  const current = n('a', { bodyHtml: html, headings: [{ id: 'related', title: '연관된 노트', level: 2 }], outgoing: ['b', 'c', 'd'] });
  const result = readingConnections(current, [current, b, c, d], [{ source: 'a', target: 'b' }, { source: 'b', target: 'd' }, { source: 'a', target: 'd' }]);
  assert.equal(result.bodyHtml, html);
  assert.deepEqual(result.neighbors.map(n => n.path), ['d']);
  assert.deepEqual(result.edges, [{ source: 'a', target: 'd' }]);
});

test('hub pages preserve authored lists and do not append their contents as a second neighborhood', () => {
  const current = { ...hub, outgoing: ['a', 'b'] };
  const result = readingConnections(current, [current, a, b], []);
  assert.equal(result.bodyHtml, hub.bodyHtml);
  assert.deepEqual(result.neighbors, []);
});

test('one-item topic sections remain navigable while supplementary lists are not topic destinations', () => {
  const headings = ['관련 글', '검증과 안전장치', '연관된 글', '더 읽어볼 자료'].map((title, i) => ({ id: String(i), title, level: 2 }));
  const current = n('hub', { type: 'hub', headings, bodyHtml: headings.map(h => `<h2 id="${h.id}">${h.title}</h2><ul><li><a href="/notes/a/">A</a></li></ul>`).join('') });
  assert.deepEqual(hubSections(current, [a]).map(s => [s.title, s.items.length]), [['검증과 안전장치', 1]]);
  assert.deepEqual(readingConnections({ ...a, incoming: ['hub'] }, [a, current], []).hubs[0].sections, [{ id: '1', title: '검증과 안전장치' }]);
});
