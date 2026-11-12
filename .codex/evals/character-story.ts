import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface Case { id: string; request: string; artifacts: Record<string, string> }
interface Criterion { id: string; requirement: string }
interface RubricCase { id: string; criteria: Criterion[] }
interface Score { id: string; outcome: 'pass' | 'fail' | 'inconclusive'; quote: string; reason: string }
interface Judgment { evaluator: string; model: string; cases: { id: string; scores: Score[] }[] }
interface Responses { evaluator: string; model: string; answers: Record<string, string> }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const save = async (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function sameIds(actual: string[], expected: string[], context: string) {
  requireValue(actual.length === new Set(actual).size, `${context}: 중복 id`);
  requireValue(JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()), `${context}: id 누락 또는 알 수 없는 id`);
}
async function filesBelow(root: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    requireValue(!entry.isSymbolicLink(), `평가 사본에 심볼릭 링크를 넣지 않는다: ${path}`);
    if (entry.isDirectory()) files.push(...await filesBelow(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

export async function prepare(skillDir: string, usageFile: string, out: string) {
  const cases = await json<{ version: number; cases: Case[] }>(join(skillDir, 'evals/cases.json'));
  const rubric = await json<{ version: number; cases: RubricCase[] }>(join(skillDir, 'evals/rubric.json'));
  requireValue(cases.version === 1 && rubric.version === 1, '지원하지 않는 평가 형식');
  sameIds(cases.cases.map(c => c.id), rubric.cases.map(c => c.id), '사례와 채점표');
  requireValue(cases.cases.length > 0, '사례가 비어 있다');
  for (const entry of rubric.cases) {
    requireValue(entry.criteria.length > 0, `채점 기준이 비어 있다: ${entry.id}`);
    sameIds(entry.criteria.map(c => c.id), entry.criteria.map(c => c.id), entry.id);
  }
  // 기존 실행 결과를 덮어쓰지 않으며 정답은 input 밖에 둔다.
  await mkdir(out);
  await mkdir(join(out, 'input/skill/references'), { recursive: true });
  await mkdir(join(out, 'judge'));
  await copyFile(join(skillDir, 'SKILL.md'), join(out, 'input/skill/SKILL.md'));
  for (const file of await filesBelow(join(skillDir, 'references'))) {
    const dest = join(out, 'input/skill/references', file);
    await mkdir(resolve(dest, '..'), { recursive: true });
    await copyFile(join(skillDir, 'references', file), dest);
  }
  await copyFile(usageFile, join(out, 'input/USAGE.md'));
  await save(join(out, 'input/cases.json'), cases);
  await save(join(out, 'judge/rubric.json'), rubric);
  await writeFile(join(out, 'input/TASK.md'), `# 생성 전 판단 평가\n\nskill/SKILL.md와 관련 references, USAGE.md를 적용하여 cases.json의 각 요청에 독립적으로 답한다. 원자료는 각 artifacts다. 실제 제작 직전에 내릴 판단과 다음 작업을 간결하되 구체적으로 쓴다. 문제가 없는 항목을 모두 나열할 필요는 없다.\n\n이 실행은 읽기 전용 모의 평가다. 이미지 생성, 파일 변경, 사이트 실행, 외부 조회는 하지 않는다. 첨부되지 않은 그림을 봤거나 실행하지 않은 검사를 마쳤다고 하지 않는다. input 밖의 채점표·이전 응답은 읽지 않는다. 테스트 자료를 실제 캐릭터 정본으로 기록하지 않는다.\n\n최종 응답 형식은 {"evaluator":"실행 식별자","model":"실제 모델","answers":{"사례 id":"응답"}}이다.\n`);
  const hashes: Record<string, string> = {};
  for (const file of [...(await filesBelow(join(out, 'input'))).map(p => join('input', p)), 'judge/rubric.json']) {
    hashes[file] = hash(await readFile(join(out, file)));
  }
  await save(join(out, 'manifest.json'), { version: 1, createdAt: new Date().toISOString(), scope: 'text-decision-only', hashes });
  return { cases: cases.cases.length, input: join(out, 'input'), judge: join(out, 'judge') };
}

export async function check(out: string) {
  const manifest = await json<{ version: number; hashes: Record<string, string> }>(join(out, 'manifest.json'));
  requireValue(manifest.version === 1, '지원하지 않는 실행 기록');
  const paths = Object.keys(manifest.hashes);
  requireValue(paths.includes('input/cases.json') && paths.includes('judge/rubric.json'), '입력 해시 누락');
  for (const [file, expected] of Object.entries(manifest.hashes)) {
    requireValue(!file.includes('..') && !file.startsWith('/'), '실행 폴더 밖의 경로');
    requireValue(hash(await readFile(join(out, file))) === expected, `평가 입력 변경: ${file}`);
  }
  sameIds((await filesBelow(join(out, 'input'))).map(p => join('input', p)), paths.filter(p => p.startsWith('input/')), '입력 파일');
  const rubric = await json<{ cases: RubricCase[] }>(join(out, 'judge/rubric.json'));
  const responses = await json<Responses>(join(out, 'responses.json'));
  const judgment = await json<Judgment>(join(out, 'judgment.json'));
  requireValue(responses.evaluator && responses.model && judgment.evaluator && judgment.model, '실행자와 모델을 기록한다');
  requireValue(responses.evaluator !== judgment.evaluator, '응답자와 검토자를 구분한다');
  sameIds(Object.keys(responses.answers), rubric.cases.map(c => c.id), '응답');
  sameIds(judgment.cases.map(c => c.id), rubric.cases.map(c => c.id), '평가');
  const counts = { pass: 0, fail: 0, inconclusive: 0 };
  for (const expected of rubric.cases) {
    const answer = responses.answers[expected.id];
    requireValue(typeof answer === 'string' && answer.trim().length > 0, `빈 응답: ${expected.id}`);
    const scores = judgment.cases.find(c => c.id === expected.id)!.scores;
    sameIds(scores.map(s => s.id), expected.criteria.map(c => c.id), expected.id);
    for (const score of scores) {
      requireValue(['pass', 'fail', 'inconclusive'].includes(score.outcome), `잘못된 판정: ${score.id}`);
      requireValue(typeof score.quote === 'string' && score.quote.trim().length > 0 && answer.includes(score.quote), `응답에 없는 인용: ${score.id}`);
      requireValue(typeof score.reason === 'string' && score.reason.trim().length > 0, `판정 이유 누락: ${score.id}`);
      counts[score.outcome]++;
    }
  }
  // 인용의 의미와 합격 여부는 독립 검토자가 판단한다. 이 함수는 기록의 완결성만 검사한다.
  return { scope: 'text-decision-only', cases: rubric.cases.length, criteria: counts, exitCode: counts.fail ? 1 : counts.inconclusive ? 2 : 0 };
}

if (import.meta.main) {
  try {
    const [command, first, second] = process.argv.slice(2);
    if (command === 'prepare' && first && second) {
      const repo = resolve(first), skill = join(repo, '.agents/skills/character-story');
      const library = execFileSync('python3', [join(skill, 'scripts/locate-library.py'), '--repo', repo], { encoding: 'utf8' }).trim();
      console.log(JSON.stringify(await prepare(skill, join(library, 'USAGE.md'), resolve(second)), null, 2));
    } else if (command === 'check' && first && !second) {
      const result = await check(resolve(first));
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.exitCode;
    } else {
      throw new Error('사용법: node .codex/evals/character-story.ts prepare <repo> <새 실행 폴더> | check <실행 폴더>');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
