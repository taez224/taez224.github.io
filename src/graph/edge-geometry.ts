import type { Point } from './types.ts';

// 상호 참조의 두 선을 법선 방향으로 벌린다. 작은 그래프도 지도 엔진 없이 같은 간격을 계산한다.
export function offsetLine(a: Point, b: Point, sign: number, distance = 2.5) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * distance * sign, ny = (dx / d) * distance * sign;
  return { x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny };
}
