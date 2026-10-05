import type { Point } from './types.ts';

export type Direction = 'up' | 'down' | 'left' | 'right';

type Candidate = { id: string } & Point;

// 지도에서 화살표 키가 가리키는 다음 노드를 고른다. 좌표는 화면 방향과 같아서 y가 아래로 늘어난다.
// 흐려진 노드를 빼는 일은 이 함수가 하지 않는다. 호출하는 쪽이 후보 목록에서 미리 빼야 한다.
// 진행 방향 거리(primary)가 양수인 후보만 보므로 from과 같은 좌표의 후보(자기 자신)는 저절로 빠진다.
export function nextInDirection(from: Point, direction: Direction, candidates: ReadonlyArray<Candidate>): string | null {
  // 기준 노드에서 후보까지의 진행 방향 거리와 옆 방향 거리를 구한다.
  const measure = (c: Candidate) => {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    switch (direction) {
      case 'right': return { primary: dx, secondary: dy };
      case 'left': return { primary: -dx, secondary: dy };
      case 'down': return { primary: dy, secondary: dx };
      case 'up': return { primary: -dy, secondary: dx };
    }
  };

  // 옆으로 벗어난 만큼 두 배로 벌점을 줘서, 눈으로 같은 줄에 있는 노드가 먼저 뽑히게 한다.
  const best = (inCone: boolean) => {
    let winner: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const { primary, secondary } = measure(c);
      if (primary <= 0) continue;
      if (inCone && Math.abs(secondary) > primary) continue;
      const score = primary + 2 * Math.abs(secondary);
      // 점수가 같으면 id가 앞선 쪽을 골라 입력 순서에 따라 결과가 흔들리지 않게 한다.
      if (!winner || score < winner.score || (score === winner.score && c.id < winner.id)) winner = { id: c.id, score };
    }
    return winner?.id ?? null;
  };

  // ±45° 안쪽을 먼저 보고, 없을 때만 그 방향 반평면 전체로 넓힌다.
  return best(true) ?? best(false);
}
