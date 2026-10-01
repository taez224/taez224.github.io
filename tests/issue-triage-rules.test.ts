import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_OPTIONS, IMPACT_LEVELS, QUESTIONS, TYPE_OPTIONS } from '../scripts/issue-triage/questions.ts';
import {
  ALL_LABELS, AREA_LABELS, FLAG_INSTRUCTIONS, FLAG_OFF_TOPIC, HIGH_CANDIDATE, NEEDS_INFO, NEEDS_TRIAGE, TRIAGE_FAILED, TYPE_LABELS,
  decide, decideCapped, decideFailure, isConfirmed, noulState, triggerFor
} from '../scripts/issue-triage/rules.ts';
import { kind, place, verdict } from './helpers/triage.ts';

const sorted = (labels: string[]) => [...labels].sort();

test('every choice option has a description and every non-fallback option maps to a label', () => {
  assert.deepEqual(Object.keys(QUESTIONS.type.criteria), [...TYPE_OPTIONS]);
  assert.deepEqual(Object.keys(QUESTIONS.area.criteria), [...AREA_OPTIONS]);
  assert.deepEqual(Object.keys(TYPE_LABELS), TYPE_OPTIONS.filter((option) => option !== 'none'));
  assert.deepEqual(Object.keys(AREA_LABELS), AREA_OPTIONS.filter((option) => option !== 'unknown'));
  assert.equal(QUESTIONS.impact.criteria.length, IMPACT_LEVELS);
});

test('a confident verdict on a new issue adds its type and area labels and keeps the issue in triage', () => {
  const decision = decide(verdict(), [], 'opened');
  assert.deepEqual(sorted(decision.add), ['area:reader', 'bug', NEEDS_TRIAGE]);
  assert.deepEqual(decision.remove, []);
});

test('labels already on the issue are not added again', () => {
  // 폼이 needs-triage를 먼저 붙여 둔다.
  assert.deepEqual(sorted(decide(verdict(), [NEEDS_TRIAGE], 'opened').add), ['area:reader', 'bug']);
});

test('each axis is judged on its own confidence', () => {
  const decision = decide(verdict({ area: place('reader', 0.89) }), [NEEDS_TRIAGE], 'opened');
  assert.deepEqual(decision.add, ['bug']);
  assert.ok(decision.notes.some((note) => note.startsWith('영역')));
});

test('the fallback options never become labels, however confident', () => {
  const decision = decide(verdict({ type: kind('none'), area: place('unknown') }), [NEEDS_TRIAGE], 'opened');
  assert.deepEqual(decision.add, []);
});

test('a noul value is yes from 0.8, no up to 0.2, and held in between', () => {
  assert.equal(noulState(0.8), 'yes');
  assert.equal(noulState(0.79), 'hold');
  assert.equal(noulState(0.21), 'hold');
  assert.equal(noulState(0.2), 'no');
});

test('needs-info is added only to bug reports that clearly lack reproduction detail', () => {
  assert.ok(decide(verdict({ hasReproInfo: 0.1 }), [NEEDS_TRIAGE], 'opened').add.includes(NEEDS_INFO));
  assert.ok(!decide(verdict({ hasReproInfo: 0.5 }), [NEEDS_TRIAGE], 'opened').add.includes(NEEDS_INFO));
  assert.ok(!decide(verdict({ type: kind('question'), hasReproInfo: 0.1 }), [NEEDS_TRIAGE], 'opened').add.includes(NEEDS_INFO));
});

test('the instruction and off-topic flags are added only on a clear yes', () => {
  const decision = decide(verdict({ type: kind('none'), area: place('unknown'), hasInstructions: 0.99, offTopic: 0.82 }), [NEEDS_TRIAGE], 'opened');
  assert.deepEqual(sorted(decision.add), [FLAG_INSTRUCTIONS, FLAG_OFF_TOPIC]);
  assert.deepEqual(decide(verdict({ hasInstructions: 0.7, offTopic: 0.7 }), [NEEDS_TRIAGE], 'opened').add.filter((label) => label.startsWith('flag:')), []);
});

test('the priority candidate needs a bug or content issue, a high score and a confident score', () => {
  const high = { score: 2, confidence: 1 };
  assert.ok(decide(verdict({ impact: high }), [NEEDS_TRIAGE], 'opened').add.includes(HIGH_CANDIDATE));
  assert.ok(decide(verdict({ type: kind('content'), impact: high }), [NEEDS_TRIAGE], 'opened').add.includes(HIGH_CANDIDATE));
  assert.ok(!decide(verdict({ type: kind('enhancement'), impact: high }), [NEEDS_TRIAGE], 'opened').add.includes(HIGH_CANDIDATE));
  assert.ok(!decide(verdict({ impact: { score: 2.51, confidence: 0.51 } }), [NEEDS_TRIAGE], 'opened').add.includes(HIGH_CANDIDATE));
  assert.ok(!decide(verdict({ impact: { score: 1.54, confidence: 1 } }), [NEEDS_TRIAGE], 'opened').add.includes(HIGH_CANDIDATE));
});

