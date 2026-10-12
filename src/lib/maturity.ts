import type { PixelIconName } from './pixel-icons.ts';

// 노트(Slipbox)의 성숙도(status)를 독자에게 보이는 이름·도안·뜻으로 옮긴다. 값은 vault 속성 스키마의 seedling·growing·evergreen이다.
// 내부 값을 그대로 보이지 않고 정원 비유의 이름으로 바꾼다. 세 이름은 모두 한 단어 명사라 메타 줄에서 나란히 읽힌다.
export interface MaturityStage { status: string; label: string; icon: PixelIconName; open?: PixelIconName; meaning: string }

export const MATURITY_STAGES: readonly MaturityStage[] = [
  { status: 'seedling', label: '새싹', icon: 'seedling', open: 'seedlingOpen', meaning: '생각을 세웠지만 아직 거친 노트' },
  { status: 'growing', label: '묘목', icon: 'growing', meaning: '다시 읽고 다듬었지만 고칠 데가 남은 노트' },
  { status: 'evergreen', label: '나무', icon: 'evergreen', meaning: '다시 읽어도 주장을 바꿀 데가 없는 노트' }
];

// 허브는 주장 노트가 아니라 성숙도를 쓰지 않는다. 블로그·개발 노트의 status는 발행 상태라 성숙도로 읽지 않는다.
export function maturityOf(note: { kind: string; type?: string; status?: string }): MaturityStage | null {
  if (note.kind !== 'slipbox' || note.type === 'hub') return null;
  return MATURITY_STAGES.find((stage) => stage.status === note.status) ?? null;
}
