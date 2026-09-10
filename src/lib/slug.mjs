import { KINDS } from './kinds.mjs';

const SLUG_PATTERN = /^[\p{L}\p{N}-]+$/u;

export function slugify(title) {
  return String(title ?? '')
    .normalize('NFC')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

// 값이 있을 때만 frontmatter slug를 쓴다. 템플릿이 빈 slug를 달고 나오므로 키가 있다는 이유로 막으면
// 채우지 않은 노트 하나가 사이트 전체 빌드를 멈춘다. 빈 값·null·값 없는 키는 제목에서 만든 슬러그로 넘어가고,
// 오타처럼 값이 있는데 규칙을 어긴 것만 빌드를 세운다. String(null)이 "null"이 되어 /dev/null/로 나가던 것도 여기서 막힌다.
export function slugFor(meta, title) {
  const candidate = meta?.slug === undefined || meta.slug === null ? '' : String(meta.slug).trim();
  if (candidate) {
    if (!SLUG_PATTERN.test(candidate)) throw new Error(`Invalid frontmatter slug "${candidate}" for "${title}"`);
    return candidate;
  }
  const slug = slugify(title);
  if (!slug) throw new Error(`Cannot derive a slug from title "${title}"`);
  return slug;
}

export function kindPrefix(kind) {
  const prefix = KINDS[kind]?.prefix;
  if (!prefix) throw new Error(`Unknown note kind: ${kind}`);
  return prefix;
}

export function noteUrl(basePath, kind, slug, fragment = '') {
  const base = String(basePath ?? '').replace(/\/$/, '');
  const url = `${base}/${kindPrefix(kind)}/${slug}/`;
  return fragment ? `${url}#${fragment}` : url;
}

export function assertUniqueSlugs(entries) {
  const seen = new Map();
  for (const entry of entries) {
    const key = `${entry.kind}/${entry.slug}`;
    if (seen.has(key)) throw new Error(`Slug collision "${entry.slug}" (${entry.kind}):\n  ${seen.get(key)}\n  ${entry.path}\nAdd a frontmatter "slug" to one of them.`);
    seen.set(key, entry.path);
  }
}
