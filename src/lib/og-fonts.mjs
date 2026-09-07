import fs from 'node:fs/promises';
import path from 'node:path';
import { projectPaths } from './get-garden.mjs';

// OG 이미지용 정적 폰트. 빌드 때 한 번 받아 node_modules/.cache에 둔다(저장소에 넣기엔 10MB라 크다).
// Gowun Batang은 정적 Bold가 있어 사이트 제목과 같은 굵기로 그려진다(가변 폰트는 resvg가 굵기 축을 무시한다).
const FONTS = [
  { file: 'GowunBatang-Bold.ttf', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang/GowunBatang-Bold.ttf' },
  { file: 'Pretendard-Medium.otf', url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf' }
];
// 빌드 번들 위치가 아니라 프로젝트 루트 기준으로 캐시한다.
const cacheDir = path.join(projectPaths().projectRoot, 'node_modules', '.cache', 'garden-og-fonts');
const MIN_FONT_BYTES = 200_000; // 둘 다 이보다 훨씬 크다. 잘린 파일을 걸러내는 하한.
const ATTEMPTS = 3;

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < MIN_FONT_BYTES) throw new Error(`잘린 응답 ${buffer.length}B ${url}`);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

// 폰트 파일 경로 목록. 받지 못하면 로컬에서는 null(시스템 폰트 폴백), CI에서는 실패로 빌드를 멈춘다.
export async function ensureOgFonts() {
  await fs.mkdir(cacheDir, { recursive: true });
  const paths = [];
  for (const { file, url } of FONTS) {
    const target = path.join(cacheDir, file);
    const stat = await fs.stat(target).catch(() => null);
    if (stat && stat.size >= MIN_FONT_BYTES) { paths.push(target); continue; }
    try {
      const buffer = await download(url);
      const tmp = `${target}.${process.pid}.tmp`; // 잘린 파일이 캐시로 남지 않게 임시 파일에 쓰고 바꾼다.
      await fs.writeFile(tmp, buffer);
      await fs.rename(tmp, target);
      paths.push(target);
    } catch (error) {
      const message = `OG 폰트를 받지 못했습니다(${file}): ${error.message}.`;
      if (process.env.CI) throw new Error(`${message} CI에서는 시스템 폰트로 대신 그리지 않고 빌드를 멈춥니다.`);
      console.warn(`${message} 시스템 폰트로 대신 그립니다(캐시하지 않음).`);
      return null;
    }
  }
  return paths;
}
