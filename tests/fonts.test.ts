import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fontsCss = readFileSync(join(root, 'src/styles/fonts.css'), 'utf8');
const urls = [...fontsCss.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
const families = readdirSync(join(root, 'public/fonts'));

test('every self-hosted font face points to a woff2 file in public/fonts', () => {
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^\/fonts\/[\w-]+\/[\w.-]+\.woff2$/, url);
    assert.ok(existsSync(join(root, 'public', url)), url);
  }
});

test('public/fonts holds only referenced woff2 files and each family license', () => {
  const referenced = new Set(urls);
  for (const family of families) {
    const files = readdirSync(join(root, 'public/fonts', family));
    assert.ok(files.includes('LICENSE.txt'), `${family} LICENSE.txt`);
    for (const file of files.filter((name) => name !== 'LICENSE.txt')) assert.ok(referenced.has(`/fonts/${family}/${file}`), `참조되지 않는 파일 ${family}/${file}`);
  }
});

test('the site shell no longer loads font stylesheets from other origins', () => {
  const shell = readFileSync(join(root, 'src/layouts/Shell.astro'), 'utf8');
  assert.doesNotMatch(shell, /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net/);
});
