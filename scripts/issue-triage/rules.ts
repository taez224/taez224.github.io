import type { Verdict } from './questions.ts';

// 임계값이나 대응표를 바꾸면 올린다. 버전이 다른 판정을 한 평가에 섞지 않기 위해서다.
export const RULES_VERSION = '1';

export const NEEDS_TRIAGE = 'needs-triage';
export const TRIAGE_FAILED = 'triage-failed';
export const HIGH_CANDIDATE = 'priority:high-candidate';
export const NEEDS_INFO = 'needs-info';
export const FLAG_INSTRUCTIONS = 'flag:instructions';
export const FLAG_OFF_TOPIC = 'flag:off-topic';

// none과 unknown은 대응표에 없다. 확신도가 높아도 라벨로 바꾸지 않고 소유자의 확인에 맡긴다.
// 라벨 이름은 이 표에서만 나온다. Jev가 돌려준 문자열을 라벨 이름으로 쓰지 않는다.
export const TYPE_LABELS: Readonly<Record<string, string>> = { bug: 'bug', content: 'content', enhancement: 'enhancement', question: 'question' };
export const AREA_LABELS: Readonly<Record<string, string>> = {
  reader: 'area:reader', map: 'area:map', home: 'area:home', search: 'area:search', books: 'area:books', site: 'area:site'
};
export const ALL_LABELS: readonly string[] = [
  ...Object.values(TYPE_LABELS), ...Object.values(AREA_LABELS),
  NEEDS_TRIAGE, TRIAGE_FAILED, HIGH_CANDIDATE, NEEDS_INFO, FLAG_INSTRUCTIONS, FLAG_OFF_TOPIC
];

// 모두 초기값이다. 정확도를 보장하는 수치가 아니며, 확인된 이슈로 평가한 뒤 조정한다.
export const CHOICE_MIN_CONFIDENCE = 0.9;
export const NOUL_YES = 0.8;
export const NOUL_NO = 0.2;
export const IMPACT_MIN_SCORE = 1.75;
export const IMPACT_MIN_CONFIDENCE = 0.9;

export type Trigger = 'opened' | 'dispatch';
export type Decision = { add: string[]; remove: string[]; notes: string[] };

// 이슈가 열릴 때의 첫 실행만 opened다. Actions에서 같은 실행을 다시 돌리면 이벤트는 그대로 issues지만 시도 번호가 2 이상이다.
// 그 실행을 opened로 보면 소유자가 뗀 표시가 되살아나고, 확인을 마친 이슈를 다시 건드린다.
export function triggerFor(eventName: string | undefined, runAttempt: string | undefined): Trigger {
  return eventName === 'issues' && (runAttempt ?? '1') === '1' ? 'opened' : 'dispatch';
}

// Noul에는 confidence가 없어서 값의 구간으로 예, 아니오, 보류를 나눈다.
export function noulState(value: number): 'yes' | 'no' | 'hold' {
  if (value >= NOUL_YES) return 'yes';
  if (value <= NOUL_NO) return 'no';
  return 'hold';
}

// 소유자가 needs-triage를 뗀 이슈는 확인이 끝난 것이다. 재실행이 그 결과를 건드리지 않게 한다.
export function isConfirmed(current: readonly string[], trigger: Trigger): boolean {
  return trigger === 'dispatch' && !current.includes(NEEDS_TRIAGE);
}

function axisLabel(answer: { choice: string; confidence: number }, labels: Readonly<Record<string, string>>, name: string, notes: string[]): string | null {
  if (!Object.hasOwn(labels, answer.choice)) {
    notes.push(`${name}: ${answer.choice}는 라벨로 바꾸지 않음`);
    return null;
  }
  if (answer.confidence < CHOICE_MIN_CONFIDENCE) {
    notes.push(`${name}: 확신도 ${answer.confidence.toFixed(2)}가 ${CHOICE_MIN_CONFIDENCE} 미만`);
    return null;
  }
  return labels[answer.choice] ?? null;
}

export function decide(verdict: Verdict, current: readonly string[], trigger: Trigger): Decision {
  if (isConfirmed(current, trigger)) return { add: [], remove: [], notes: ['확인을 마친 이슈라 건드리지 않음'] };
  const add: string[] = [];
  const notes: string[] = [];
  const typeLabels = Object.values(TYPE_LABELS);
  const areaLabels = Object.values(AREA_LABELS);
  const existingTypes = current.filter((label) => typeLabels.includes(label));
  const existingAreas = current.filter((label) => areaLabels.includes(label));

  // 이슈의 종류는 지금 붙어 있는 라벨이 우선이다. 소유자가 고친 종류를 새 판정으로 뒤집지 않는다.
  let issueType: string | null = null;
  if (existingTypes.length > 1) notes.push('종류: 라벨이 둘 이상이라 보류');
  else if (existingTypes.length === 1) {
    issueType = existingTypes[0] ?? null;
    notes.push('종류: 이미 라벨이 있어 건너뜀');
  } else {
    issueType = axisLabel(verdict.type, TYPE_LABELS, '종류', notes);
    if (issueType) add.push(issueType);
  }
  if (existingAreas.length > 0) notes.push('영역: 이미 라벨이 있어 건너뜀');
  else {
    const area = axisLabel(verdict.area, AREA_LABELS, '영역', notes);
    if (area) add.push(area);
  }

  // 표시와 우선순위 후보는 이슈가 열릴 때의 실행에서만 붙인다. 소유자가 뗀 표시를 재실행이 되살리지 않게 한다.
  // triage-failed가 있다고 최초 분류로 보지 않는다. 한 번 성공한 뒤의 재실행이 실패해도 그 라벨이 붙기 때문이다.
  if (trigger === 'opened') {
    if (issueType === TYPE_LABELS.bug && noulState(verdict.hasReproInfo) === 'no') add.push(NEEDS_INFO);
    if (noulState(verdict.hasInstructions) === 'yes') add.push(FLAG_INSTRUCTIONS);
    if (noulState(verdict.offTopic) === 'yes') add.push(FLAG_OFF_TOPIC);
    // 영향도는 오류와 내용 정정에서만 뜻이 있다. 질문과 개선 제안에서는 점수를 버린다.
    const weighable = issueType === TYPE_LABELS.bug || issueType === TYPE_LABELS.content;
    if (weighable && verdict.impact.score >= IMPACT_MIN_SCORE && verdict.impact.confidence >= IMPACT_MIN_CONFIDENCE) add.push(HIGH_CANDIDATE);
  } else notes.push('재실행: 표시와 우선순위 후보는 이슈가 열릴 때만 붙임');

  if (!current.includes(NEEDS_TRIAGE)) add.push(NEEDS_TRIAGE);
  return {
    add: add.filter((label) => !current.includes(label)),
    remove: current.includes(TRIAGE_FAILED) ? [TRIAGE_FAILED] : [],
    notes
  };
}

// 실패를 none으로 바꾸지 않는다. 분류하지 못한 것과 해당 없음으로 판정한 것은 다르다.
export function decideFailure(current: readonly string[]): Decision {
  return { add: [NEEDS_TRIAGE, TRIAGE_FAILED].filter((label) => !current.includes(label)), remove: [], notes: ['분류 실패'] };
}

// Jev를 부르지 않고 확인 대상으로만 남긴다. 이유는 부르는 쪽이 적는다(상한 초과, 최근 이슈 수 확인 불가).
export function decideCapped(current: readonly string[], reason: string): Decision {
  return { add: [NEEDS_TRIAGE].filter((label) => !current.includes(label)), remove: [], notes: [reason] };
}
