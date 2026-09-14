import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { projectPaths } from './get-garden.ts';

// OG 이미지용 정적 폰트. 빌드 때 한 번 받아 node_modules/.cache에 둔다(저장소에 넣기엔 10MB라 크다).
// Gowun Batang은 정적 Bold가 있어 사이트 제목과 같은 굵기로 그려진다(가변 폰트는 resvg가 굵기 축을 무시한다).
const FONTS = [
  {
    'file': 'GowunBatang-Bold.ttf',
    'url': 'https://raw.githubusercontent.com/google/fonts/539f6c4bb51e9b328dd5826bcbf2fd9b1ce56e19/ofl/gowunbatang/GowunBatang-Bold.ttf',
    'sha256': 'dbfcaa646e5831e7478524924f02906f550285a5050699b4e38c9950b3ec4b94'
  },
  {
    'file': 'Pretendard-Medium.otf',
    'url': 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf',
    'sha256': 'd39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0'
  }
];
const MIN_FONT_BYTES = 200_000; // 둘 다 이보다 훨씬 크다. 잘린 파일을 걸러내는 하한.
const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

async function download(url: string, sha256: string, { fetch, wait }: { fetch: typeof globalThis.fetch; wait: (ms: number) => Promise<void> }): Promise<Buffer> {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < MIN_FONT_BYTES) throw new Error(`잘린 응답 ${buffer.length}B ${url}`);
      if (digest(buffer) !== sha256) throw new Error(`폰트 SHA-256 불일치: ${url}`);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await wait(1000 * attempt);
    }
  }
  throw lastError;
}

// 폰트 파일 경로 목록. 받지 못하면 로컬에서는 null(시스템 폰트 폴백), CI에서는 실패로 빌드를 멈춘다.
// 캐시는 빌드 번들 위치가 아니라 프로젝트 루트 기준이다. 테스트는 캐시 폴더·폰트 목록·네트워크·대기·CI 여부를 바꿔 넣는다.
export async function ensureOgFonts({
  cacheDir = path.join(projectPaths().projectRoot, 'node_modules', '.cache', 'garden-og-fonts'),
  fonts = FONTS,
  fetch = globalThis.fetch,
  wait = sleep,
  ci = Boolean(process.env.CI)
}: { cacheDir?: string; fonts?: { file: string; url: string; sha256: string }[]; fetch?: typeof globalThis.fetch; wait?: (ms: number) => Promise<void>; ci?: boolean } = {}): Promise<string[] | null> {
  await fs.mkdir(cacheDir, { recursive: true });
  const paths = [];
  for (const { file, url, sha256 } of fonts) {
    const target = path.join(cacheDir, file);
    const cached = await fs.readFile(target).catch(() => null);
    if (cached && cached.length >= MIN_FONT_BYTES && digest(cached) === sha256) { paths.push(target); continue; }
    // 이전 출처의 파일이나 손상된 캐시는 다시 사용하지 않는다.
    if (cached) await fs.rm(target);
    try {
      const buffer = await download(url, sha256, { fetch, wait });
      const tmp = `${target}.${process.pid}.tmp`; // 잘린 파일이 캐시로 남지 않게 임시 파일에 쓰고 바꾼다.
      await fs.writeFile(tmp, buffer);
      await fs.rename(tmp, target);
      paths.push(target);
    } catch (error) {
      const message = `OG 폰트를 받지 못했습니다(${file}): ${error instanceof Error ? error.message : String(error)}.`;
      if (ci) throw new Error(`${message} CI에서는 시스템 폰트로 대신 그리지 않고 빌드를 멈춥니다.`);
      console.warn(`${message} 시스템 폰트로 대신 그립니다(캐시하지 않음).`);
      return null;
    }
  }
  return paths;
}
