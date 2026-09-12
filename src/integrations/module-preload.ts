import type { AstroIntegration } from 'astro';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Astro는 페이지 스크립트를 <script type="module">로 본문에 넣고, 그 스크립트가 import하는 청크(그래프 엔진 등)에는 preload를 달지 않는다.
// 브라우저는 스크립트를 받은 뒤에야 청크를 알게 되어 왕복이 한 번 더 생긴다. 빌드 산출물의 정적 import를 따라가 <link rel="modulepreload">를 넣는다.
// renderBlocking에 적은 경로(예: '/map/')는 페이지 스크립트를 <head>로 옮기고 blocking="render"를 달아, 그래프가 올라가기 전에는 첫 화면을 그리지 않게 한다.
// 지도는 무대 크기가 화면마다 달라 홈처럼 픽셀이 같은 스냅샷을 둘 수 없어서, 빈 상자가 한 프레임이라도 보이지 않도록 그리기 자체를 미룬다.
// Astro 소스의 <script>에 속성을 붙이면 번들되지 않으므로 산출물 단계에서 한다. 이 속성을 모르는 브라우저는 무시한다.

// 번들된 모듈 소스에서 상대 경로 정적 import·재수출을 뽑는다. 동적 import()는 제외한다.
export function staticImports(js: string): string[] {
  const pattern = /\b(?:import|export)\s*(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+\w+))?)?\s*(?:from\s*)?["'](\.{1,2}\/[^"']+)["']/g;
  return [...new Set([...js.matchAll(pattern)].map((match) => match[1]))];
}

// matches(src)가 참인 모듈 스크립트를 본문에서 빼 <head> 끝에 blocking="render"로 둔다. 모듈은 어차피 파싱이 끝난 뒤 실행되므로 위치를 옮겨도 동작은 같다.
export function withRenderBlocking(html: string, matches: (src: string) => boolean): string {
  const tags = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].filter((match) => matches(match[1]));
  if (!tags.length) return html;
  let out = html;
  for (const [tag] of tags) out = out.replace(tag, '');
  const moved = tags.map(([tag]) => tag.replace('<script type="module"', '<script type="module" blocking="render"')).join('');
  return out.replace('</head>', `${moved}</head>`);
}

export function withModulePreloads(html: string, hrefs: readonly string[]): string {
  const unique = [...new Set(hrefs)];
  if (!unique.length) return html;
  const links = unique.map((href) => `<link rel="modulepreload" href="${href}">`).join('');
  const at = html.indexOf('<script type="module"');
  return at >= 0 ? `${html.slice(0, at)}${links}${html.slice(at)}` : html.replace('</head>', `${links}</head>`);
}

async function walkHtml(directory: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await walkHtml(absolute));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(absolute);
  }
  return out;
}

// 스크립트 URL에서 출발해 청크를 재귀로 모은다. 결과는 진입 스크립트를 뺀 URL 목록.
async function dependencyUrls(outputDir: string, entryUrls: string[], cache: Map<string, Promise<string[]>>): Promise<string[]> {
  const seen = new Set(entryUrls), order: string[] = [];
  const visit = async (url: string): Promise<void> => {
    if (!cache.has(url)) cache.set(url, fs.readFile(path.join(outputDir, url), 'utf8').then(staticImports, () => []));
    for (const relative of await cache.get(url)!) {
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(url), relative));
      if (seen.has(next)) continue;
      seen.add(next); order.push(next);
      await visit(next);
    }
  };
  for (const url of entryUrls) await visit(url);
  return order;
}

export default function modulePreload({ renderBlocking = [] }: { renderBlocking?: string[] } = {}): AstroIntegration {
  const blockingFiles = new Set(renderBlocking.map((route) => path.join(route.replace(/^\//, ''), 'index.html')));
  return {
    name: 'module-preload',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outputDir = fileURLToPath(dir);
        const cache = new Map<string, Promise<string[]>>();
        let pages = 0;
        for (const file of await walkHtml(outputDir)) {
          const html = await fs.readFile(file, 'utf8');
          const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((match) => match[1]).filter((src) => src.startsWith('/'));
          const urls = await dependencyUrls(outputDir, entries, cache);
          let next = withModulePreloads(html, urls);
          // 페이지 스크립트는 <page>.astro_astro_type_script_… 이름으로 나온다. 컴포넌트 스크립트(검색 대화상자 등)는 그대로 둔다.
          if (blockingFiles.has(path.relative(outputDir, file))) next = withRenderBlocking(next, (src) => /\.astro_astro_type_script/.test(src) && !/SearchDialog/.test(src));
          if (next === html) continue;
          await fs.writeFile(file, next);
          pages += 1;
        }
        logger.info(`module preloads added to ${pages} page(s)${blockingFiles.size ? `, render-blocking page script on ${[...blockingFiles].join(', ')}` : ''}`);
      }
    }
  };
}
