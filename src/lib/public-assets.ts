import type { PublicationConfig } from './publication.ts';
export interface ResolvedAsset { url: string; sourcePath?: string }

import fs from 'node:fs/promises';
import path from 'node:path';
import { BOOKS_PATH } from './books.ts';
import { isImagePath } from './image-types.ts';
import { indexByBasename } from './links.ts';
import { isExcluded } from './publication.ts';
import { normalize, walkIfPresent } from './vault-files.ts';

// 본문과 썸네일이 가리킬 수 있는 공개 자산. config.assets에 검토해 적은 파일과, 공개 폴더·Books 폴더 안의
// Markdown이 아닌 파일만 쓸 수 있다. 본문에 실제로 쓰인 자산만 copies에 모으고, vault-assets 통합이 dist로 복사한다.
// base는 사이트 주소의 앞부분(basePath)이다.
export async function createAssetResolver({ vaultRoot, config, base }: { vaultRoot: string; config: PublicationConfig; base: string }) {
  const publicPaths = new Set<string>();
  // General vault attachments are available only after explicit review.
  for (const asset of config.assets ?? []) {
    const info = await fs.stat(path.join(vaultRoot, asset));
    if (!info.isFile()) throw new Error(`Reviewed asset is not a file: ${asset}`);
    publicPaths.add(asset);
  }
  // 공개 폴더가 없으면 공개 후보를 읽는 단계가 이미 빌드를 멈춘다. 여기서 없을 수 있는 폴더는 Books뿐이다.
  for (const root of [...config.include.map((include) => include.path), BOOKS_PATH]) {
    for (const absoluteFile of (await walkIfPresent(path.join(vaultRoot, root))) ?? []) {
      const relativePath = normalize(path.relative(vaultRoot, absoluteFile));
      if (!relativePath.endsWith('.md') && !isExcluded(config, relativePath)) publicPaths.add(relativePath);
    }
  }
  const byBasename = indexByBasename(publicPaths);
  const copies = new Map<string, string>();

  function resolve(sourcePath: string, rawTarget: unknown, { copy = true } = {}): ResolvedAsset | null {
    const target = String(rawTarget ?? '').split('#')[0].trim();
    if (/^(?:https?:)?\/\//i.test(target)) return { url: target };
    if (!target || !isImagePath(target)) return null;
    const cleanTarget = target.replace(/^\//, '');
    const candidates = [
      normalize(path.posix.join(path.posix.dirname(sourcePath), cleanTarget)),
      normalize(cleanTarget)
    ];
    let assetPath = candidates.find((candidate) => publicPaths.has(candidate));
    if (!assetPath) {
      const matches = byBasename.get(path.posix.basename(cleanTarget).toLowerCase()) ?? [];
      if (matches.length === 1) assetPath = matches[0];
    }
    if (!assetPath) return null;
    const destination = `assets/vault/${assetPath.split('/').map(encodeURIComponent).join('/')}`;
    if (copy) copies.set(assetPath, destination);
    return { url: `${base}/${destination}`, sourcePath: assetPath };
  }

  return { resolve, copies };
}
