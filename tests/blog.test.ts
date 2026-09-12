import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleBlog, blogLedger, lastPublishedOf, latestSeries, type BlogPost, type BlogSeries } from '../src/lib/blog.ts';

// 장부 한 줄의 타입은 blogLedger의 반환값에서 그대로 가져온다.
type LedgerRow = ReturnType<typeof blogLedger>[number]['rows'][number];
// 장부와 목록이 읽지 않는 필드는 빈 값으로 채운다. 채운 값이 결과를 바꾸지 않는지는 아래 단언이 지킨다.
const blogPost = (title: string, published: string, date = published): BlogPost => ({
  title, published, date, path: `${title}.md`, url: `/posts/${title}/`,
  publication: '', publishedUrl: '', summary: '', status: '', series: '', seriesOrder: 0, contentMode: 'full'
});
const blogSeries = (title: string, lastPublished: string, posts: BlogPost[]): BlogSeries => ({
  title, noteUrl: `/posts/${title}/`, summary: '', status: '', ended: '', lastPublished, posts
});

// 조립 단계처럼 연재의 lastPublished를 편에서 계산해 둔다.
const series = (title: string, ...published: string[]) => {
  const posts = published.map((date, index) => ({ title: `${title} ${index + 1}`, published: date }));
  return { title, posts, lastPublished: lastPublishedOf(posts) };
};

test('latestSeries picks the series whose last published post is the most recent', () => {
  const chosen = latestSeries([
    series('완결한 연재', '2025-01-01', '2025-07-15'),
    series('이어지는 연재', '2025-06-01', '2026-01-22'),
    series('오래된 연재', '2023-04-08')
  ]);
  assert.ok(chosen, '연재를 하나 고른다');
  assert.equal(chosen.title, '이어지는 연재');
});

test('latestSeries reads the last published post, not the order the posts arrive in', () => {
  const chosen = latestSeries([series('뒤섞인 연재', '2026-02-01', '2024-01-01'), series('최근 연재', '2026-03-01')]);
  assert.ok(chosen, '연재를 하나 고른다');
  assert.equal(chosen.title, '최근 연재');
});

test('latestSeries uses the lastPublished that assembly computed instead of recomputing it', () => {
  const chosen = latestSeries([{ title: '필드가 앞선 연재', lastPublished: '2026-05-01', posts: [] }, series('편이 있는 연재', '2026-01-01')]);
  assert.ok(chosen, '연재를 하나 고른다');
  assert.equal(chosen.title, '필드가 앞선 연재');
});

test('latestSeries skips a series whose posts are not published yet', () => {
  const chosen = latestSeries([series('발행 전 연재', '', ''), series('발행한 연재', '2024-05-05')]);
  assert.ok(chosen, '연재를 하나 고른다');
  assert.equal(chosen.title, '발행한 연재');
});

test('latestSeries returns null when no series has a published post', () => {
  assert.equal(latestSeries([series('발행 전 연재', '')]), null);
  assert.equal(latestSeries([]), null);
  assert.equal(latestSeries(), null);
});

test('lastPublishedOf returns the latest publication date among the posts, whatever their order', () => {
  assert.equal(lastPublishedOf([{ published: '2026-02-01' }, { published: '2024-01-01' }, { published: '' }]), '2026-02-01');
  assert.equal(lastPublishedOf([{ published: '' }]), '', '발행일은 선택 값이라 하나도 없을 수 있다');
  assert.equal(lastPublishedOf(), '');
});

