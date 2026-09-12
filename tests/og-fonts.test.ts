import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureOgFonts } from '../src/lib/og-fonts.ts';

// 캐시가 받아들이는 하한(200KB)을 넘는 가짜 폰트. 실제 폰트 서버에는 접속하지 않는다.
const FONT = Buffer.alloc(200_000, 1);
const fonts = [{ file: 'A.ttf', url: 'https://fonts.test/A.ttf' }, { file: 'B.otf', url: 'https://fonts.test/B.otf' }];
// 가짜 폰트가 테스트마다 수백 KB라 캐시 폴더를 한 폴더 아래에 만들고 실행이 끝나면 지운다.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-og-fonts-'));
after(() => fs.rm(root, { recursive: true, force: true }));
const makeCacheDir = () => fs.mkdtemp(path.join(root, 'cache-'));

// url마다 시도 순서대로 응답을 준다. 'ok'는 온전한 폰트, 'truncated'는 잘린 본문, 숫자는 HTTP 상태, Error는 네트워크 실패다.
function fakeFetch(plan: Record<string, (string | number | Error)[]>) {
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const next = plan[url]?.shift();
    if (next === undefined) throw new Error(`unexpected request ${url}`);
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response('', { status: next });
    return new Response(next === 'truncated' ? FONT.subarray(0, 1_000) : FONT);
  };
  return { fetch, calls };
}

const noWait = async () => {};

test('fonts already cached at full size are used without any download', async () => {
  const cacheDir = await makeCacheDir();
  for (const { file } of fonts) await fs.writeFile(path.join(cacheDir, file), FONT);
  const { fetch, calls } = fakeFetch({});
  assert.deepEqual(await ensureOgFonts({ cacheDir, fonts, fetch, wait: noWait, ci: false }), fonts.map(({ file }) => path.join(cacheDir, file)));
  assert.equal(calls.length, 0);
});

test('a truncated cached font is downloaded again and replaced as a whole file', async () => {
  const cacheDir = await makeCacheDir();
  await fs.writeFile(path.join(cacheDir, 'A.ttf'), 'partial');
  await fs.writeFile(path.join(cacheDir, 'B.otf'), FONT);
  const { fetch, calls } = fakeFetch({ 'https://fonts.test/A.ttf': ['ok'] });
  await ensureOgFonts({ cacheDir, fonts, fetch, wait: noWait, ci: false });
  assert.deepEqual(calls, ['https://fonts.test/A.ttf']);
  assert.equal((await fs.stat(path.join(cacheDir, 'A.ttf'))).size, FONT.length);
  assert.deepEqual((await fs.readdir(cacheDir)).sort(), ['A.ttf', 'B.otf'], '임시 파일이 남지 않는다');
});

test('an error status or a truncated response is retried with a growing wait', async () => {
  const cacheDir = await makeCacheDir();
  const { fetch, calls } = fakeFetch({ 'https://fonts.test/A.ttf': [503, 'truncated', 'ok'], 'https://fonts.test/B.otf': ['ok'] });
  const waits: number[] = [];
  const paths = await ensureOgFonts({ cacheDir, fonts, fetch, wait: async (ms) => { waits.push(ms); }, ci: false });
  assert.ok(paths, '재시도 끝에 두 폰트를 모두 받는다');
  assert.equal(paths.length, 2);
  assert.equal(calls.filter((url) => url.endsWith('A.ttf')).length, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal((await fs.stat(path.join(cacheDir, 'A.ttf'))).size, FONT.length, '잘린 응답은 캐시에 쓰지 않는다');
});

test('outside CI a font that cannot be downloaded falls back to system fonts and is not cached', async (t) => {
  const cacheDir = await makeCacheDir();
  const warn = t.mock.method(console, 'warn', () => {});
  const offline = new Error('offline');
  const { fetch } = fakeFetch({ 'https://fonts.test/A.ttf': ['ok'], 'https://fonts.test/B.otf': [offline, offline, offline] });
  assert.equal(await ensureOgFonts({ cacheDir, fonts, fetch, wait: noWait, ci: false }), null);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /B\.otf.*offline.*시스템 폰트/);
  assert.deepEqual(await fs.readdir(cacheDir), ['A.ttf'], '받지 못한 폰트는 캐시에 남기지 않는다');
});

test('in CI a font that cannot be downloaded stops the build', async () => {
  const cacheDir = await makeCacheDir();
  const { fetch } = fakeFetch({ 'https://fonts.test/A.ttf': [404, 404, 404] });
  await assert.rejects(ensureOgFonts({ cacheDir, fonts, fetch, wait: noWait, ci: true }), /A\.ttf.*404.*CI/);
});
