import type { TriageRecord } from './run.ts';

const OUTCOME: Record<TriageRecord['outcome'], string> = { classified: '분류함', failed: '분류 실패', capped: '분류 보류', skipped: '건너뜀', error: '실행 오류' };

// Jev는 설명을 생성하지 않는다. 여기 남는 것은 판정값과 적용한 규칙이다.
export function renderSummary(record: TriageRecord): string {
  const lines = [
    `## 이슈 #${record.issue ?? '?'} 분류: ${OUTCOME[record.outcome]}`,
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| 실행 조건 | ${record.trigger} |`,
    `| 마지막 단계 | ${record.stage} |`,
    `| 모델 | ${record.model} |`,
    `| 질문 버전 | ${record.questionsVersion} |`,
    `| 규칙 버전 | ${record.rulesVersion} |`,
    `| 입력 SHA-256 | ${record.inputHash ?? '-'} |`,
    `| 본문 잘림 | ${record.truncated === null ? '-' : record.truncated ? '예' : '아니오'} |`,
    `| 입력 토큰 | ${record.verdict?.inputTokens ?? '-'} |`,
    `| 붙인 라벨 | ${record.added.join(', ') || '-'} |`,
    `| 뗀 라벨 | ${record.removed.join(', ') || '-'} |`
  ];
  if (record.error) lines.push(`| 오류 | ${record.error} |`);
  if (record.verdict) {
    const { type, area, impact, hasReproInfo, hasInstructions, offTopic } = record.verdict;
    lines.push(
      '',
      '| 질문 | 판정값 | 확신도 |',
      '|---|---|---|',
      `| type | ${type.choice} | ${type.confidence.toFixed(2)} |`,
      `| area | ${area.choice} | ${area.confidence.toFixed(2)} |`,
      `| impact | ${impact.score.toFixed(2)} | ${impact.confidence.toFixed(2)} |`,
      `| has_repro_info | ${hasReproInfo.toFixed(2)} | - |`,
      `| has_instructions | ${hasInstructions.toFixed(2)} | - |`,
      `| off_topic | ${offTopic.toFixed(2)} | - |`
    );
  }
  if (record.notes.length > 0) lines.push('', ...record.notes.map((note) => `- ${note}`));
  return lines.join('\n');
}
