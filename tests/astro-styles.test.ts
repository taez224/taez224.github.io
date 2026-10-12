import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const astroFiles = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(join(root, path)).isDirectory()) return astroFiles(path);
  return name.endsWith('.astro') ? [path] : [];
});

// is:global 블록에서는 Astro가 :global()을 풀지 않는다. 그대로 남은 :global()은 브라우저가 모르는 선택자라 규칙 전체가 버려진다.
// 목차 버튼 아이콘 규칙이 이렇게 버려진 채 배포됐는데, 크기가 SVG 속성과 같아 화면으로는 드러나지 않았다.
test('global style blocks do not wrap selectors in :global()', () => {
  const found = astroFiles('src').flatMap((path) => [...readFileSync(join(root, path), 'utf8').matchAll(/<style is:global[^>]*>([\s\S]*?)<\/style>/g)]
    .flatMap((block) => block[1].replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => line.includes(':global(')).map((line) => `${path}: ${line.trim().slice(0, 80)}`)));
  assert.deepEqual(found, []);
});
