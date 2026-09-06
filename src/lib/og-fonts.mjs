import fs from 'node:fs/promises';
import path from 'node:path';
import { projectPaths } from './get-garden.mjs';

// OG 이미지용 정적 폰트. 빌드 때 한 번 받아 node_modules/.cache에 둔다(저장소에 넣기엔 9MB라 크다).
const FONTS = [
  { file: 'NotoSerifKR-Bold.otf', url: 'https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf' },
  { file: 'Pretendard-Medium.otf', url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf' }
];
// 빌드 번들 위치가 아니라 프로젝트 루트 기준으로 캐시한다.
const cacheDir = path.join(projectPaths().projectRoot, 'node_modules', '.cache', 'garden-og-fonts');

export async function ensureOgFonts() {
  await fs.mkdir(cacheDir, { recursive: true });
  const paths = [];
  for (const { file, url } of FONTS) {
    const target = path.join(cacheDir, file);
    try { await fs.access(target); paths.push(target); continue; } catch {}
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
      paths.push(target);
    } catch (error) {
      console.warn(`OG 폰트를 받지 못했습니다(${file}): ${error.message}. 시스템 폰트로 대신 그립니다.`);
      return null;
    }
  }
  return paths;
}
