import { AREA_OPTIONS, TYPE_OPTIONS, type AreaOption, type TypeOption, type Verdict } from '../../scripts/issue-triage/questions.ts';

// 고른 선택지에 확률이 전부 몰린 응답을 만든다. 확신도는 확률과 다른 값이어서 따로 받는다.
const answer = <T extends string>(options: readonly T[], choice: T, confidence: number) => ({
  choice,
  confidence,
  probabilities: Object.fromEntries(options.map((option) => [option, option === choice ? 1 : 0])) as Record<T, number>
});
export const kind = (choice: TypeOption, confidence = 1) => answer(TYPE_OPTIONS, choice, confidence);
export const place = (choice: AreaOption, confidence = 1) => answer(AREA_OPTIONS, choice, confidence);

// 확신 있게 "읽기 화면의 사소한 오류"로 판정한 응답이다. 각 테스트가 필요한 값만 바꾼다.
export function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    model: 'jev-1.13.0',
    inputTokens: 1700,
    type: kind('bug'),
    area: place('reader'),
    impact: { score: 0.5, confidence: 0.95 },
    hasReproInfo: 0.9,
    hasInstructions: 0.02,
    offTopic: 0.02,
    ...over
  };
}
