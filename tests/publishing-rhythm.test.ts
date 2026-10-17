import test from 'node:test';
import assert from 'node:assert/strict';
import { publishingRhythm, RHYTHM_WIDTH, RHYTHM_HEIGHT } from '../src/lib/publishing-rhythm.ts';

const post = (path: string, published: string) => ({ path, published });

test('publishing rhythm preserves all calendar months from first publication through the current month', () => {
  const { months, total } = publishingRhythm([post('first', '2024-02-01'), post('last', '2026-01-02')], '2026-01-16');
  assert.equal(months.length, 24);
  assert.equal(months[0].month, '2024-02');
  assert.equal(months.at(-1)!.month, '2026-01');
  assert.deepEqual(months.map(month => month.count), [1, ...Array(22).fill(0), 1]);
  assert.equal(total, 2);
});

test('only publication dates no later than today contribute', () => {
  const { total, months } = publishingRhythm([
    post('old', '2025-01-31'), post('undated', ''), post('future', '2026-01-17'),
    post('same-month-future-year', '2027-01-02'), post('today', '2026-01-16')
  ], '2026-01-16');
  assert.equal(total, 2);
  assert.equal(months.at(-1)!.count, 1);
});

test('multiple posts in a month are counted once per path even when grouped twice', () => {
  const { months, total } = publishingRhythm([
    post('standalone', '2026-01-01'), post('episode-1', '2026-01-02'),
    post('episode-2', '2026-01-03'), post('standalone', '2026-01-01')
  ], '2026-01-16');
  assert.equal(total, 3);
  assert.equal(months.at(-1)!.count, 3);
});

test('zero and nonzero rhythms stay inside the plot and keep equal month spacing', () => {
  for (const posts of [[post('a', '2024-01-01')], [post('a', '2025-01-01'), post('b', '2026-01-02')]]) {
    const { months } = publishingRhythm(posts, '2026-01-16');
    const step = months[1].x - months[0].x;
    months.forEach((month, index) => {
      assert.ok(Number.isFinite(month.x) && Number.isFinite(month.y));
      assert.ok(month.x > 0 && month.x < RHYTHM_WIDTH);
      assert.ok(month.y > 0 && month.y < RHYTHM_HEIGHT);
      if (index) assert.ok(Math.abs(month.x - months[index - 1].x - step) < 0.00001);
    });
  }
});

test('the empty period has no activity to display', () => {
  const { total, months } = publishingRhythm([], '2026-10-16');
  assert.equal(total, 0);
  assert.deepEqual(months, []);
});

test('a first publication in the current month has a finite centered point', () => {
  const { months, total } = publishingRhythm([post('first', '2026-10-01')], '2026-10-16');
  assert.equal(total, 1);
  assert.equal(months.length, 1);
  assert.equal(months[0].x, RHYTHM_WIDTH / 2);
  assert.ok(Number.isFinite(months[0].y));
});
