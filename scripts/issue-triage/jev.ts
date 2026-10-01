import { AREA_OPTIONS, IMPACT_LEVELS, MODEL, QUESTIONS, TYPE_OPTIONS, type Verdict } from './questions.ts';

// 분류하지 못한 경우를 나타낸다. 실행 흐름이 이 오류만 triage-failed 라벨로 바꾸고, 다른 오류는 그대로 올린다.
export class TriageError extends Error {}

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MAX_ATTEMPTS = 3;
export const TIMEOUT_MS = 20_000;

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new TriageError(`${name}: 응답에 없음`);
  return value as Record<string, unknown>;
}

function unit(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value >= 0 && value <= 1)) throw new TriageError(`${name}: 0과 1 사이의 수가 아님`);
  return value;
}

// 응답을 믿지 않고 모양과 범위를 확인한다. 어긋나면 none으로 바꾸지 않고 분류 실패로 올린다.
export function parseVerdict(json: unknown): Verdict {
  const root = record(json, '응답');
  const answers = record(root.answers, 'answers');
  const usage = record(root.usage, 'usage');
  const choice = <T extends string>(id: string, options: readonly T[]): { choice: T; confidence: number; probabilities: Record<T, number> } => {
    const answer = record(answers[id], id);
    const picked = options.find((option) => option === answer.choice);
    if (picked === undefined) throw new TriageError(`${id}: 선택지 목록에 없는 값`);
    // 응답에 다른 키가 있어도 정해 둔 선택지의 확률만 읽는다. 하나라도 빠지면 분류 실패다.
    const given = record(answer.probabilities, `${id}.probabilities`);
    const probabilities = Object.fromEntries(options.map((option) => [option, unit(given[option], `${id}.probabilities.${option}`)])) as Record<T, number>;
    return { choice: picked, confidence: unit(answer.confidence, `${id}.confidence`), probabilities };
  };
  const noul = (id: string): number => unit(record(answers[id], id).noul, `${id}.noul`);
  const impact = record(answers.impact, 'impact');
  if (typeof impact.score !== 'number' || !(impact.score >= 0 && impact.score <= IMPACT_LEVELS - 1)) throw new TriageError('impact.score: 단계 범위 밖');
  if (typeof root.model !== 'string') throw new TriageError('model: 응답에 없음');
  if (typeof usage.input_tokens !== 'number') throw new TriageError('usage.input_tokens: 응답에 없음');
  return {
    model: root.model,
    inputTokens: usage.input_tokens,
    type: choice('type', TYPE_OPTIONS),
    area: choice('area', AREA_OPTIONS),
    impact: { score: impact.score, confidence: unit(impact.confidence, 'impact.confidence') },
    hasReproInfo: noul('has_repro_info'),
    hasInstructions: noul('has_instructions'),
    offTopic: noul('off_topic')
  };
}

type Deps = { apiKey: string; fetch?: typeof fetch; wait?: (ms: number) => Promise<void> };

export async function askJev(state: { title: string; body: string }, deps: Deps): Promise<Verdict> {
  if (!deps.apiKey) throw new TriageError('TYPESAFE_API_KEY 없음');
  const doFetch = deps.fetch ?? fetch;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // state는 JSON 값으로만 전달한다. 본문에 지시문이 있어도 Jev는 정해진 선택지와 수치만 돌려준다.
  const body = JSON.stringify({ state, model: MODEL, questions: QUESTIONS });
  for (let attempt = 1; ; attempt += 1) {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (error) {
      throw new TriageError(`Jev 요청 실패: ${error instanceof Error ? error.name : '알 수 없는 오류'}`);
    }
    if (res.ok) {
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        throw new TriageError('Jev 응답이 JSON이 아님');
      }
      return parseVerdict(parsed);
    }
    // 과부하와 서버 오류만 다시 시도한다. 키 오류나 형식 오류는 다시 보내도 같다.
    const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) throw new TriageError(`Jev 응답 ${res.status}`);
    await wait(1000 * 2 ** (attempt - 1));
  }
}
