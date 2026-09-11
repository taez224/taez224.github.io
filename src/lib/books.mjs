import fs from 'node:fs/promises';
import path from 'node:path';
import { dateOnly, newestFirst } from './dates.mjs';
import { firstHeading } from './note-body.mjs';
import { assertUniqueSlugs, slugify } from './slug.mjs';
import { isMarkdown, normalize, numberValue, parseFrontmatter, walkIfPresent } from './vault-files.mjs';

// 책 노트가 있는 vault 폴더. 조립 단계와 개발 서버 감시가 같은 경로를 쓴다.
export const BOOKS_PATH = '30_Resources/References/Books';

// 책장에 올릴 책. 평점 높은 순, 같으면 최근에 기록한 순이다. 파일 이름에서 만든 slug가 겹치면 빌드를 멈춘다.
// base는 사이트 주소의 앞부분(basePath)이다.
export async function readBooks({ vaultRoot, base }) {
  const files = await walkIfPresent(path.join(vaultRoot, BOOKS_PATH), isMarkdown);
  if (!files) console.warn('Skipped missing books directory');
  const books = [];
  for (const absoluteFile of files ?? []) {
    const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
    if (path.posix.basename(relativePath).startsWith('_')) continue;
    const source = await fs.readFile(absoluteFile, 'utf8');
    const parsed = parseFrontmatter(source);
    const rate = numberValue(parsed.meta.my_rate);
    const author = Array.isArray(parsed.meta.author)
      ? parsed.meta.author.join(', ')
      : String(parsed.meta.author ?? '');
    books.push({
      path: relativePath,
      fileTitle: path.posix.basename(relativePath, '.md'),
      title: String(parsed.meta.title ?? firstHeading(parsed.body, path.posix.basename(relativePath, '.md'))),
      slug: slugify(path.posix.basename(relativePath, '.md')),
      url: `${base}/books/#book-${slugify(path.posix.basename(relativePath, '.md'))}`,
      author,
      publisher: String(parsed.meta.publisher ?? ''),
      category: String(parsed.meta.category ?? ''),
      publishDate: String(parsed.meta.publish_date ?? ''),
      coverUrl: coverUrl(parsed.meta.cover_url),
      status: String(parsed.meta.status ?? ''),
      startDate: String(parsed.meta.start_read_date ?? ''),
      finishDate: String(parsed.meta.finish_read_date ?? ''),
      rate,
      tier: bookTier(rate),
      note: String(parsed.meta.book_note ?? ''),
      created: dateOnly(parsed.meta.created)
    });
  }
  const newestCreated = newestFirst((book) => book.created);
  books.sort((left, right) => right.rate - left.rate || newestCreated(left, right));
  assertUniqueSlugs(books.map((book) => ({ kind: 'book', slug: book.slug, path: book.path })));
  return books;
}

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

// 평점을 책장의 등급으로 바꾼다. 소수점은 버리고, 평점이 없으면 미분류다.
export function bookTier(rate) {
  return ({ 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D' })[Math.floor(rate)] ?? '미분류';
}

// 표지는 88x128 상자에 들어간다. yes24의 XL은 823x1200이라 화면에 쓰이는 것보다 스무 배 넓고 한 장에 90KB다.
// L(274x400)이면 2배 해상도까지 덮는다. 아는 형태가 아니면 그대로 둔다.
export function coverUrl(url) {
  return String(url ?? '').replace(/^(https?:\/\/image\.yes24\.com\/goods\/\d+\/)XL$/, '$1L');
}
