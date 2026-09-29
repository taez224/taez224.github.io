// 넓은 화면 홈 지도의 네 가장자리를 옅게 하는 마스크. 색면과 간선이 헤더·대표 글 선에 닿거나 상자 끝에서 뚝 잘리지 않게 한다.
// 왼쪽은 소개 글과 만나는 자리라 더 일찍 풀린다. 값은 상자 폭·높이에 대한 비율이다.
// 전에는 CSS mask-image로 상자 전체를 옅게 해서 가장자리 가까이 놓인 영역 이름까지 흐려졌다(1280px에서 "커리어"가 1.68:1).
// 그래서 SVG 마스크로 색면·간선·노드 층에만 씌우고, 글자 층은 마스크 밖에 둔다.
export const HERO_FADE = { x: [0.14, 0.84], y: [0.1, 0.9] } as const;

// 마스크가 든 <defs>. 씌우는 요소는 변환이 없는 바깥 좌표계에 있어야 한다. 그래야 100%가 상자 크기가 된다.
// 알파 마스크 두 장을 겹쳐 CSS의 mask-composite: intersect와 같은 결과를 낸다. 가로 그라데이션을 칠한 사각형에 세로 마스크를 씌운다.
export function heroFadeDefs(id: string): string {
  const stops = ([from, to]: readonly [number, number]) => `<stop offset="0" stop-opacity="0"></stop><stop offset="${from}"></stop><stop offset="${to}"></stop><stop offset="1" stop-opacity="0"></stop>`;
  const box = 'maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" mask-type="alpha"';
  return `<defs><linearGradient id="${id}-x" x2="1" y2="0">${stops(HERO_FADE.x)}</linearGradient>`
    + `<linearGradient id="${id}-y" x2="0" y2="1">${stops(HERO_FADE.y)}</linearGradient>`
    + `<mask id="${id}-v" ${box}><rect width="100%" height="100%" fill="url(#${id}-y)"></rect></mask>`
    + `<mask id="${id}" ${box}><rect width="100%" height="100%" fill="url(#${id}-x)" mask="url(#${id}-v)"></rect></mask></defs>`;
}
