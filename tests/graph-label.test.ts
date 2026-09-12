import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextWidth, graphTitleLines, wrapLabel } from '../src/graph/label.ts';

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
const at = (x: number, y: number) => ({ x, y });
// 배치 결과에서 한 노드의 계획을 꺼낸다. 자리를 잡지 못했다면 그 자체가 실패다.
const planFor = <T>(plan: ReadonlyMap<string, T>, id: string): T => {
  const entry = plan.get(id);
  assert.ok(entry, `${id}의 제목 자리가 잡힌다`);
  return entry;
};

test('placeLabels puts a free label below its node and moves it above when that slot is blocked', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 100)]]);
  const free = placeLabels([{ node: a, mustPlace: true }], { positions, radius });
  assert.equal(planFor(free, 'a').placement, 'below');
  assert.deepEqual(planFor(free, 'a').lines, ['에이']);
  const below = labelGeometry(at(100, 100), 6, ['에이'], 'below', 1).box;
  assert.equal(planFor(placeLabels([{ node: a, mustPlace: true }], { positions, radius, obstacles: [below] }), 'a').placement, 'above');
});

test('placeLabels keeps later labels off earlier ones: below blocked by an obstacle and above blocked by a label sends it right', () => {
  const a = { id: 'a', title: '에이' }, b = { id: 'b', title: '비' };
  const positions = new Map([['a', at(100, 100)], ['b', at(100, 130)]]);
  const belowB = labelGeometry(at(100, 130), 6, ['비'], 'below', 1).box;
  const plan = placeLabels([{ node: a, mustPlace: true }, { node: b, mustPlace: true }], { positions, radius, obstacles: [belowB] });
  assert.equal(planFor(plan, 'a').placement, 'below');
  assert.equal(planFor(plan, 'b').placement, 'right');
});

test('placeLabels skips optional labels with no room, forces required ones below, and places a node once', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 100)]]);
  const everywhere = [{ left: -1e4, right: 1e4, top: -1e4, bottom: 1e4 }];
  assert.equal(placeLabels([{ node: a, mustPlace: false }], { positions, radius, obstacles: everywhere }).size, 0);
  const forced = placeLabels([{ node: a, mustPlace: true }, { node: a, mustPlace: false }], { positions, radius, obstacles: everywhere });
  assert.equal(forced.size, 1);
  assert.equal(planFor(forced, 'a').placement, 'below');
});

test('placeLabels avoids slots outside the visible area', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 630)]]);
  const inside = (box: { top: number; bottom: number }) => box.top >= 0 && box.bottom <= 640;
  assert.equal(planFor(placeLabels([{ node: a, mustPlace: true }], { positions, radius, inside }), 'a').placement, 'above');
});

test('label spacing separates nearby titles at each zoom while keeping their full text', () => {
  for (const u of [0.5, 1, 2]) {
    const a = { id: 'a', title: '에이' }, b = { id: 'b', title: '비' };
    const positions = new Map([['a', at(100 * u, 100 * u)], ['b', at(122 * u, 100 * u)]]);
    const order = [a, b].map((node) => ({ node, mustPlace: false }));
    const options = { positions, radius: () => 6 * u, u };
    const tight = placeLabels(order, options);
    assert.equal(planFor(tight, 'b').placement, 'below');
    const spaced = placeLabels(order, { ...options, labelGap: 8 });
    assert.equal(spaced.size, 2);
    assert.deepEqual(planFor(spaced, 'b').lines, ['비']);
    const x = planFor(spaced, 'a').g.box, y = planFor(spaced, 'b').g.box;
    assert.ok(x.right + 8 * u <= y.left || y.right + 8 * u <= x.left || x.bottom + 8 * u <= y.top || y.bottom + 8 * u <= x.top);
  }
});

test('wrapLabel keeps short titles on one line and folds long ones into two balanced lines', () => {
  assert.deepEqual(wrapLabel('AI 활용'), ['AI 활용']);
  assert.deepEqual(wrapLabel('스무 글자 안쪽이면 한 줄로 둔다'), ['스무 글자 안쪽이면 한 줄로 둔다']);
  const lines = wrapLabel('산출물이 팀의 자산이 되려면 판단·추적·복구가 가능해야 한다');
  assert.equal(lines.length, 2);
  assert.ok(Math.abs([...lines[0]].length - [...lines[1]].length) <= 8, lines.join('|'));
  assert.equal(lines.join(' '), '산출물이 팀의 자산이 되려면 판단·추적·복구가 가능해야 한다');
});
