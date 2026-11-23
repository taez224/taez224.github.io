import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSlide, positionLabel, slideFromHash, slideHash, tapDirection } from '../src/lib/comic-reader.ts';

test('the position label counts pictures from one and names the closing slide', () => {
  assert.equal(positionLabel(2, 8), '3 / 8');
  assert.equal(positionLabel(0, 8), '1 / 8');
  assert.equal(positionLabel(9, 10), '10 / 10', '마지막 그림 장은 아직 끝 장이 아니다');
  assert.equal(positionLabel(8, 8), '끝');
});

test('each slide has its own address, and the closing slide is #end', () => {
  assert.equal(slideHash(0, 8), '#page-1');
  assert.equal(slideHash(7, 8), '#page-8');
  assert.equal(slideHash(8, 8), '#end');
});

test('an address opens the slide it names', () => {
  assert.equal(slideFromHash('#page-4', 10), 3);
  assert.equal(slideFromHash('#page-10', 10), 9);
  assert.equal(slideFromHash('#end', 8), 8);
});

test('an address and its slide round-trip for every slide', () => {
  for (let index = 0; index <= 8; index += 1) {
    assert.equal(slideFromHash(slideHash(index, 8), 8), index);
  }
});

test('an unknown or out-of-range address opens the first picture', () => {
  for (const hash of ['#page-0', '#page-99', '#pages-2', '', '#', '#page-', '#page-1.5', '#page-02x', 'page-2']) {
    assert.equal(slideFromHash(hash, 10), 0, hash);
  }
});

test('moving past either end stays on the first picture or the closing slide', () => {
  assert.equal(clampSlide(-1, 8), 0);
  assert.equal(clampSlide(9, 8), 8);
  assert.equal(clampSlide(4, 8), 4);
  assert.equal(clampSlide(Number.NaN, 8), 0);
});

test('a tap in the left third goes back, the right third goes forward, and the middle does neither', () => {
  assert.equal(tapDirection(100, 375), -1);
  assert.equal(tapDirection(187, 375), 0);
  assert.equal(tapDirection(300, 375), 1);
});

test('a tap exactly on a third line counts as the middle', () => {
  assert.equal(tapDirection(125, 375), 0);
  assert.equal(tapDirection(250, 375), 0);
});
