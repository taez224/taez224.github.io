// 공개 본문 전체의 조립 결과를 파일에 저장했다가, 파이프라인을 고친 뒤 같은 입력으로 다시 조립해 바이트 단위로 견준다.
// Markdown 렌더러·본문 정리·목차·검색 텍스트·링크 해석을 손보거나 markdown-it·sanitize-html을 올릴 때의 회귀 검사다.
// 실제 vault를 읽기 전용으로 읽으며 자동 테스트가 아니다. 단위 테스트는 임시 입력으로 따로 둔다.
//
//   npm run snapshot:markdown -- write [파일]     고치기 전에 저장한다
//   npm run snapshot:markdown -- verify [파일]    고친 뒤 견준다. 차이가 있으면 첫 지점을 노트마다 보이고 종료 코드 1이다
//
// 기본 파일은 node_modules/.cache/markdown-snapshot.json이다. 입력이 달라지면(vault가 바뀌면) 대조가 뜻을 잃으므로
// 노트 원문과 설정의 해시를 저장한다. 입력 불일치는 종료 코드 2로 알려 전체 동일 판정을 막는다.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assembleGarden, type GardenConfig } from '../src/lib/garden.ts';

const projectRoot = process.env.GARDEN_PROJECT_ROOT ?? process.cwd();
const vaultRoot = path.resolve(projectRoot, process.env.GARDEN_VAULT_ROOT ?? '../obsidian');
const configSource = readFileSync(path.join(projectRoot, 'config.json'), 'utf8');
const config = JSON.parse(configSource) as GardenConfig;
const configHash = createHash('sha256').update(configSource).digest('hex');
const [, , mode, fileArgument] = process.argv;
const snapshotPath = fileArgument ?? path.join(projectRoot, 'node_modules/.cache/markdown-snapshot.json');
if (mode !== 'write' && mode !== 'verify') {
  console.error('사용법: npm run snapshot:markdown -- write|verify [파일]');
  process.exit(2);
}

interface NoteSnapshot {
  sourceHash: string;
  bodyHtml: string;
  articleCards: unknown;
  headings: unknown;
  bodyText: string;
  summary: string;
  outgoing: string[];
  incoming: string[];
}
interface Snapshot { version: 1; configHash: string; createdAt: string; notes: Record<string, NoteSnapshot>; edges: unknown }

const garden = await assembleGarden({ vaultRoot, config });
const current: Snapshot = { version: 1, configHash, createdAt: new Date().toISOString(), notes: {}, edges: garden.edges };
for (const note of garden.notes) {
  const source = readFileSync(path.join(vaultRoot, note.path), 'utf8');
  current.notes[note.path] = {
    sourceHash: createHash('sha256').update(source).digest('hex').slice(0, 16),
    bodyHtml: note.bodyHtml,
    articleCards: note.articleCards,
    headings: note.headings,
    bodyText: note.bodyText,
    summary: note.summary,
    outgoing: [...note.outgoing].sort(),
    incoming: [...note.incoming].sort()
  };
}

if (mode === 'write') {
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(current, null, 1));
  console.log(`노트 ${Object.keys(current.notes).length}편을 저장했다: ${snapshotPath}`);
  process.exit(0);
}

// 첫 차이 지점 앞뒤를 잘라 보여 준다. 긴 본문에서 diff 도구 없이도 어디가 다른지 읽을 수 있게 한다.
function firstDifference(a: string, b: string, context = 80): string {
  let offset = 0;
  while (offset < a.length && offset < b.length && a[offset] === b[offset]) offset += 1;
  const start = Math.max(0, offset - context);
  return `offset ${offset}\n    저장본: ${JSON.stringify(a.slice(start, offset + context))}\n    현재:   ${JSON.stringify(b.slice(start, offset + context))}`;
}

const saved = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot;
if (saved.version !== 1 || saved.configHash !== current.configHash) {
  console.error('비교 조건 불일치: 스냅샷 형식 또는 config.json이 다르다. 변경 전 코드와 같은 설정으로 기준본을 다시 만든다.');
  process.exit(2);
}
const changedInput: string[] = [];
const problems: string[] = [];
for (const [key, before] of Object.entries(saved.notes)) {
  const after = current.notes[key];
  if (!after) { problems.push(`- ${key}: 현재 조립에 없다`); continue; }
  if (before.sourceHash !== after.sourceHash) { changedInput.push(key); continue; }
  const fields: (keyof NoteSnapshot)[] = ['bodyHtml', 'articleCards', 'headings', 'bodyText', 'summary', 'outgoing', 'incoming'];
  for (const field of fields) {
    const a = typeof before[field] === 'string' ? before[field] as string : JSON.stringify(before[field]);
    const b = typeof after[field] === 'string' ? after[field] as string : JSON.stringify(after[field]);
    if (a !== b) problems.push(`- ${key} · ${field}: ${firstDifference(a, b)}`);
  }
}
for (const key of Object.keys(current.notes)) if (!saved.notes[key]) problems.push(`- ${key}: 저장본에 없다(새 노트이거나 공개 범위가 바뀜)`);
if (JSON.stringify(saved.edges) !== JSON.stringify(current.edges)) problems.push('- 그래프 간선이 다르다');

console.log(`저장본 ${saved.createdAt} (${Object.keys(saved.notes).length}편) 대 현재 ${Object.keys(current.notes).length}편`);
if (changedInput.length) console.log(`원문이 바뀌어 견주지 않은 노트 ${changedInput.length}편: ${changedInput.join(', ')}`);
if (problems.length) {
  console.log(`차이 ${problems.length}건`);
  console.log(problems.join('\n'));
  process.exit(1);
}
if (changedInput.length) {
  console.error('비교 조건 불일치: 원문이 바뀐 노트가 있어 전체 동일 여부를 확인하지 못했다.');
  process.exit(2);
}
console.log('차이 없음');
