import test from 'node:test';
import assert from 'node:assert/strict';
import { feedEntries, feedItems, renderFeed } from '../src/lib/rss.mjs';
const options = { site: 'https://example.com', basePath: '/obsidian', now: new Date('2026-09-06T12:00:00Z') };
const note = extra => ({ title: '생각', kind: 'slipbox', type: 'permanent', date: '2026-09-01', url: '/obsidian/notes/test/', summary: '요약', ...extra });
const post = extra => note({ kind: 'blog', status: 'published', published: '2026-09-02', publishedUrl: 'https://publisher.test/article', ...extra });
test('articles link to publishers, notes link to garden; drafts and unsupported sections are excluded', () => {
 const items = feedItems([note(), post(), post({ status: 'draft' }), note({ kind: 'development' }), note({ type: 'hub' }), note({ type: 'series' })], options);
 assert.deepEqual(items.map(x=>x.url), ['https://publisher.test/article','https://example.com/obsidian/notes/test/']);
});
test('articles require publication date and URL without falling back to creation date', () => {
 assert.equal(feedItems([post({ published: '' }), post({ publishedUrl: '' }), post({ publishedUrl: 'javascript:alert(1)' })], options).length, 0);
});
test('ignores modification dates and excludes invalid or future dates, deduplicates and limits', () => {
 const items = [note({ updated: '2026-09-06' }), post(), post(), note({ date: '2026-02-30' }), note({ date: '2027-01-01' }), note({ date: '' })];
 assert.equal(feedItems(items, options).length, 2);
 assert.equal(feedItems(items, {...options, limit: 1})[0].kind, 'blog');
});
test('XML escapes untrusted titles and summaries; full text is not published', () => {
 const output = renderFeed([note({ title: 'A & <B>', summary: '<script> & "quote"\u0001', bodyText: 'FULL BODY' })], options);
 assert.ok(output.includes('A &amp; &lt;B&gt;'));
 assert.ok(output.includes('&lt;script&gt; &amp; &quot;quote&quot;'));
 assert.ok(!output.includes('FULL BODY') && !output.includes('\u0001'));
 assert.ok(output.includes('https://example.com/obsidian/rss.xml'));
 assert.ok(output.includes('Mon, 31 Aug 2026 15:00:00 GMT'));
});
test('default feed identity matches the site title and About description', () => {
 const xml = renderFeed([note()], options);
 assert.ok(xml.includes('<title>TaeZ’s Thinking Garden</title>'));
 assert.ok(xml.includes('<description>AI 시대에 개발자로 일하며 배운 개념과 기술, 그 과정에서 든 생각을 적어 두는 개인 위키입니다. 쓴 글과 읽은 책도 함께 둡니다.</description>'));
});
test('only notes present in public garden selection are enriched', () => {
 const garden = { notes: [note({path:'a'})], blog: { series: [{posts:[{path:'a',published:'2026-09-02'}]}], publications:[{posts:[{path:'private',published:'2026-09-03'}]}] } };
 assert.equal(feedEntries(garden).length, 1);
 assert.equal(feedEntries(garden)[0].published, '2026-09-02');
});

test('XML invalid characters do not corrupt a feed and valid emoji survive', () => {
 const xml = renderFeed([note({ title: '메모\uFFFF\uFFFE\uD800📝', summary: '앞\uDC00뒤\n다음' })], options);
 assert.ok(xml.includes('<title>메모📝</title>'));
 assert.ok(xml.includes('<description>앞뒤\n다음</description>'));
});

test('category filtering happens before the limit so a busy notebook cannot displace articles', () => {
 const busyNotes = Array.from({ length: 35 }, (_, index) => note({ date: '2026-09-03', url: `/obsidian/notes/n-${index}/` }));
 const input = [...busyNotes, post(), post({ published: '2026-09-01', publishedUrl: 'https://publisher.test/older' })];
 assert.equal(feedItems(input, options).filter(item => item.kind === 'blog').length, 0);
 assert.equal(feedItems(input, { ...options, kinds: ['blog'], limit: 2 }).length, 2);
 assert.equal(feedItems(input, { ...options, kinds: ['slipbox'], limit: 1 }).length, 1);
});

test('filtered feeds declare their own identity and escape feed metadata', () => {
 const xml = renderFeed([note(), post()], { ...options, kinds: ['blog'], feedPath: 'feeds/posts.xml', title: '글 & 기록' });
 assert.ok(xml.includes('https://example.com/obsidian/feeds/posts.xml'));
 assert.ok(xml.includes('<title>글 &amp; 기록</title>'));
 assert.ok(xml.includes('<category>글</category>'));
 assert.ok(!xml.includes('<category>노트</category>'));
});
