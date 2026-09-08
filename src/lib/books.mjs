// 책장에 보여줄 읽기 상태와 그 순서. 읽은 책이 먼저 온다.
// 상태 값 자체는 _property-schema.md의 book 속성을 따르고, 여기 없는 값이 들어오면 뒤에 붙인다.
const STATUS_ORDER = ['완독', '읽는 중', '중단'];
// 아직 펴지 않은 책은 책장의 거르개에 두지 않는다.
const NOT_ON_SHELF = new Set(['예정']);

// 책장 위의 상태 거르개. 실제로 쓰인 상태만 권수와 함께 돌려준다.
export function statusFilters(books) {
  const counts = new Map();
  for (const book of books) {
    const status = String(book.status ?? '').trim();
    if (status && !NOT_ON_SHELF.has(status)) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const known = STATUS_ORDER.filter((status) => counts.has(status));
  const unknown = [...counts.keys()]
    .filter((status) => !STATUS_ORDER.includes(status))
    .sort((left, right) => left.localeCompare(right, 'ko'));
  return [
    { value: 'all', label: '전체', count: books.length },
    ...[...known, ...unknown].map((status) => ({ value: status, label: status, count: counts.get(status) }))
  ];
}
