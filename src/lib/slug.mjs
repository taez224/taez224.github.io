const SLUG_PATTERN = /^[\p{L}\p{N}-]+$/u;
const PREFIX = { blog: 'posts', slipbox: 'notes', development: 'dev' };

export function slugify(title) {
  return String(title ?? '')
    .normalize('NFC')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugFor(meta, title) {
  if (meta && meta.slug !== undefined) {
    const candidate = String(meta.slug).trim();
    if (!SLUG_PATTERN.test(candidate)) throw new Error(`Invalid frontmatter slug "${candidate}" for "${title}"`);
    return candidate;
  }
  const slug = slugify(title);
  if (!slug) throw new Error(`Cannot derive a slug from title "${title}"`);
  return slug;
}

export function kindPrefix(kind) {
  const prefix = PREFIX[kind];
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
