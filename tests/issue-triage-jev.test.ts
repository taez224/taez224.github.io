import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_LIMIT, buildInput } from '../scripts/issue-triage/input.ts';
import { MAX_ATTEMPTS, TriageError, askJev, parseVerdict } from '../scripts/issue-triage/jev.ts';
import { MODEL, QUESTIONS } from '../scripts/issue-triage/questions.ts';

// 2026-10-01에 jev-1.13.0이 실제로 돌려준 응답의 모양이다. 각 테스트가 answers의 일부만 바꾼다.
function reply(answers: Record<string, unknown> = {}) {
  return {
    model: 'jev-1.13.0',
    answers: {
      type: { type: 'choice', choice: 'bug', confidence: 1, probabilities: { bug: 1, content: 0, enhancement: 0, question: 0, none: 0 } },
      area: { type: 'choice', choice: 'reader', confidence: 0.95, probabilities: { reader: 0.97, map: 0.03, home: 0, search: 0, books: 0, site: 0, unknown: 0 } },
      impact: { type: 'score', score: 1.54, confidence: 0.54, legend: {}, probabilities: { 1: 0.46, 2: 0.54 } },
      has_repro_info: { type: 'noul', noul: 0.93 },
      has_instructions: { type: 'noul', noul: 0.02 },
      off_topic: { type: 'noul', noul: 0.02 },
      ...answers
    },
    usage: { input_tokens: 1764, output_tokens: 120 }
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// 정해 둔 응답을 차례로 돌려주고, 받은 요청을 기록한다.
function fakeFetch(replies: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = replies.shift();
    if (!next) throw new Error('예상보다 많은 요청');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn: fn as typeof fetch, calls };
}
const state = { title: '제목', body: '본문' };
const noWait = async () => {};

test('the title and body are sent as written, without translation or cleanup', () => {
  const input = buildInput('[제보] 오타', '둘째 문단에 "방벙"이라고 되어 있어요.');
  assert.deepEqual(input.state, { title: '[제보] 오타', body: '둘째 문단에 "방벙"이라고 되어 있어요.' });
  assert.equal(input.truncated, false);
  assert.match(input.hash, /^[0-9a-f]{64}$/);
});

test('a long body is cut at the limit and the cut is recorded', () => {
  const input = buildInput('제목', '가'.repeat(BODY_LIMIT + 1));
  assert.equal(input.state.body.length, BODY_LIMIT);
  assert.equal(input.truncated, true);
  assert.equal(buildInput('제목', '가'.repeat(BODY_LIMIT)).truncated, false);
});

test('an issue without a body is sent with an empty body, and equal inputs hash equally', () => {
  assert.equal(buildInput('제목', null).state.body, '');
  assert.equal(buildInput('제목', '본문').hash, buildInput('제목', '본문').hash);
  assert.notEqual(buildInput('제목', '본문').hash, buildInput('제목', '다른 본문').hash);
});

test('a well-formed response becomes a verdict', () => {
  assert.deepEqual(parseVerdict(reply()), {
    model: 'jev-1.13.0',
    inputTokens: 1764,
    type: { choice: 'bug', confidence: 1, probabilities: { bug: 1, content: 0, enhancement: 0, question: 0, none: 0 } },
    area: { choice: 'reader', confidence: 0.95, probabilities: { reader: 0.97, map: 0.03, home: 0, search: 0, books: 0, site: 0, unknown: 0 } },
    impact: { score: 1.54, confidence: 0.54 },
    hasReproInfo: 0.93,
    hasInstructions: 0.02,
    offTopic: 0.02
  });
});

test('a missing answer, an unknown option or a number out of range is a triage failure', () => {
  assert.throws(() => parseVerdict(reply({ area: undefined })), TriageError);
  const full = { bug: 1, content: 0, enhancement: 0, question: 0, none: 0 };
  assert.throws(() => parseVerdict(reply({ type: { choice: 'priority:high', confidence: 1, probabilities: full } })), TriageError);
  assert.throws(() => parseVerdict(reply({ type: { choice: 'bug', confidence: 1.2, probabilities: full } })), TriageError);
  // 선택지 하나의 확률이 빠지거나 범위를 벗어나도 실패다.
  assert.throws(() => parseVerdict(reply({ type: { choice: 'bug', confidence: 1, probabilities: { bug: 1 } } })), TriageError);
  assert.throws(() => parseVerdict(reply({ type: { choice: 'bug', confidence: 1, probabilities: { ...full, none: 1.5 } } })), TriageError);
  assert.throws(() => parseVerdict(reply({ type: { choice: 'bug', confidence: 1 } })), TriageError);
  assert.throws(() => parseVerdict(reply({ off_topic: { noul: -0.1 } })), TriageError);
  assert.throws(() => parseVerdict(reply({ impact: { score: 3.5, confidence: 1 } })), TriageError);
  assert.throws(() => parseVerdict(reply({ has_repro_info: { noul: '0.9' } })), TriageError);
  assert.throws(() => parseVerdict({ answers: {} }), TriageError);
  assert.throws(() => parseVerdict(null), TriageError);
});

test('the request carries the pinned model, the questions and the state as JSON', async () => {
  const { fn, calls } = fakeFetch([json(reply())]);
  await askJev(state, { apiKey: 'test-key', fetch: fn, wait: noWait });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal((calls[0]?.init.headers as Record<string, string>).Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { state, model: MODEL, questions: QUESTIONS });
});

test('a rate limit or server error is retried with a growing wait', async () => {
  const { fn, calls } = fakeFetch([json({}, 429), json({}, 529), json(reply())]);
  const waits: number[] = [];
  const verdict = await askJev(state, { apiKey: 'k', fetch: fn, wait: async (ms) => { waits.push(ms); } });
  assert.equal(verdict.type.choice, 'bug');
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('the call gives up after the third attempt', async () => {
  const { fn, calls } = fakeFetch([json({}, 500), json({}, 502), json({}, 503)]);
  await assert.rejects(askJev(state, { apiKey: 'k', fetch: fn, wait: noWait }), TriageError);
  assert.equal(calls.length, MAX_ATTEMPTS);
});

test('a rejected key, a timeout or a non-JSON body fails at once without a retry', async () => {
  for (const first of [json({}, 401), new DOMException('timed out', 'TimeoutError'), new Response('<html>', { status: 200 })]) {
    const { fn, calls } = fakeFetch([first]);
    await assert.rejects(askJev(state, { apiKey: 'k', fetch: fn, wait: noWait }), TriageError);
    assert.equal(calls.length, 1);
  }
});

test('a missing key is a triage failure, so the issue still gets its failure label', async () => {
  const { fn, calls } = fakeFetch([]);
  await assert.rejects(askJev(state, { apiKey: '', fetch: fn, wait: noWait }), TriageError);
  assert.equal(calls.length, 0);
});
