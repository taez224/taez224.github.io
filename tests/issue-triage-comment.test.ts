import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecord, renderComment } from '../scripts/issue-triage/comment.ts';
import { newRecord, type TriageRecord } from '../scripts/issue-triage/run.ts';
import { kind, place, verdict } from './helpers/triage.ts';

// 종류는 개선 제안과 오류로 갈려 보류되고, 영역은 읽기 화면으로 붙은 실행이다. 실제 이슈 #41의 판정과 같은 모양이다.
function record(over: Partial<TriageRecord> = {}): TriageRecord {
  const split = { ...kind('enhancement', 0.58), probabilities: { bug: 0.33, content: 0, enhancement: 0.67, question: 0, none: 0 } };
  const reader = { ...place('reader', 0.92), probabilities: { reader: 0.93, map: 0.07, home: 0, search: 0, books: 0, site: 0, unknown: 0 } };
  return {
    ...newRecord(41, 'opened'),
    outcome: 'classified',
    stage: 'done',
    inputHash: 'c5'.repeat(32),
    truncated: false,
    verdict: verdict({ type: split, area: reader, impact: { score: 1.08, confidence: 0.92 }, hasInstructions: 0.99 }),
    labelsBefore: ['needs-triage'],
    added: ['area:reader'],
    notes: ['종류: 확신도 0.58가 0.9 미만'],
    ...over
  };
}
const visible = (comment: string) => comment.split('<details>')[0] ?? '';

test('the visible part shows the guess and what was done with it, and tags the owner', () => {
  const comment = renderComment(record(), 'taez224');
  const shown = visible(comment);
  assert.match(shown, /^제보 감사합니다\. 아래는 자동 분류의 추정이어서 틀릴 수 있습니다\./);
  assert.ok(shown.includes('| 종류 | 개선 제안 | 종류 라벨 보류 |'));
  assert.ok(shown.includes('| 영역 | 읽기 화면 | `area:reader` |'));
  assert.ok(shown.includes('최종 분류는 @taez224가 내용을 확인한 뒤 정합니다.'));
});

test('numbers stay inside the folded part', () => {
  const comment = renderComment(record(), 'taez224');
  assert.doesNotMatch(visible(comment), /\d\.\d/);
  const folded = comment.slice(comment.indexOf('<details>'), comment.indexOf('</details>'));
  assert.ok(folded.includes('| 종류 | 0.58 | 개선 제안 0.67, 오류 0.33 |'));
  assert.ok(folded.includes('| 영역 | 0.92 | 읽기 화면 0.93, 지도 0.07 |'));
  assert.ok(folded.includes('0.9 이상일 때만 라벨을 붙입니다'));
  assert.ok(folded.includes('모델 jev-1.13.0, 질문 버전 1, 규칙 버전 1.'));
});

test('impact and the flag verdicts are not shown to the reporter', () => {
  const comment = renderComment(record(), 'taez224');
  const readable = comment.slice(0, comment.indexOf('<!--'));
  for (const hiddenWord of ['영향', '1.08', '지시문', '0.99', 'flag:', 'priority:']) assert.ok(!readable.includes(hiddenWord), hiddenWord);
});

test('each axis says how its label ended up', () => {
  const row = (over: Partial<TriageRecord>, axis: string) => renderComment(record(over), 'taez224').split('\n').find((line) => line.startsWith(`| ${axis} |`));
  // 확신 있게 붙인 경우
  assert.equal(row({ verdict: verdict({ type: kind('bug') }), added: ['bug'] }, '종류'), '| 종류 | 오류 | `bug` |');
  // 해당 없음과 알 수 없음은 확신도가 높아도 라벨이 되지 않는다.
  assert.equal(row({ verdict: verdict({ type: kind('none') }), added: [] }, '종류'), '| 종류 | 정하지 못함 | 라벨 없음 |');
  assert.equal(row({ verdict: verdict({ area: place('unknown') }), added: [] }, '영역'), '| 영역 | 정하지 못함 | 라벨 없음 |');
  assert.equal(row({ verdict: verdict({ area: place('map', 0.6) }), added: [] }, '영역'), '| 영역 | 지도 | 영역 라벨 보류 |');
});

test('a label the owner had already set is reported as kept, whatever the verdict says', () => {
  const row = (over: Partial<TriageRecord>, axis: string) => renderComment(record({ labelsBefore: ['needs-triage', 'bug', 'area:reader'], added: [], ...over }), 'taez224').split('\n').find((line) => line.startsWith(`| ${axis} |`));
  // 판정이 다른 종류를 확신해도, 확신이 낮아도, 해당 없음이어도 실제로는 소유자의 라벨이 남는다.
  assert.equal(row({ verdict: verdict({ type: kind('content') }) }, '종류'), '| 종류 | 내용 정정 | 기존 `bug` 유지 |');
  assert.equal(row({ verdict: verdict({ type: kind('enhancement', 0.6) }) }, '종류'), '| 종류 | 개선 제안 | 기존 `bug` 유지 |');
  assert.equal(row({ verdict: verdict({ type: kind('none') }) }, '종류'), '| 종류 | 정하지 못함 | 기존 `bug` 유지 |');
  assert.equal(row({ verdict: verdict({ area: place('map', 0.6) }) }, '영역'), '| 영역 | 지도 | 기존 `area:reader` 유지 |');
  assert.equal(row({ verdict: verdict({ area: place('unknown') }) }, '영역'), '| 영역 | 정하지 못함 | 기존 `area:reader` 유지 |');
});

test('the hidden record round-trips and carries the first verdict', () => {
  const original = record();
  const comment = renderComment(original, 'taez224');
  assert.deepEqual(readRecord(comment), original);
  assert.equal(readRecord('아무 기록도 없는 댓글'), null);
});

test('a note containing a double hyphen cannot end the hidden record early', () => {
  const tricky = record({ notes: ['a --> b', '<!-- c -->'] });
  const comment = renderComment(tricky, 'taez224');
  assert.equal(comment.match(/-->/g)?.length, 1);
  assert.ok(comment.trimEnd().endsWith('-->'));
  assert.deepEqual(readRecord(comment)?.notes, ['a --> b', '<!-- c -->']);
});

test('the owner is tagged only when the value looks like an account name', () => {
  assert.ok(renderComment(record(), 'taez224').includes('@taez224가'));
  for (const odd of [null, '', 'a b', '@x', 'name\n@someone', '-lead']) {
    const comment = renderComment(record(), odd);
    assert.ok(comment.includes('최종 분류는 운영자가 내용을 확인한 뒤 정합니다.'), String(odd));
    assert.ok(!visible(comment).includes('@'), String(odd));
  }
});

test('a failed classification gets a short comment that still tags the owner', () => {
  const failed = record({ outcome: 'failed', verdict: null, added: ['triage-failed'], error: 'Jev 응답 503', notes: ['분류 실패'] });
  const comment = renderComment(failed, 'taez224');
  assert.match(comment, /^제보 감사합니다\. 종류와 영역을 자동으로 분류하지 못했습니다\./);
  // 실패했을 때도 triage-failed는 붙는다. 라벨을 붙이지 못했다고 쓰면 틀린 말이다.
  assert.ok(!comment.includes('라벨을 붙이지 못했'));
  assert.ok(comment.includes('@taez224가 내용을 직접 확인합니다.'));
  assert.ok(!comment.includes('<details>'));
  assert.equal(readRecord(comment)?.error, 'Jev 응답 503');
});
