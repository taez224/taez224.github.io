import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextWidth, graphTitleLines } from '../src/graph/label.ts';

test('full titles wrap between words when possible', () => {
  assert.deepEqual(graphTitleLines('가능해야 한다', 10), ['가능해야 한다']);
  const title = '산출물이 팀의 자산이 되려면 판단 추적 복구가 가능해야 한다';
  const lines = graphTitleLines(title, 16);
  assert.equal(lines.join(' '), title);
  assert.ok(lines.every((line) => [...line].length <= 16));
});

test('estimateTextWidth weighs hangul, latin and punctuation differently and scales with font size', () => {
  assert.equal(estimateTextWidth('가a.'), 12.5 + 7.2 + 4.5);
  assert.equal(estimateTextWidth('가', 26), 25);
});

import { placeLabels, labelGeometry } from '../src/graph/label.ts';

const radius = () => 6;
const at = (x, y) => ({ x, y });

test('placeLabels puts a free label below its node and moves it above when that slot is blocked', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 100)]]);
  const free = placeLabels([{ node: a, mustPlace: true }], { positions, radius });
  assert.equal(free.get('a').placement, 'below');
  assert.deepEqual(free.get('a').lines, ['에이']);
  const below = labelGeometry(at(100, 100), 6, ['에이'], 'below', 1).box;
  assert.equal(placeLabels([{ node: a, mustPlace: true }], { positions, radius, obstacles: [below] }).get('a').placement, 'above');
});

test('placeLabels keeps later labels off earlier ones: below blocked by an obstacle and above blocked by a label sends it right', () => {
  const a = { id: 'a', title: '에이' }, b = { id: 'b', title: '비' };
  const positions = new Map([['a', at(100, 100)], ['b', at(100, 130)]]);
  const belowB = labelGeometry(at(100, 130), 6, ['비'], 'below', 1).box;
  const plan = placeLabels([{ node: a, mustPlace: true }, { node: b, mustPlace: true }], { positions, radius, obstacles: [belowB] });
  assert.equal(plan.get('a').placement, 'below');
  assert.equal(plan.get('b').placement, 'right');
});

test('placeLabels skips optional labels with no room, forces required ones below, and places a node once', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 100)]]);
  const everywhere = [{ left: -1e4, right: 1e4, top: -1e4, bottom: 1e4 }];
  assert.equal(placeLabels([{ node: a, mustPlace: false }], { positions, radius, obstacles: everywhere }).size, 0);
  const forced = placeLabels([{ node: a, mustPlace: true }, { node: a, mustPlace: false }], { positions, radius, obstacles: everywhere });
  assert.equal(forced.size, 1);
  assert.equal(forced.get('a').placement, 'below');
});

test('placeLabels avoids slots outside the visible area', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 630)]]);
  const inside = (box) => box.top >= 0 && box.bottom <= 640;
  assert.equal(placeLabels([{ node: a, mustPlace: true }], { positions, radius, inside }).get('a').placement, 'above');
});

test('label spacing separates nearby titles at each zoom while keeping their full text', () => {
  for (const u of [0.5, 1, 2]) {
    const a = { id: 'a', title: '에이' }, b = { id: 'b', title: '비' };
    const positions = new Map([['a', at(100 * u, 100 * u)], ['b', at(122 * u, 100 * u)]]);
    const order = [a, b].map((node) => ({ node, mustPlace: false }));
    const options = { positions, radius: () => 6 * u, u };
    const tight = placeLabels(order, options);
    assert.equal(tight.get('b').placement, 'below');
    const spaced = placeLabels(order, { ...options, labelGap: 8 });
    assert.equal(spaced.size, 2);
    assert.deepEqual(spaced.get('b').lines, ['비']);
    const x = spaced.get('a').g.box, y = spaced.get('b').g.box;
    assert.ok(x.right + 8 * u <= y.left || y.right + 8 * u <= x.left || x.bottom + 8 * u <= y.top || y.bottom + 8 * u <= x.top);
  }
});
