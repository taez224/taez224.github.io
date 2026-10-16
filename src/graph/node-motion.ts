import type { Point, GraphEdge } from './types.ts';
export const NODE_SETTLE_LIMIT = 1000;

// 전체 배치를 다시 섞지 않고, 손으로 움직인 노드의 변위만 연결을 따라 전달한다.
// 약한 원위치 장력과 감쇠가 있고, 놓은 뒤의 움직임은 최대 1초로 제한한다.
export function createNodeMotion(initial: ReadonlyMap<string, Point>, edges: readonly GraphEdge[], radii: ReadonlyMap<string, number> = new Map()) {
  const positions = new Map([...initial].map(([id, point]) => [id, { ...point }]));
  const anchors = new Map([...initial].map(([id, point]) => [id, { ...point, strength: .018 }]));
  const velocity = new Map([...initial.keys()].map(id => [id, { x: 0, y: 0 }]));
  const seen = new Set<string>();
  const links = edges.flatMap(edge => {
    const a = initial.get(edge.source), b = initial.get(edge.target);
    const key = JSON.stringify([edge.source, edge.target].sort());
    if (!a || !b || edge.source === edge.target || seen.has(key)) return [];
    seen.add(key);
    return [{ source: edge.source, target: edge.target, x: b.x - a.x, y: b.y - a.y }];
  });
  const degree = new Map<string, number>();
  for (const link of links) for (const id of [link.source, link.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  let held: string | null = null;
  let quiet = 0;
  let sleeping = false;
  let settlingMs: number | null = null;
  // 감쇠 상한에서 멈춰도 원이 포개진 채 남지 않도록 마지막에 위치만 분리한다.
  const separateOverlaps = () => {
    const entries = [...positions];
    for (let pass = 0; pass < 32; pass++) {
      let overlap = false;
      for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
        const [aid, a] = entries[i], [bid, b] = entries[j];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        const minimum = (radii.get(aid) ?? 6) + (radii.get(bid) ?? 6) + 4;
        if (distance >= minimum - .01) continue;
        overlap = true;
        const amount = (minimum - distance) / 2;
        // 완전히 겹친 점들을 한 줄로만 밀어 다시 포개지지 않게 방향을 나눈다.
        const angle = (i * entries.length + j) * 2.399963;
        const x = (distance > .001 ? dx / distance : Math.cos(angle)) * amount;
        const y = (distance > .001 ? dy / distance : Math.sin(angle)) * amount;
        a.x -= x; a.y -= y; b.x += x; b.y += y;
      }
      if (!overlap) break;
    }
  };

  return {
    positions,
    hold(id: string, point: Point) {
      const at = positions.get(id);
      if (!at || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      held = id;
      sleeping = false;
      settlingMs = null;
      at.x = point.x; at.y = point.y;
      velocity.set(id, { x: 0, y: 0 });
      quiet = 0;
    },
    release() {
      // 놓은 자리를 새 기준으로 삼아, 모든 노드가 처음 자리로 튕겨 돌아가는 느낌을 피한다.
      if (held) anchors.set(held, { ...positions.get(held)!, strength: .35 });
      held = null;
      quiet = 0;
      sleeping = false;
      settlingMs = 0;
    },
    stop() {
      held = null;
      sleeping = true;
      settlingMs = null;
      for (const v of velocity.values()) { v.x = 0; v.y = 0; }
      separateOverlaps();
    },
    reset() {
      held = null;
      quiet = 0;
      sleeping = true;
      settlingMs = null;
      for (const [id, original] of initial) {
        Object.assign(positions.get(id)!, original);
        anchors.set(id, { ...original, strength: .018 });
        velocity.set(id, { x: 0, y: 0 });
      }
    },
    step(milliseconds = 1000 / 60) {
      if (sleeping) return false;
      if (settlingMs !== null) {
        settlingMs += Math.max(0, milliseconds);
        if (settlingMs >= NODE_SETTLE_LIMIT) {
          sleeping = true;
          for (const v of velocity.values()) { v.x = 0; v.y = 0; }
          separateOverlaps();
          return false;
        }
      }
      const dt = Math.max(.1, Math.min(1.5, milliseconds / (1000 / 60)));
      const forces = new Map([...positions].map(([id, point]) => {
        const anchor = anchors.get(id)!;
        return [id, { x: (anchor.x - point.x) * anchor.strength, y: (anchor.y - point.y) * anchor.strength }];
      }));
      for (const link of links) {
        const a = positions.get(link.source)!, b = positions.get(link.target)!;
        const weight = .09 / Math.sqrt(Math.max(degree.get(link.source)!, degree.get(link.target)!));
        const x = (b.x - a.x - link.x) * weight, y = (b.y - a.y - link.y) * weight;
        const fa = forces.get(link.source)!, fb = forces.get(link.target)!;
        fa.x += x; fa.y += y; fb.x -= x; fb.y -= y;
      }
      const entries = [...positions];
      for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
        const [aid, a] = entries[i], [bid, b] = entries[j];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        const minimum = (radii.get(aid) ?? 6) + (radii.get(bid) ?? 6) + 8;
        if (distance >= minimum) continue;
        const strength = (minimum - distance) * .12;
        const x = (distance > .001 ? dx / distance : 1) * strength;
        const y = (distance > .001 ? dy / distance : 0) * strength;
        const fa = forces.get(aid)!, fb = forces.get(bid)!;
        fa.x -= x; fa.y -= y; fb.x += x; fb.y += y;
      }
      let speed = 0;
      for (const [id, point] of positions) {
        if (id === held) continue;
        const v = velocity.get(id)!, f = forces.get(id)!;
        v.x = (v.x + f.x * dt) * Math.pow(.72, dt);
        v.y = (v.y + f.y * dt) * Math.pow(.72, dt);
        point.x += v.x * dt; point.y += v.y * dt;
        speed = Math.max(speed, Math.hypot(v.x, v.y));
      }
      quiet = speed < .025 ? quiet + 1 : 0;
      sleeping = held === null && quiet >= 10;
      if (sleeping) separateOverlaps();
      return !sleeping;
    }
  };
}
