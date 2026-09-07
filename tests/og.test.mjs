import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-og-'));
process.env.GARDEN_OG_CACHE_DIR = dir;
const { cachedPng, pngDimensions, pruneOgCache, fitTitle } = await import('../src/lib/og.mjs');

// 서명 + IHDR만 있는 최소 PNG 헤더. 카드 검증은 폭·높이만 본다.
function fakePng(width = 1200, height = 630) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8); buffer.write('IHDR', 12, 'ascii'); buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
}

test('pngDimensions reads IHDR and rejects non-PNG or truncated buffers', () => {
  assert.deepEqual(pngDimensions(fakePng(1200, 630)), { width: 1200, height: 630 });
  assert.equal(pngDimensions(Buffer.alloc(0)), null);
  assert.equal(pngDimensions(Buffer.from('<svg/>')), null);
  assert.equal(pngDimensions(fakePng().subarray(0, 20)), null);
});

test('cachedPng renders once, reuses the file, and replaces a truncated or wrong-size entry', async () => {
  let renders = 0;
  const render = async () => { renders++; return fakePng(); };
  const first = await cachedPng('key-a', render);
  const second = await cachedPng('key-a', render);
  assert.equal(renders, 1);
  assert.ok(first.equals(second));
  await fs.writeFile(path.join(dir, 'key-a.png'), Buffer.alloc(0));
  await cachedPng('key-a', render);
  assert.equal(renders, 2, '0바이트 항목은 다시 그린다');
  await fs.writeFile(path.join(dir, 'key-a.png'), fakePng(600, 315));
  await cachedPng('key-a', render);
  assert.equal(renders, 3, '크기가 다른 항목은 다시 그린다');
  assert.ok(!(await fs.readdir(dir)).some((name) => name.endsWith('.tmp')), '임시 파일이 남지 않는다');
});

test('pruneOgCache removes stale entries and leftovers but keeps recently used ones', async () => {
  const stale = path.join(dir, 'stale.png'), fresh = path.join(dir, 'fresh.png'), tmp = path.join(dir, 'x.png.123.tmp');
  await Promise.all([fs.writeFile(stale, fakePng()), fs.writeFile(fresh, fakePng()), fs.writeFile(tmp, 'partial')]);
  const old = new Date(Date.now() - 30 * 86_400_000);
  await fs.utimes(stale, old, old);
  const removed = await pruneOgCache({ dir, maxAgeDays: 14 });
  assert.equal(removed, 2);
  const names = await fs.readdir(dir);
  assert.ok(names.includes('fresh.png') && !names.includes('stale.png') && !names.includes('x.png.123.tmp'));
});

test('fitTitle picks the largest size that fits three lines and truncates the rest', () => {
  assert.equal(fitTitle('짧은 제목').size, 60);
  const long = fitTitle('아주 '.repeat(40).trim());
  assert.equal(long.lines.length, 3);
  assert.ok(long.lines[2].endsWith('…'));
});
