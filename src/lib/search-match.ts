export interface SearchRecord { title: string; aliases?: string[]; summary?: string; tags?: string[]; headings?: string[]; text?: string; url: string; label: string }

// 한 번에 보여 주는 결과 수. 더 보기를 누르면 이만큼씩 늘어난다.
export const SEARCH_PAGE = 30;

// 자른 결과를 결과가 없는 것으로 오해하지 않도록, 전체 개수와 지금 보이는 개수를 함께 알린다.
export function resultCountLabel(total: number, shown: number): string {
  return shown < total ? `검색 결과 ${total}개 중 ${shown}개 표시` : `검색 결과 ${total}개`;
}

export function normalizeQuery(query: unknown): string[] {
  return String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchRecord(record: SearchRecord, terms: readonly string[]): { score: number; snippet: string } | null {
  if (!terms.length) return null;
  const fields = {
    title: record.title.toLowerCase(),
    aliases: (record.aliases ?? []).join(' ').toLowerCase(),
    summary: (record.summary ?? '').toLowerCase(),
    tags: (record.tags ?? []).join(' ').toLowerCase(),
    headings: (record.headings ?? []).join(' ').toLowerCase(),
    text: (record.text ?? '').toLowerCase()
  };
  const priorities: [keyof typeof fields, number][] = [
    ['title', 8],
    ['aliases', 6],
    ['summary', 4],
    ['headings', 4],
    ['tags', 3],
    ['text', 1]
  ];
  const phraseBonuses = {
    title: 10,
    aliases: 8,
    summary: 6,
    headings: 6,
    tags: 4,
    text: 2
  };
  let score = 0;
  let cut: { source: string; at: number; length: number } | null = null;
  for (const term of terms) {
    const match = priorities.find(([field]) => fields[field].includes(term));
    if (!match) return null;
    score += match[1];
    // priorities는 점수를 매기려고 먼저 걸린 필드 하나만 돌려준다. 그 값만 보면 요약에 있는 말은 본문에서도 찾지 않아
    // 잘라 보일 줄이 만들어지지 않고, 결과 줄에 요약 전체가 앞에서부터 잘린 채 남는다. 그래서 자를 자리는 따로 찾는다.
    // 요약과 본문만 본다. 제목·별칭·태그는 결과 줄에 이미 보이거나 짧아서 자를 것이 없다.
    if (!cut) {
      for (const field of ['summary', 'text'] as const) {
        const at = fields[field].indexOf(term);
        if (at >= 0) { cut = { source: record[field] ?? '', at, length: term.length }; break; }
      }
    }
  }
  if (terms.length > 1) {
    const phrase = terms.join(' ');
    const phraseMatch = priorities.find(([field]) => fields[field].includes(phrase));
    if (phraseMatch) score += phraseBonuses[phraseMatch[0]];
  }
  return { score, snippet: cut ? excerpt(cut.source, cut.at, cut.length) : '' };
}

// 결과 줄은 두 줄까지 보이는데, 한 줄에 드는 글자 수는 화면 폭과 글자 크기에 따라 다르다.
// 320px에서 글자를 두 배로 키우면 한 줄이 일곱 자 남짓이고, 한국어는 단어째 줄을 바꾸므로 앞 문맥을 글자 수로
// 정하면 찾은 말이 셋째 줄로 밀려 숨는다. 그래서 앞 문맥은 찾은 말 앞 단어 하나까지만 두고, 그 단어가
// SNIPPET_LEAD보다 길면 찾은 말이 든 단어부터 보인다. 줄은 뒤 문맥으로 채운다.
const SNIPPET_LEAD = 8;
const SNIPPET_TRAIL = 80;
function excerpt(source: string, at: number, length: number): string {
  const wordStart = (index: number) => { let i = index; while (i > 0 && !/\s/.test(source[i - 1]!)) i -= 1; return i; };
  const own = wordStart(at);
  const previous = own > 0 ? wordStart(own - 1) : own;
  let start = at - previous <= SNIPPET_LEAD ? previous : own;
  // 찾은 말이 긴 단어 한가운데에 있으면 단어 첫머리를 포기하고 그 자리에서 시작한다.
  if (at - start > SNIPPET_LEAD) start = at;
  const end = Math.min(source.length, at + length + SNIPPET_TRAIL);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
}

// 결과 줄에서 찾은 말에 표시를 남긴다. 조각을 그대로 HTML로 쓰면 원문이 태그가 되므로,
// 문자열 대신 조각 목록을 돌려주어 부르는 쪽이 조각마다 이스케이프하게 한다.
export function highlightParts(text: string, terms: readonly string[]): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (!term) continue;
    for (let at = lower.indexOf(term); at >= 0; at = lower.indexOf(term, at + term.length)) {
      for (let i = at; i < at + term.length; i += 1) marked[i] = true;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marked[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marked[i] });
  }
  return parts;
}
