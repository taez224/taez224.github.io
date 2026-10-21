// 조작 버튼의 선 아이콘이다. 모양은 돋보기·해·달·×처럼 관례로 굳은 것을 따르고, 획은 이 사이트에 맞춰 직접 그렸다.
// 한 칸이 1px인 격자에 2px 획의 중심을 정수 좌표로 두어, 1배율 화면에서도 곧은 선의 가장자리가 칸 경계에 맞는다.
// 24칸 도안을 줄여 쓰면 획이 1px 남짓으로 가늘어지고 칸 사이에 걸려 회색으로 번졌다(docs/2026-10-21-icon-stroke 비교).
// 끝과 이음은 사이트의 직각 모서리 규칙에 맞춰 각지게 둔다. 격자 크기가 곧 표시 크기라, 표시 크기를 바꾸면 도안도 다시 그린다.
const icons = {
  search: [18, '<circle cx="8" cy="8" r="5"/><path d="M12 12L16 16"/>'],
  sun: [18, '<circle cx="9" cy="9" r="3"/><path d="M9 1V3M9 15V17M1 9H3M15 9H17M3.5 3.5L4.5 4.5M13.5 13.5L14.5 14.5M3.5 14.5L4.5 13.5M13.5 4.5L14.5 3.5"/>'],
  moon: [18, '<path d="M15 11A7 7 0 1 1 7 3A6.5 6.5 0 0 0 15 11Z"/>'],
  close: [18, '<path d="M4 4L14 14M14 4L4 14"/>'],
  copy: [16, '<rect x="6" y="6" width="8" height="8"/><path d="M3 11V3H11"/>'],
  copyDone: [16, '<path d="M2 8L6 12L14 4"/>'],
  contents: [16, '<path d="M6 3H14M6 8H14M6 13H14M2 3H3M2 8H3M2 13H3"/>'],
  zoomOut: [16, '<path d="M3 8H13"/>'],
  zoomIn: [16, '<path d="M3 8H13M8 3V13"/>'],
  fit: [16, '<path d="M2 5V2H5M11 2H14V5M14 11V14H11M5 14H2V11"/>'],
  rss: [14, '<path d="M2 2A10 10 0 0 1 12 12M2 6A6 6 0 0 1 8 12M3 11V11"/>']
} as const satisfies Record<string, readonly [number, string]>;

export type UiIconName = keyof typeof icons;

export const UI_ICON_GRIDS = Object.fromEntries(Object.entries(icons).map(([name, [grid]]) => [name, grid])) as Record<UiIconName, number>;

// 버튼의 접근 가능한 이름은 호출부가 맡고, 도안은 낭독기에서 숨긴다.
export function uiIcon(name: UiIconName): string {
  const [grid, body] = icons[name];
  return `<svg width="${grid}" height="${grid}" viewBox="0 0 ${grid} ${grid}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${body}</svg>`;
}
