import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/issue-triage.yml');
const form = read('.github/ISSUE_TEMPLATE/feedback.yml');

test('the workflow never interpolates text a reader wrote', () => {
  // 식으로 끼워 넣은 값은 셸 명령이나 YAML의 일부가 된다. 숫자인 이슈 번호만 허용한다.
  assert.doesNotMatch(workflow, /\$\{\{[^}]*github\.event\.issue\.(?!number\b)/);
  assert.doesNotMatch(workflow, /\$\{\{[^}]*github\.event\.(comment|sender|label)/);
  assert.doesNotMatch(workflow, /github\.event\.issue\.(title|body)/);
});

test('the workflow can write issues and nothing else', () => {
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.deepEqual(workflow.match(/^\s+[a-z-]+: write$/gm)?.map((line) => line.trim()), ['issues: write']);
  assert.match(workflow, /^\s+contents: read$/m);
});

test('the Jev key comes from the environment that only main may use', () => {
  assert.match(workflow, /^\s+environment: issue-triage$/m);
  assert.equal(workflow.match(/secrets\./g)?.length, 1);
  assert.match(workflow, /TYPESAFE_API_KEY: \$\{\{ secrets\.TYPESAFE_API_KEY \}\}/);
});

test('the workflow runs the fixed script from the default branch without installing packages or using caches', () => {
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /run: node scripts\/issue-triage\.ts$/m);
  assert.doesNotMatch(workflow, /npm (ci|install)|npx /);
  assert.match(workflow, /^cache-mode: none$/m);
  assert.doesNotMatch(workflow, /actions\/cache|cache: npm/);
});

test('every action is pinned to a commit', () => {
  const uses = [...workflow.matchAll(/uses: (\S+)/g)].map((match) => match[1] ?? '');
  assert.ok(uses.length >= 3);
  for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, ref);
});

test('a rerun of the same run keeps its own verdict record', () => {
  // run_id는 재실행에서도 같다. 시도 번호가 없으면 같은 이름의 아티팩트가 이미 있어 업로드가 실패한다.
  assert.match(workflow, /name: triage-record-.*\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/m);
});

test('the report form asks only for free text, marks the issue for triage, and tells the reader where the text goes', () => {
  assert.deepEqual([...form.matchAll(/^\s+id: (\w+)$/gm)].map((match) => match[1]), ['page', 'what', 'expected']);
  assert.match(form, /^labels: \[needs-triage\]$/m);
  assert.equal(form.match(/required: true/g)?.length, 1);
  // 종류와 영역을 고르는 칸을 두면 Jev가 분류할 것이 남지 않는다.
  assert.doesNotMatch(form, /type: (dropdown|checkboxes)/);
  assert.match(form, /공개 이슈/);
  assert.match(form, /TypeSafe/);
});
