export function normalizeQuery(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchRecord(record, terms) {
  if (!terms.length) return null;
  const fields = {
    title: record.title.toLowerCase(),
    aliases: (record.aliases ?? []).join(' ').toLowerCase(),
    summary: (record.summary ?? '').toLowerCase(),
    tags: (record.tags ?? []).join(' ').toLowerCase(),
    headings: (record.headings ?? []).join(' ').toLowerCase(),
    text: (record.text ?? '').toLowerCase()
  };
  const priorities = [
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
  let firstBodyIndex = -1;
  for (const term of terms) {
    const match = priorities.find(([field]) => fields[field].includes(term));
    if (!match) return null;
    score += match[1];
    if (match[0] === 'text' && firstBodyIndex < 0) firstBodyIndex = fields.text.indexOf(term);
  }
  if (terms.length > 1) {
    const phrase = terms.join(' ');
    const phraseMatch = priorities.find(([field]) => fields[field].includes(phrase));
    if (phraseMatch) score += phraseBonuses[phraseMatch[0]];
  }
  let snippet = '';
  if (firstBodyIndex >= 0) {
    const start = Math.max(0, firstBodyIndex - 40);
    const end = Math.min(record.text.length, firstBodyIndex + Math.max(...terms.map((term) => term.length)) + 40);
    snippet = `${start > 0 ? '…' : ''}${record.text.slice(start, end).trim()}${end < record.text.length ? '…' : ''}`;
  }
  return { score, snippet };
}