test('only the first attempt of an issues event counts as the opening run', () => {
  assert.equal(triggerFor('issues', '1'), 'opened');
  // 로컬 시험 실행에는 시도 번호가 없다.
  assert.equal(triggerFor('issues', undefined), 'opened');
  // Actions의 Re-run jobs는 같은 이벤트를 시도 번호만 올려 다시 실행한다.
  assert.equal(triggerFor('issues', '2'), 'dispatch');
  assert.equal(triggerFor('workflow_dispatch', '1'), 'dispatch');
});

test('a rerun leaves an issue alone once the owner has removed needs-triage', () => {
  assert.equal(isConfirmed(['bug'], 'dispatch'), true);
  assert.equal(isConfirmed(['bug', NEEDS_TRIAGE], 'dispatch'), false);
  // 빈 이슈로 연 소유자의 이슈에는 처음에 needs-triage가 없다. 그래도 opened는 확인된 것으로 보지 않는다.
  assert.equal(isConfirmed([], 'opened'), false);
  assert.deepEqual(decide(verdict(), ['content'], 'dispatch'), { add: [], remove: [], notes: ['확인을 마친 이슈라 건드리지 않음'] });
});

test('a rerun keeps the type the owner set, fills only the empty axis, and adds no flags', () => {
  // 소유자가 종류를 content로 고쳤다. Jev는 여전히 bug라고 답하고 표시 조건도 모두 참이다.
  const decision = decide(verdict({ hasReproInfo: 0.1, hasInstructions: 0.99, impact: { score: 3, confidence: 1 } }), [NEEDS_TRIAGE, 'content'], 'dispatch');
  assert.deepEqual(decision.add, ['area:reader']);
  assert.deepEqual(decision.remove, []);
});

test('a rerun after a failure fills type and area and clears the failure label, but adds no flags', () => {
  const decision = decide(verdict({ hasInstructions: 0.99, impact: { score: 3, confidence: 1 } }), [NEEDS_TRIAGE, TRIAGE_FAILED], 'dispatch');
  assert.deepEqual(sorted(decision.add), ['area:reader', 'bug']);
  assert.deepEqual(decision.remove, [TRIAGE_FAILED]);
});

test('flags the owner removed stay removed through a failed rerun and the rerun after it', () => {
  // 최초 분류가 성공했고, 소유자가 표시와 후보를 뗐고, 그 뒤의 재실행이 실패해 triage-failed가 붙은 상태다.
  const decision = decide(verdict({ hasReproInfo: 0.1, hasInstructions: 0.99, offTopic: 0.99, impact: { score: 3, confidence: 1 } }), [NEEDS_TRIAGE, TRIAGE_FAILED, 'bug', 'area:reader'], 'dispatch');
  assert.deepEqual(decision.add, []);
  assert.deepEqual(decision.remove, [TRIAGE_FAILED]);
});

test('impact and needs-info follow the type label on the issue, not the new verdict', () => {
  // 작업이 기다리는 동안 소유자가 content를 붙였다. Jev는 bug라고 답한다.
  const decision = decide(verdict({ hasReproInfo: 0.1, impact: { score: 2, confidence: 1 } }), [NEEDS_TRIAGE, 'content'], 'opened');
  assert.ok(decision.add.includes(HIGH_CANDIDATE));
  assert.ok(!decision.add.includes(NEEDS_INFO));
  assert.ok(!decision.add.includes('bug'));
});

test('two type labels are a conflict, so impact and needs-info are held back', () => {
  const decision = decide(verdict({ hasReproInfo: 0.1, impact: { score: 3, confidence: 1 } }), [NEEDS_TRIAGE, 'bug', 'content'], 'opened');
  assert.deepEqual(decision.add, ['area:reader']);
});

test('a failed or capped run only marks the issue, without guessing a type', () => {
  assert.deepEqual(decideFailure([]).add, [NEEDS_TRIAGE, TRIAGE_FAILED]);
  assert.deepEqual(decideFailure([NEEDS_TRIAGE]).add, [TRIAGE_FAILED]);
  assert.deepEqual(decideCapped([], '하루 상한'), { add: [NEEDS_TRIAGE], remove: [], notes: ['하루 상한'] });
  assert.deepEqual(decideCapped([NEEDS_TRIAGE], '하루 상한').add, []);
});

test('every label a decision can add is a managed label', () => {
  const everything = decide(verdict({ hasReproInfo: 0, hasInstructions: 1, offTopic: 1, impact: { score: 3, confidence: 1 } }), [], 'opened');
  for (const label of [...everything.add, ...decideFailure([]).add]) assert.ok(ALL_LABELS.includes(label), label);
});
