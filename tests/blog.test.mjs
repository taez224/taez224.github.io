import test from 'node:test';
import assert from 'node:assert/strict';
import { latestSeries } from '../src/lib/blog.mjs';

const series = (title, ...published) => ({ title, posts: published.map((date, index) => ({ title: `${title} ${index + 1}`, published: date })) });

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

test('latestSeries skips a series whose posts are not published yet', () => {
  const chosen = latestSeries([series('발행 전 연재', '', ''), series('발행한 연재', '2024-05-05')]);
  assert.equal(chosen.title, '발행한 연재');
});

test('latestSeries returns null when no series has a published post', () => {
  assert.equal(latestSeries([series('발행 전 연재', '')]), null);
  assert.equal(latestSeries([]), null);
  assert.equal(latestSeries(), null);
});
