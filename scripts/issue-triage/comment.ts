import type { AreaOption, TypeOption } from './questions.ts';
import { AREA_LABELS, CHOICE_MIN_CONFIDENCE, TYPE_LABELS } from './rules.ts';
import type { TriageRecord } from './run.ts';

// 댓글에 보이는 이름이다. 선택지의 영어 이름은 내부 값이어서 독자에게 그대로 보이지 않는다.
const TYPE_NAMES: Record<TypeOption, string> = { bug: '오류', content: '내용 정정', enhancement: '개선 제안', question: '질문', none: '해당 없음' };
const AREA_NAMES: Record<AreaOption, string> = { reader: '읽기 화면', map: '지도', home: '홈', search: '검색', books: '책장', site: '사이트 전반', unknown: '알 수 없음' };

const RECORD_MARK = 'issue-triage:record';

// 계정 이름은 Actions가 주는 저장소 소유자 값이다. 태그된 사람은 저장소를 지켜보지 않아도 언급 알림의 대상이 된다.
// 실제로 알림을 받는지는 그 사람의 GitHub 알림 설정에 달려 있다.
// 형식이 GitHub 계정 이름과 다르면 태그하지 않는다. 뒤에 붙는 조사 "가"는 두 경우에 모두 맞는다.
function ownerName(owner: string | null): string {
  return owner && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) ? `@${owner}` : '운영자';
}

// 그 축의 라벨이 실제로 어떻게 되었는지를 적는다. 판정에서 미루어 짐작하지 않고, 적용 직전의 라벨과 이번에 붙인 라벨로 정한다.
function handling(axis: string, answer: { choice: string }, labels: Readonly<Record<string, string>>, record: TriageRecord): string {
  // 소유자가 먼저 붙인 라벨이 있으면 판정이 무엇이든 그 라벨이 유지된다.
  const axisLabels = Object.values(labels);
  const kept = (record.labelsBefore ?? []).filter((label) => axisLabels.includes(label));
  if (kept.length > 0) return `기존 ${kept.map((label) => `\`${label}\``).join(', ')} 유지`;
  if (!Object.hasOwn(labels, answer.choice)) return '라벨 없음';
  const label = labels[answer.choice] ?? '';
  if (record.added.includes(label)) return `\`${label}\``;
  return `${axis} 라벨 보류`;
}

function candidates<T extends string>(probabilities: Record<T, number>, names: Record<T, string>): string {
  return (Object.entries(probabilities) as [T, number][])
    .filter(([, probability]) => probability >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([option, probability]) => `${names[option]} ${probability.toFixed(2)}`)
    .join(', ');
}

// HTML 주석은 화면에 보이지 않을 뿐 원문과 API에서는 공개된다. 기록에는 이슈의 제목과 본문이 없다.
// 평가할 때 "처음 붙인 라벨이 맞았는가"를 이 기록으로 본다. 다시 부른 판정은 처음의 판정과 값이 다를 수 있다.
function hidden(record: TriageRecord): string {
  // 주석이 중간에 끝나지 않도록 연속한 하이픈을 JSON 이스케이프로 바꾼다.
  return `<!-- ${RECORD_MARK} ${JSON.stringify(record).replaceAll('--', '\\u002d\\u002d')} -->`;
}

export function readRecord(comment: string): TriageRecord | null {
  const match = comment.match(new RegExp(`<!-- ${RECORD_MARK} (.*) -->`));
  return match?.[1] ? JSON.parse(match[1]) as TriageRecord : null;
}

// 정해 둔 문구와 판정값만 쓴다. 이슈의 제목이나 본문을 옮기면 독자가 쓴 글이 봇의 이름으로 다시 게시된다.
// 본문은 제보자가 읽는 부분이어서 추정과 처리 결과만 둔다. 숫자는 접힌 부분에 두고, 영향도와 표시 판정은 보이지 않는다.
export function renderComment(record: TriageRecord, owner: string | null): string {
  const who = ownerName(owner);
  const verdict = record.verdict;
  if (!verdict) {
    // triage-failed 라벨은 붙으므로 "라벨을 붙이지 못했다"고 쓰지 않는다.
    return ['제보 감사합니다. 종류와 영역을 자동으로 분류하지 못했습니다.', '', `${who}가 내용을 직접 확인합니다.`, '', hidden(record)].join('\n');
  }
  const typeName = verdict.type.choice === 'none' ? '정하지 못함' : TYPE_NAMES[verdict.type.choice];
  const areaName = verdict.area.choice === 'unknown' ? '정하지 못함' : AREA_NAMES[verdict.area.choice];
  return [
    '제보 감사합니다. 아래는 자동 분류의 추정이어서 틀릴 수 있습니다.',
    '',
    '| 항목 | 추정 | 현재 처리 |',
    '|---|---|---|',
    `| 종류 | ${typeName} | ${handling('종류', verdict.type, TYPE_LABELS, record)} |`,
    `| 영역 | ${areaName} | ${handling('영역', verdict.area, AREA_LABELS, record)} |`,
    '',
    `최종 분류는 ${who}가 내용을 확인한 뒤 정합니다.`,
    '',
    '<details><summary>자세히</summary>',
    '',
    `확신도는 0에서 1 사이의 값이고, ${CHOICE_MIN_CONFIDENCE} 이상일 때만 라벨을 붙입니다.`,
    '',
    '| 항목 | 확신도 | 후보별 확률 |',
    '|---|---|---|',
    `| 종류 | ${verdict.type.confidence.toFixed(2)} | ${candidates(verdict.type.probabilities, TYPE_NAMES)} |`,
    `| 영역 | ${verdict.area.confidence.toFixed(2)} | ${candidates(verdict.area.probabilities, AREA_NAMES)} |`,
    '',
    `모델 ${record.model}, 질문 버전 ${record.questionsVersion}, 규칙 버전 ${record.rulesVersion}.`,
    '',
    '</details>',
    '',
    hidden(record)
  ].join('\n');
}