// date는 조립 단계가 검증한 표시 날짜다. published가 있으면 그 값, 없으면 created다.
const post = blogPost;
const ledgerInput = {
  publications: [{ publication: 'Velog', posts: [post('단독 새 글', '2026-03-01'), post('발행일 없는 글', '', '2026-04-01'), post('단독 옛 글', '2025-05-01')] }],
  series: [
    blogSeries('연재', '2026-01-10', [post('1편', '2025-12-01'), post('2편', '2026-01-10')]),
    // started는 손으로 쓰는 필드다. 장부가 읽지 않는다는 것을 보이려고 일부러 얹는다.
    { ...blogSeries('날짜 없는 연재', '', [post('1편', '', '2024-02-02'), post('2편', '', '2024-01-01')]), started: '2020-01-01' }
  ]
};
const rowTitle = (row: LedgerRow) => (row.kind === 'post' ? row.post.title : row.series.title);

test('blogLedger puts standalone posts and one row per series into years, newest first', () => {
  const ledger = blogLedger(ledgerInput);
  assert.deepEqual(ledger.map((year) => [year.year, year.rows.map(rowTitle)]), [
    ['2026', ['단독 새 글', '연재']],
    ['2025', ['단독 옛 글']],
    ['2024', ['날짜 없는 연재']]
  ]);
  assert.equal(ledger.flatMap((year) => year.rows).some((row) => rowTitle(row) === '발행일 없는 글'), false, '발행일이 없는 단독 글은 날짜별 행에 넣지 않는다');
});

test('a series without any publication date is dated by its latest episode date, never by the hand-written started field', () => {
  const row = blogLedger(ledgerInput).flatMap((year) => year.rows).find((item) => rowTitle(item) === '날짜 없는 연재');
  assert.ok(row, '날짜 없는 연재도 장부에 한 줄로 들어간다');
  assert.equal(row.date, '2024-02-02', '허브의 started는 검증되지 않은 작성 필드라 쓰지 않는다');
});

test('blogLedger orders rows from the same day by title, whether they are posts or series', () => {
  const ledger = blogLedger({
    publications: [{ publication: 'Velog', posts: [post('나중 제목', '2026-05-05')] }],
    series: [blogSeries('가나다 연재', '2026-05-05', [post('1편', '2026-05-05')])]
  });
  assert.deepEqual(ledger[0].rows.map(rowTitle), ['가나다 연재', '나중 제목']);
});

test('assembleBlog puts series episodes in episode order and groups the other posts by publication', () => {
  const record = (title: string, extra: Partial<BlogPost & { ended: string }> = {}) => ({
    ...blogPost(title, ''), status: '', ended: '', ...extra
  });
  const hubs = [record('연재', { url: '/posts/series/', summary: '연재 소개', ended: '2026-02-01' })];
  const posts = [
    record('2편', { series: '연재', seriesOrder: 2, published: '2026-02-01' }),
    record('1편', { series: '연재', seriesOrder: 1, published: '2026-01-01' }),
    record('허브 없는 연재 1편', { series: '허브 없는 연재', seriesOrder: 1, published: '2025-06-01' }),
    record('단독 옛 글', { published: '2025-01-01', publication: 'Velog' }),
    record('단독 새 글', { published: '2026-03-01', publication: 'Velog' }),
    record('발행처 없는 글', { published: '2024-01-01' })
  ];
  const blog = assembleBlog({ hubs, posts });
  assert.deepEqual(blog.series.map((item) => [item.title, item.noteUrl, item.ended, item.lastPublished, item.posts.map((post) => post.title)]), [
    ['연재', '/posts/series/', '2026-02-01', '2026-02-01', ['1편', '2편']],
    ['허브 없는 연재', '', '', '2025-06-01', ['허브 없는 연재 1편']]
  ], '연재는 최근 발행일 순이고, 허브가 없는 연재도 편만으로 만든다');
  assert.deepEqual(blog.publications.map((group) => [group.publication, group.posts.map((post) => post.title)]), [
    ['발행처 미상', ['발행처 없는 글']],
    ['Velog', ['단독 새 글', '단독 옛 글']]
  ], '발행처는 이름순이고 발행처 안은 최신순이다');
  assert.deepEqual(blog.stats, { posts: 6, series: 2, standalone: 3 });
});
