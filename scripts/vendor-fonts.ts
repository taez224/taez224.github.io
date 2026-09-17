// 사이트 글꼴을 저장소에 들여오는 스크립트다. 글꼴 버전을 올릴 때만 수동으로 실행한다(npm run fonts:vendor).
// 고정 버전 npm 패키지의 CSS를 jsDelivr에서 읽어 woff2 조각만 public/fonts/에 받고, 경로를 사이트 안으로 바꾼 src/styles/fonts.css를 만든다.
// 외부 CDN 스타일시트는 첫 렌더링을 막고 방문자 요청을 다른 출처로 보낸다. 브라우저 캐시가 사이트별로 나뉘어 CDN의 캐시 공유 이점도 없다.
// pretendard 패키지는 93MB라 의존성으로 두지 않고 필요한 파일만 받는다. 한국어 글꼴은 unicode-range 조각으로 나뉘어 있어
// 방문자는 페이지에 쓰인 글자의 조각만 받는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://cdn.jsdelivr.net/npm';
// fontsource의 400.css·700.css는 번호 조각을 가리킨다. korean-400.css는 한글 전체가 든 한 파일을 가리키므로 쓰지 않는다.
const FAMILIES = [
  { dir: 'pretendard', pkg: 'pretendard@1.3.9', css: ['dist/web/variable/pretendardvariable-dynamic-subset.css'], license: 'dist/LICENSE.txt' },
  { dir: 'gowun-batang', pkg: '@fontsource/gowun-batang@5.3.0', css: ['400.css', '700.css'], license: 'LICENSE' }
];

async function get(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const faces: string[] = [];
for (const family of FAMILIES) {
  const outDir = path.join(projectRoot, 'public/fonts', family.dir);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const downloads = new Map<string, string>();
  for (const cssPath of family.css) {
    const cssUrl = `${CDN}/${family.pkg}/${cssPath}`;
    const css = (await get(cssUrl)).toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
      // fontsource는 woff2 뒤에 woff를 함께 적는다. 지원하는 모든 브라우저가 woff2를 읽으므로 woff2만 가져온다.
      const src = block.match(/url\(([^)]+?\.woff2)\)\s*format\(([^)]+)\)/);
      if (!src) throw new Error(`woff2가 없는 @font-face: ${cssUrl}`);
      const fileUrl = new URL(src[1].replace(/['"]/g, ''), cssUrl).href;
      const file = path.basename(new URL(fileUrl).pathname);
      downloads.set(file, fileUrl);
      const declarations = block.replace(/^@font-face\s*\{|\}$/g, '').split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('src'));
      faces.push(`@font-face { ${[...declarations, `src: url(/fonts/${family.dir}/${file}) format(${src[2]})`].join('; ')}; }`);
    }
  }
  const files = [...downloads];
  for (let i = 0; i < files.length; i += 16) {
    await Promise.all(files.slice(i, i + 16).map(async ([file, url]) => {
      const buffer = await get(url);
      if (buffer.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`woff2 파일이 아님: ${url}`);
      await fs.writeFile(path.join(outDir, file), buffer);
    }));
  }
  // 두 글꼴은 SIL Open Font License 1.1이다. 글꼴 파일을 배포할 때 라이선스 전문을 함께 둔다.
  await fs.writeFile(path.join(outDir, 'LICENSE.txt'), await get(`${CDN}/${family.pkg}/${family.license}`));
  console.log(`${family.dir}: 조각 ${files.length}개`);
}

const header = `/* scripts/vendor-fonts.ts가 만든 파일이다. 직접 고치지 말고 스크립트의 패키지 버전을 바꿔 다시 만든다.
   출처: ${FAMILIES.map((f) => f.pkg).join(', ')}. 두 글꼴 모두 SIL Open Font License 1.1이며 전문은 public/fonts/<글꼴>/LICENSE.txt에 있다. */\n`;
await fs.writeFile(path.join(projectRoot, 'src/styles/fonts.css'), `${header}${faces.join('\n')}\n`);
