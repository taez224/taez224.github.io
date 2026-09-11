import path from 'node:path';
import { extractNoteTargets } from './markdown.mjs';
import { normalize } from './vault-files.mjs';

// 위키 링크를 vault 경로로 해석한다. 공개 여부는 판정하지 않고, 어느 경로 집합에서 찾을지는 부르는 쪽이 넘긴다.
function stripLinkTarget(rawTarget) {
  return rawTarget.split('|')[0].split('#')[0].trim().replace(/^!/, '');
}

// 같은 열쇠에 값을 모은다. 붙일 때마다 배열을 통째로 복사하지 않는다.
export function addTo(map, key, value) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

// 경로를 소문자 파일명으로 묶은 색인. 위키 링크가 폴더를 안 밝힐 때 후보를 찾는 데 쓴다.
export function indexByBasename(paths) {
  const index = new Map();
  for (const relativePath of paths) addTo(index, path.posix.basename(relativePath).toLowerCase(), relativePath);
  return index;
}

export function resolveTarget(sourcePath, rawTarget, byPath, byBasename, preferred = null) {
  const target = stripLinkTarget(rawTarget);
  if (!target || target.startsWith('http://') || target.startsWith('https://')) return null;
  const sourceDirectory = path.posix.dirname(sourcePath);
  const withExtension = target.endsWith('.md') ? target : `${target}.md`;
  const relativeCandidate = normalize(path.posix.join(sourceDirectory, withExtension));
  if (byPath.has(relativeCandidate)) return relativeCandidate;
  const rootCandidate = normalize(withExtension);
  if (byPath.has(rootCandidate)) return rootCandidate;
  const basename = path.posix.basename(withExtension).toLowerCase();
  const matches = byBasename.get(basename) ?? [];
  if (matches.length === 1) return matches[0];
  // 이름이 겹치면 공개 노트를 먼저 고른다. 같은 이름의 초안이 생겨도 공개 노트의 링크가 평문으로 떨어지지 않는다.
  const preferredMatches = preferred ? matches.filter((item) => preferred.has(item)) : [];
  return preferredMatches.length === 1 ? preferredMatches[0] : null;
}

export function noteTargets(body, related = []) {
  const targets = new Set(extractNoteTargets(body));
  for (const value of Array.isArray(related) ? related : []) {
    const target = typeof value === 'string' ? value.trim().match(/^\[\[([^\]\n]+)\]\]$/)?.[1] : null;
    if (target) targets.add(target);
  }
  return [...targets];
}

// 링크 문법은 한 번만 해석하고, 전체 공개 목록과 그래프 후보에 맞춰 각각 대상을 찾는다.
export function resolveTargets(sourcePath, targets, byPath, byBasename) {
  return [...new Set(targets.map((target) => resolveTarget(sourcePath, target, byPath, byBasename)).filter(Boolean))];
}
