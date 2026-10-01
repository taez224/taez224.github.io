// 본문을 얼마나 읽었는지 0~1로 돌려준다. 값은 모두 화면 위 끝에서 잰 세로 위치다.
// 본문만 기준으로 한다. 제목과 요약을 읽는 동안은 0이고, 참조 목록과 바닥글은 세지 않는다.
// 끝은 본문이 화면을 다 지나간 때가 아니라 마지막 문단이 화면에 들어온 때다. 독자가 다 읽었다고 느끼는 자리가 그곳이고,
// 본문 아래의 연결 목록까지 지나야 100%가 되면 글을 다 읽고도 막대가 덜 찬 채로 남는다.
interface Positions { bodyTop: number; lastBlockTop: number; viewportHeight: number; headerBottom: number }

export function readingProgress({ bodyTop, lastBlockTop, viewportHeight, headerBottom }: Positions): number {
  // 본문이 헤더 아래에서 시작해 마지막 문단이 화면 아래 끝에 닿을 때까지 스크롤하는 거리.
  const distance = lastBlockTop - bodyTop - (viewportHeight - headerBottom);
  if (lastBlockTop <= viewportHeight) return 1;
  if (distance <= 0) return 0;
  return Math.min(1, Math.max(0, (headerBottom - bodyTop) / distance));
}
