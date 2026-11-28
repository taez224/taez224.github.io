// 만화 리더가 지금 몇 번째 장에 있는지 계산하는 순수 함수다.
// 장 번호(index)는 0부터 센다. 그림 장은 0..pageCount-1이고, 그림 뒤에 붙는 끝 장의 index가 pageCount다.
// DOM을 쓰지 않아야 브라우저 없이 단위 테스트로 경계값을 확인할 수 있다.

const PAGE_HASH = /^#page-([1-9]\d*)$/;
const END_HASH = '#end';

// 넘기기·주소·키보드가 모두 이 함수를 거쳐야 첫 장 앞이나 끝 장 뒤로 나가지 않는다.
// NaN은 비교가 모두 거짓이라 그대로 두면 빠져나가므로 첫 장으로 돌린다.
export function clampSlide(index: number, pageCount: number): number {
  if (Number.isNaN(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(pageCount, 0));
}

// 독자에게는 1부터 센 그림 번호를 보인다. 끝 장은 그림이 아니므로 번호 대신 '끝'으로 적는다.
export function positionLabel(index: number, pageCount: number): string {
  const slide = clampSlide(index, pageCount);
  return slide === pageCount ? '끝' : `${slide + 1} / ${pageCount}`;
}

// 주소의 번호도 독자가 보는 번호와 같게 1부터 센다. 그래야 주소를 공유한 사람과 받은 사람이 같은 번호를 말한다.
export function slideHash(index: number, pageCount: number): string {
  const slide = clampSlide(index, pageCount);
  return slide === pageCount ? END_HASH : `#page-${slide + 1}`;
}

// 리더가 쓰는 조각(#page-n, #end)인지 가린다. 「본문으로 건너뛰기」의 #app처럼 다른 조각까지 장 이동으로 읽으면 읽던 장이 표지로 돌아간다.
export function isSlideHash(hash: string): boolean {
  return hash === END_HASH || PAGE_HASH.test(hash);
}

// 형식이 틀리거나 없는 장을 가리키는 주소는 첫 그림으로 연다. 가장 가까운 장으로 맞추면 잘못 적은 주소가 결말을 먼저 보여 줄 수 있다.
export function slideFromHash(hash: string, pageCount: number): number {
  if (hash === END_HASH) return Math.max(pageCount, 0);
  const match = PAGE_HASH.exec(hash);
  if (!match) return 0;
  const page = Number(match[1]);
  return page <= pageCount ? page - 1 : 0;
}

// 화면을 가로로 셋으로 나눠 왼쪽은 이전, 오른쪽은 다음으로 넘긴다. 가운데를 누르면 넘기지 않는다.
// 정확히 3분의 1 선 위는 가운데로 본다. 나눗셈 대신 3을 곱해 비교해야 폭을 3으로 나눈 값의 소수 오차 때문에 선 위의 점이 옆 구역으로 넘어가지 않는다.
export function tapDirection(x: number, width: number): -1 | 0 | 1 {
  if (x * 3 < width) return -1;
  if (x * 3 > width * 2) return 1;
  return 0;
}
