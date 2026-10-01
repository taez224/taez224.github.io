import { createHash } from 'node:crypto';

// 건당 비용과 Jev의 입력 한도를 묶는 길이다. 넘으면 앞부분만 보내고 잘랐다는 사실을 기록한다.
export const BODY_LIMIT = 6000;

export type TriageInput = { state: { title: string; body: string }; truncated: boolean; hash: string };

// 독자가 쓴 글을 고치지 않는다. 번역도 정리도 하지 않고 길이만 제한한다.
export function buildInput(title: string, body: string | null): TriageInput {
  const full = body ?? '';
  const truncated = full.length > BODY_LIMIT;
  const state = { title, body: truncated ? full.slice(0, BODY_LIMIT) : full };
  // 실행 기록에는 본문 대신 해시를 남긴다. 같은 입력으로 다시 판정했는지 확인할 때 쓴다.
  const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
  return { state, truncated, hash };
}
