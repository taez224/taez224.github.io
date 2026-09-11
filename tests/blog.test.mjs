import test from 'node:test';
import assert from 'node:assert/strict';
import { blogLedger, lastPublishedOf, latestSeries } from '../src/lib/blog.mjs';

// 조립 단계처럼 연재의 lastPublished를 편에서 계산해 둔다.
const series = (title, ...published) => {
  const posts = published.map((date, index) => ({ title: `${title} ${index + 1}`, published: date }));
  return { title, posts, lastPublished: lastPublishedOf(posts) };
};

test('latestSeries picks the series whose last published post is the most recent', () => {
  const chosen = latestSeries([
    series('완결한 연재', '2025-01-01', '2025-07-15'),
    series('이어지는 연재', '2025-06-01', '2026-01-22'),
    series('오래된 연재', '2023-04-08')
  ]);
  assert.equal(chosen.title, '이어지는 연재');
});

test('latestSeries reads the last published post, not the order the posts arrive in', () => {
  const chosen = latestSeries([series('뒤섞인 연재', '2026-02-01', '2024-01-01'), series('최근 연재', '2026-03-01')]);
  assert.equal(chosen.title, '최근 연재');
});

test('latestSeries uses the lastPublished that assembly computed instead of recomputing it', () => {
  const chosen = latestSeries([{ title: '필드가 앞선 연재', lastPublished: '2026-05-01', posts: [] }, series('편이 있는 연재', '2026-01-01')]);
  assert.equal(chosen.title, '필드가 앞선 연재');
});

test('latestSeries skips a series whose posts are not published yet', () => {
  const chosen = latestSeries([series('발행 전 연재', '', ''), series('발행한 연재', '2024-05-05')]);
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
const post = (title, published, date = published) => ({ title, published, date });
const ledgerInput = {
  publications: [{ publication: 'Velog', posts: [post('단독 새 글', '2026-03-01'), post('발행일 없는 글', '', '2026-04-01'), post('단독 옛 글', '2025-05-01')] }],
  series: [
    { title: '연재', lastPublished: '2026-01-10', posts: [post('1편', '2025-12-01'), post('2편', '2026-01-10')] },
    { title: '날짜 없는 연재', lastPublished: '', started: '2020-01-01', posts: [post('1편', '', '2024-02-02'), post('2편', '', '2024-01-01')] }
  ]
};
const rowTitle = (row) => (row.kind === 'post' ? row.post.title : row.series.title);

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
  assert.equal(row.date, '2024-02-02', '허브의 started는 검증되지 않은 작성 필드라 쓰지 않는다');
});

test('blogLedger orders rows from the same day by title, whether they are posts or series', () => {
  const ledger = blogLedger({
    publications: [{ publication: 'Velog', posts: [post('나중 제목', '2026-05-05')] }],
    series: [{ title: '가나다 연재', lastPublished: '2026-05-05', posts: [post('1편', '2026-05-05')] }]
  });
  assert.deepEqual(ledger[0].rows.map(rowTitle), ['가나다 연재', '나중 제목']);
});
