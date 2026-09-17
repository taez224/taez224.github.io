import type { Frontmatter } from './vault-files.ts';
import type { NoteKind } from './kinds.ts';

// text는 조립이 미리 뽑아 둔 본문 텍스트다. 없으면 여기서 뽑는다(테스트와 연재 절 요약).
interface BodyNote { meta: Frontmatter; publicContent: string; text?: TextAnalysis }
interface BodyHeading { start: number; end: number; level: number; text: string }

import { stripObsidianComments, structureParser } from './markdown.ts';
import { analyzeText, type TextAnalysis } from './text.ts';

// 사이트로 나가는 본문 사본과 거기서 계산하는 제목·목차·요약. vault 원문은 바꾸지 않는다.
export function firstHeading(body: string, fallback: string): string {
  const heading = body.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

// 본문 흐름의 제목 위치. 저자 전용 절의 범위와 연재 허브의 요약 절을 찾는 데 쓴다.
// 목차는 렌더러가 id를 매기면서 함께 모은다(markdown.ts의 renderMarkdown). 인용·콜아웃·목록 안의 제목(token.level > 0)은 세지 않는다.
function bodyHeadings(body: string): BodyHeading[] {
  const tokens = structureParser.parse(body, {});
  return tokens.flatMap((token, index) => token.type === 'heading_open' && token.level === 0
    ? [{ start: token.map![0], end: token.map![1], level: Number(token.tag.slice(1)), text: tokens[index + 1].content.trim() }]
    : []);
}

// 본문 발췌. 제목 줄과 코드 블록을 뺀 텍스트의 앞 220자다.
function excerpt(text: TextAnalysis): string {
  const cleaned = text.excerptText;
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 220).replace(/\s+\S*$/, '')}…`;
}

// 노트 한 편의 요약 규칙. 목록·카드·노트 엔트리가 모두 이 함수를 부른다.
// 외부 발행 글은 원문을 옮기지 않기로 했으므로 명시 요약만 쓰고, 없으면 요약을 비운다.
export function summaryFor(note: BodyNote, { kind = '', contentMode = 'full' }: { kind?: NoteKind | ''; contentMode?: 'full' | 'external' } = {}): string {
  const explicit = explicitSummary(note);
  if (contentMode === 'external') return explicit;
  const text = note.text ?? analyzeText(note.publicContent);
  if (kind === 'blog' && note.meta.type === 'series') return explicit || sectionExcerpt(note.publicContent, ['연재 목적', '시리즈 소개']) || excerpt(text);
  return explicit || excerpt(text);
}

export function explicitSummary(note: Pick<BodyNote, 'meta'>): string {
  return String(note.meta.summary ?? '').trim();
}

function sectionExcerpt(body: string, sectionNames: readonly string[]): string {
  const wanted = sectionNames.map((name) => name.toLowerCase());
  const headings = bodyHeadings(body).filter((heading) => heading.level <= 2);
  const index = headings.findIndex((heading) => heading.level === 2 && wanted.includes(heading.text.toLowerCase()));
  if (index < 0) return '';
  return excerpt(analyzeText(body.split('\n').slice(headings[index].end, headings[index + 1]?.start).join('\n')));
}

function stripLeadingTitle(body: string): string {
  return String(body ?? '').replace(/^\s*#\s+.+(?:\r?\n){1,2}/, '');
}

// 저자만 보는 절. vault 원문은 그대로 두고 사이트로 나가는 사본에서만 제목과 그 아래 내용을 뺀다.
// 연재 허브의 "운영 메모"가 frontmatter·정본 같은 작업 용어를 독자에게 보여주고 있었다. 절 이름을 여기 늘리면 함께 빠진다.
const AUTHOR_ONLY_SECTIONS = ['운영 메모'];
// 절의 끝은 다음 헤딩이다. 코드 블록 안의 `# 주석` 줄은 헤딩이 아니므로 펜스 안에서는 헤딩을 보지 않는다.
function stripAuthorSections(body: string): string {
  const lines = body.split('\n'), kept: string[] = [];
  const headings = bodyHeadings(body);
  let start = 0;
  for (const [index, heading] of headings.entries()) {
    if (!AUTHOR_ONLY_SECTIONS.includes(heading.text)) continue;
    kept.push(...lines.slice(start, heading.start));
    start = headings[index + 1]?.start ?? lines.length;
  }
  return [...kept, ...lines.slice(start)].join('\n');
}

export function publicBody(body: string): string {
  return stripAuthorSections(stripLeadingTitle(stripObsidianComments(body)));
}
