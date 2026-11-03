import { pixelIcon } from './pixel-icons.ts';
import type { PixelIconName } from './pixel-icons.ts';

// 노트(Slipbox)의 성숙도(status)를 독자에게 보이는 이름·도안·뜻으로 옮긴다. 값은 vault 속성 스키마의 seedling·growing·evergreen이다.
// 내부 값을 그대로 보이지 않고 정원 비유의 이름으로 바꾼다. 세 이름은 모두 한 단어 명사라 메타 줄에서 나란히 읽힌다.
export interface MaturityStage { status: string; label: string; icon: PixelIconName; open?: PixelIconName; meaning: string }

export const MATURITY_STAGES: readonly MaturityStage[] = [
  { status: 'seedling', label: '새싹', icon: 'seedling', open: 'seedlingOpen', meaning: '생각을 처음 정리한 노트' },
  { status: 'growing', label: '묘목', icon: 'growing', meaning: '다시 읽고 설명과 근거를 다듬은 노트' },
  { status: 'evergreen', label: '나무', icon: 'evergreen', meaning: '핵심 생각과 설명이 비교적 안정된 노트' }
];

// 허브는 주장 노트가 아니라 성숙도를 쓰지 않는다. 블로그·개발 노트의 status는 발행 상태라 성숙도로 읽지 않는다.
export function maturityOf(note: { kind: string; type?: string; status?: string }): MaturityStage | null {
  if (note.kind !== 'slipbox' || note.type === 'hub') return null;
  return MATURITY_STAGES.find((stage) => stage.status === note.status) ?? null;
}

// 노트 페이지의 메타 줄과 지도 패널의 메타 줄이 같은 버튼과 설명 판을 쓴다. 지도 패널은 스크립트가 HTML로 그리므로
// Astro 템플릿을 나눠 쓸 수 없어 마크업을 여기서 한 번만 만든다. 한 페이지에 설명 판은 하나라 id를 고정한다.
export const MATURITY_NOTE_ID = 'maturity-note';

export function maturityButtonHtml(stage: MaturityStage): string {
  return `<button type="button" class="maturity" popovertarget="${MATURITY_NOTE_ID}" aria-controls="${MATURITY_NOTE_ID}" aria-label="노트 성숙도: ${stage.label}" data-maturity>${pixelIcon(stage.icon, stage.open)}${stage.label}</button>`;
}

export function maturityNoteHtml(stage: MaturityStage): string {
  const items = MATURITY_STAGES.map((item) => `<li${item === stage ? ' aria-current="true"' : ''}>${pixelIcon(item.icon)}<b>${item.label}</b><span>${item.meaning}</span></li>`).join('');
  return `<div id="${MATURITY_NOTE_ID}" class="maturity-note" popover><p>노트를 얼마나 다듬었는지 나타냅니다.</p><ol>${items}</ol></div>`;
}
