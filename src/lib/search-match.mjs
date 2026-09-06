export function normalizeQuery(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchRecord(record, terms) {
  if (!terms.length) return null;
  const fields = {
    title: record.title.toLowerCase(),
    summary: (record.summary ?? '').toLowerCase(),
    tags: (record.tags ?? []).join(' ').toLowerCase(),
    headings: (record.headings ?? []).join(' ').toLowerCase(),
    text: (record.text ?? '').toLowerCase()
  };
  let score = 0;
  let firstBodyIndex = -1;
  for (const term of terms) {
    if (fields.title.includes(term)) score += 3;
    else if (fields.summary.includes(term) || fields.tags.includes(term) || fields.headings.includes(term)) score += 2;
    else if (fields.text.includes(term)) { score += 1; if (firstBodyIndex < 0) firstBodyIndex = fields.text.indexOf(term); }
    else return null;
  }
  let snippet = '';
  if (firstBodyIndex >= 0) {
    const start = Math.max(0, firstBodyIndex - 40);
    const end = Math.min(record.text.length, firstBodyIndex + Math.max(...terms.map((term) => term.length)) + 40);
    snippet = `${start > 0 ? '…' : ''}${record.text.slice(start, end).trim()}${end < record.text.length ? '…' : ''}`;
  }
  return { score, snippet };
}
