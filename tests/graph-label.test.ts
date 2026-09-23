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

import { placeLabels, labelGeometry, mustPlaceLabel, ringedRadius, RING_GAP } from '../src/graph/label.ts';

// 제목을 점 반지름으로 놓았더니 허브 고리와 입구 노드 후광, 선택 링이 제목 윗부분에 걸렸다. 제목은 가장 바깥 고리 밖에 놓는다.
test('ringedRadius measures a node out to its outermost ring', () => {
  assert.equal(ringedRadius({ type: 'permanent', isEntry: false }, 5), 5, '고리 없는 노드는 점 반지름');
  assert.equal(ringedRadius({ type: 'hub', isEntry: false }, 5), 5 + RING_GAP.hub, '허브 고리');
  assert.equal(ringedRadius({ type: 'hub', isEntry: true }, 5), 5 + RING_GAP.entry, '입구 노드는 고리보다 큰 후광');
  assert.equal(ringedRadius({ type: 'permanent', isEntry: false }, 5, { ringed: true }), 5 + RING_GAP.select, '선택·포커스 링');
});

// 지도에서 허브까지 억지로 놓았더니 좁은 무대에서 허브 제목끼리, 또는 영역 이름과 겹쳤다. 홈 히어로는 정적 스냅샷과 규칙이 같아야 한다.
test('only the focused node forces its label on the map, while the home hero keeps every base label', () => {
  assert.equal(mustPlaceLabel('hub', { mode: 'map', focus: null }), false, '지도의 허브 제목은 자리가 날 때만 놓는다');
  assert.equal(mustPlaceLabel('hub', { mode: 'map', focus: 'other' }), false);
  assert.equal(mustPlaceLabel('picked', { mode: 'map', focus: 'picked' }), true, '고르거나 미리 보는 노드는 자리가 없어도 놓는다');
  assert.equal(mustPlaceLabel('hub', { mode: 'hero', focus: null }), true, '홈 히어로는 스냅샷처럼 기본 집합을 모두 놓는다');
});

// 지도의 허브 제목은 빈자리가 없으면 노드 원 위에는 얹되 다른 제목 위에는 얹지 않는다. 억지로 아래에 두었더니 글자끼리 겹쳤고,
// 노드 원까지 피하게 했더니 휴대폰 폭에서 허브 제목이 거의 모두 사라졌다.
test('placeLabels lets a label sit over node dots but never over another label', () => {
  const nodes = [{ id: 'a', title: '가' }, { id: 'b', title: '나' }];
  const positions = new Map([['a', { x: 100, y: 100 }], ['b', { x: 100, y: 130 }]]);
  const radius = () => 6;
  const dots = [{ left: 0, right: 300, top: 0, bottom: 300 }];
  const overDots = placeLabels([{ node: nodes[0], mustPlace: false, overNodes: true }], { positions, radius, nodeObstacles: dots });
  assert.equal(overDots.size, 1, '노드 원만 막혔으면 그 위에 놓는다');
  assert.equal(placeLabels([{ node: nodes[0], mustPlace: false }], { positions, radius, nodeObstacles: dots }).size, 0, 'overNodes가 없으면 놓지 않는다');
  const text = [{ left: 0, right: 300, top: 0, bottom: 300 }];
  assert.equal(placeLabels([{ node: nodes[1], mustPlace: false, overNodes: true }], { positions, radius, obstacles: text }).size, 0, '글자 자리는 노드 원이 아니므로 피한다');
  const both = placeLabels(nodes.map((node) => ({ node, mustPlace: false, overNodes: true })), { positions, radius, nodeObstacles: dots });
  const boxes = [...both.values()].map(({ g }) => g.box);
  const overlap = boxes.length === 2 && boxes[0].left < boxes[1].right && boxes[1].left < boxes[0].right && boxes[0].top < boxes[1].bottom && boxes[1].top < boxes[0].bottom;
  assert.equal(overlap, false, '노드 원 위에 얹은 제목끼리도 겹치지 않는다');
});

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

// 억지로 두는 아래 자리가 확대 조작과 겹치면 고른 제목이 조작 아래에 깔려 일부만 보였다.
test('placeLabels never forces a label under blocked controls: it takes another visible slot or drops the label', () => {
  const a = { id: 'a', title: '에이' };
  const positions = new Map([['a', at(100, 100)]]);
  const everywhere = [{ left: -1e4, right: 1e4, top: -1e4, bottom: 1e4 }];
  const below = labelGeometry(at(100, 100), 6, ['에이'], 'below', 1).box;
  assert.equal(planFor(placeLabels([{ node: a, mustPlace: true }], { positions, radius, obstacles: everywhere, blocked: [below] }), 'a').placement, 'above', '다른 글자 위라도 조작 밖으로 옮긴다');
  const offAbove = (box: { top: number }) => box.top >= 90;
  assert.equal(planFor(placeLabels([{ node: a, mustPlace: true }], { positions, radius, obstacles: everywhere, blocked: [below], inside: offAbove }), 'a').placement, 'right', '보이지 않는 자리는 건너뛴다');
  assert.equal(placeLabels([{ node: a, mustPlace: true }], { positions, radius, blocked: everywhere }).size, 0, '둘 자리가 없으면 두지 않는다');
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
