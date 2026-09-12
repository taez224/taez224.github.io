import test from 'node:test';
import assert from 'node:assert/strict';
import { feedItems, renderFeed } from '../src/lib/rss.ts';
import { SITE_DESCRIPTION } from '../src/lib/site-meta.ts';
const options = { site: 'https://example.com', basePath: '/obsidian' };
const note = extra => ({ title: '생각', kind: 'slipbox', type: 'permanent', date: '2026-09-01', url: '/obsidian/notes/test/', summary: '요약', ...extra });
const post = extra => note({ kind: 'blog', status: 'published', published: '2026-09-02', url: '/obsidian/posts/test/', publishedUrl: 'https://publisher.test/article', ...extra });
const external = extra => post({ contentMode: 'external', url: '/obsidian/posts/ext/', published: '2026-09-03', ...extra });
const dev = extra => note({ kind: 'development', category: 'Troubleshooting', date: '2026-09-04', url: '/obsidian/dev/test/', ...extra });
test('full articles, notes and development notes link to the garden, external articles link to the publisher; drafts and hubs are excluded', () => {
 const items = feedItems([note(), post(), external(), dev(), post({ status: 'draft' }), note({ type: 'hub' }), note({ type: 'series' }), note({ kind: 'book' })], options);
 assert.deepEqual(items.map(x=>x.url), ['https://example.com/obsidian/dev/test/', 'https://publisher.test/article', 'https://example.com/obsidian/posts/test/', 'https://example.com/obsidian/notes/test/']);
 assert.deepEqual(items.map(x=>x.label), ['개발 노트', '글', '글', '노트']);
});
test('a development-only feed carries only development notes', () => {
 const items = feedItems([note(), post(), dev()], { ...options, kinds: ['development'] });
 assert.deepEqual(items.map(x=>x.kind), ['development']);
});
test('articles require a publication date; only external articles also need a valid publisher URL', () => {
 assert.equal(feedItems([post({ published: '' }), external({ publishedUrl: '' }), external({ publishedUrl: 'javascript:alert(1)' })], options).length, 0);
 const gardenOnly = feedItems([post({ publishedUrl: '' }), post({ publishedUrl: 'javascript:alert(1)' })], options);
 assert.deepEqual(gardenOnly.map(x => x.url), ['https://example.com/obsidian/posts/test/'], '전문 공개 글은 원문 주소가 없거나 이상해도 가든 주소로 나간다');
});
// 잘못된 날짜와 미래 날짜는 조립 단계에서 빌드가 멈추므로 dates.test.mjs가 검증한다.
test('ignores modification dates, deduplicates and limits', () => {
 const items = [note({ updated: '2026-09-06' }), post(), post()];
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
 assert.ok(xml.includes(`<description>${SITE_DESCRIPTION}</description>`), '피드 설명은 사이트 설명을 그대로 쓴다');
});

test('XML invalid characters do not corrupt a feed and valid emoji survive', () => {
 const xml = renderFeed([note({ title: '메모\uFFFF\uFFFE\uD800📝', summary: '앞\uDC00뒤\n다음' })], options);
 assert.ok(xml.includes('<title>메모📝</title>'));
 assert.ok(xml.includes('<description>앞뒤\n다음</description>'));
});

test('category filtering happens before the limit so a busy notebook cannot displace articles', () => {
 const busyNotes = Array.from({ length: 35 }, (_, index) => note({ date: '2026-09-03', url: `/obsidian/notes/n-${index}/` }));
 const input = [...busyNotes, post(), post({ published: '2026-09-01', url: '/obsidian/posts/older/' })];
 assert.equal(feedItems(input, options).filter(item => item.kind === 'blog').length, 0);
 assert.equal(feedItems(input, { ...options, kinds: ['blog'], limit: 2 }).length, 2);
 assert.equal(feedItems(input, { ...options, kinds: ['slipbox'], limit: 1 }).length, 1);
});

test('the unified feed reserves slots per kind so a burst of recent notes cannot displace articles', () => {
 const many = (make, count, prefix) => Array.from({ length: count }, (_, i) => make({ date: `2026-08-${String(30 - (i % 28)).padStart(2, '0')}`, url: `/obsidian/${prefix}/${i}/` }));
 const input = [...many(note, 20, 'notes'), ...many(dev, 20, 'dev'), ...Array.from({ length: 6 }, (_, i) => post({ published: `2024-0${i + 1}-01`, url: `/obsidian/posts/${i}/` }))];
 const items = feedItems(input, { ...options, quota: { blog: 10, slipbox: 10, development: 10 } });
 const count = (kind) => items.filter((item) => item.kind === kind).length;
 assert.deepEqual([count('blog'), count('slipbox'), count('development')], [6, 10, 10], '글은 있는 만큼 전부, 노트와 개발 노트는 몫만큼');
 assert.deepEqual(items.map((item) => item.date), [...items.map((item) => item.date)].sort().reverse(), '합친 뒤에는 날짜순');
 assert.equal(feedItems(input, { ...options, kinds: ['slipbox'] }).length, 20, '종류별 피드는 몫과 무관하다');
});

test('filtered feeds declare their own identity and escape feed metadata', () => {
 const xml = renderFeed([note(), post()], { ...options, kinds: ['blog'], feedPath: 'feeds/posts.xml', title: '글 & 기록' });
 assert.ok(xml.includes('https://example.com/obsidian/feeds/posts.xml'));
 assert.ok(xml.includes('<title>글 &amp; 기록</title>'));
 assert.ok(xml.includes('<category>글</category>'));
 assert.ok(!xml.includes('<category>노트</category>'));
});
test('items from the same day are ordered by their guid, so editing a title does not reorder the feed', () => {
 const order = (titles) => feedItems([note({ title: titles[0], url: '/obsidian/notes/b/' }), note({ title: titles[1], url: '/obsidian/notes/a/' })], options).map(x => x.url);
 assert.deepEqual(order(['가을', '하늘']), ['https://example.com/obsidian/notes/a/', 'https://example.com/obsidian/notes/b/']);
 assert.deepEqual(order(['하늘', '가을']), order(['가을', '하늘']), '제목을 바꿔도 순서가 같다');
});
