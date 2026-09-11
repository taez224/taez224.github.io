import fs from 'node:fs/promises';
import path from 'node:path';

// vault 파일을 찾고 frontmatter를 읽는다. 조립 단계와 책 로딩이 함께 쓰므로 garden.mjs를 import하지 않는다.
export const normalize = (value) => value.replace(/\\/g, '/').replace(/^\.\//, '');

export const isMarkdown = (name) => name.endsWith('.md');

async function walk(directory, accept = () => true) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, accept));
    else if (entry.isFile() && accept(entry.name)) files.push(absolute);
  }
  return files;
}

// 폴더 자체가 없을 때만 null을 돌려준다. 권한 오류나 파일을 폴더로 잘못 적은 경우까지 건너뛰면
// 하위 폴더 하나 때문에 공개 폴더 전체가 조용히 사이트에서 빠진다.
export async function walkIfPresent(directory, accept) {
  try {
    return await walk(directory, accept);
  } catch (error) {
    if (error.code === 'ENOENT' && error.path === directory) return null;
    throw error;
  }
}

export function parseFrontmatter(source) {
  if (!source.startsWith('---')) return { body: source, meta: {} };
  const end = source.indexOf('\n---', 3);
  if (end < 0) return { body: source, meta: {} };

  const frontmatter = source.slice(3, end).replace(/^\n/, '');
  const meta = {};
  let activeListKey = null;
  const parseValue = (rawValue) => {
    const value = String(rawValue ?? '').trim();
    if (value === 'null' || value === '~') return null;
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    return quoted ? quoted[2] : value;
  };
  for (const line of frontmatter.split('\n')) {
    const listItem = line.match(/^\s*-\s*(.*?)\s*$/);
    if (activeListKey && listItem) {
      meta[activeListKey] ??= [];
      const value = parseValue(listItem[1]);
      if (value !== null && value !== '') meta[activeListKey].push(value);
      continue;
    }
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    if (rawValue.trim() === '') {
      activeListKey = key;
      meta[key] = [];
      continue;
    }
    activeListKey = null;
    meta[key] = parseValue(rawValue);
  }
  return { body: source.slice(end + 4), meta };
}

// frontmatter의 tags. 목록이 아니면 빈 배열로 본다.
export function tagList(meta) {
  return Array.isArray(meta.tags) ? meta.tags : [];
}

export function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function stringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}
