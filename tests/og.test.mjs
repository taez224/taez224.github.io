import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import imageService from 'astro/assets/services/sharp';
import { crc32, deflateSync } from 'node:zlib';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'garden-og-'));
process.env.GARDEN_OG_CACHE_DIR = dir;
const { cachedPng, pngDimensions, pruneOgCache, fitTitle, ogSvg, renderOgPng, thumbnailDataUri } = await import('../src/lib/og.mjs');

// 실제 렌더러의 PNG를 사용한다. 헤더만 흉내 내면 손상 검증 자체가 무의미해진다.
const fixtures = new Map();
function pngFixture(width = 1200, height = 630) {
  const key = `${width}x${height}`;
  if (!fixtures.has(key)) fixtures.set(key, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#252e29"/></svg>`).render().asPng());
  return Buffer.from(fixtures.get(key));
}

function replaceImageData(png, data) {
  const chunks = [png.subarray(0, 8)];
  let inserted = false;
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at), end = at + length + 12;
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT') {
      if (!inserted) {
        const chunk = Buffer.alloc(data.length + 12);
        chunk.writeUInt32BE(data.length); chunk.write('IDAT', 4); data.copy(chunk, 8);
        chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
        chunks.push(chunk); inserted = true;
      }
    } else chunks.push(png.subarray(at, end));
    at = end;
  }
  return Buffer.concat(chunks);
}

test('pngDimensions reads IHDR and rejects non-PNG or truncated buffers', () => {
  assert.deepEqual(pngDimensions(pngFixture(1200, 630)), { width: 1200, height: 630 });
  assert.equal(pngDimensions(Buffer.alloc(0)), null);
  assert.equal(pngDimensions(Buffer.from('<svg/>')), null);
  assert.equal(pngDimensions(pngFixture().subarray(0, 20)), null);
  assert.equal(pngDimensions(pngFixture().subarray(0, 24)), null);
  assert.equal(pngDimensions(pngFixture().subarray(0, 33)), null);
  assert.equal(pngDimensions(pngFixture().subarray(0, -12)), null);
  const corrupt = pngFixture(); corrupt[corrupt.length - 17] ^= 1;
  assert.equal(pngDimensions(corrupt), null, 'CRC 손상');
  assert.equal(pngDimensions(replaceImageData(pngFixture(), Buffer.from('broken'))), null, 'CRC가 맞아도 압축 데이터 손상');
  assert.equal(pngDimensions(replaceImageData(pngFixture(), deflateSync(Buffer.alloc(20)))), null, '스캔라인 누락');
});

test('cachedPng renders once, reuses the file, and replaces a truncated or wrong-size entry', async () => {
  let renders = 0;
  const render = async () => { renders++; return pngFixture(); };
  const first = await cachedPng('key-a', render);
  const second = await cachedPng('key-a', render);
  assert.equal(renders, 1);
  assert.ok(first.equals(second));
  await fs.writeFile(path.join(dir, 'key-a.png'), Buffer.alloc(0));
  await cachedPng('key-a', render);
  assert.equal(renders, 2, '0바이트 항목은 다시 그린다');
  await fs.writeFile(path.join(dir, 'key-a.png'), pngFixture().subarray(0, 33));
  await cachedPng('key-a', render);
  assert.equal(renders, 3, 'IHDR만 남은 항목도 다시 그린다');
  await fs.writeFile(path.join(dir, 'key-a.png'), pngFixture(600, 315));
  await cachedPng('key-a', render);
  assert.equal(renders, 4, '크기가 다른 항목은 다시 그린다');
  assert.ok(!(await fs.readdir(dir)).some((name) => name.endsWith('.tmp')), '임시 파일이 남지 않는다');
});

test('same-key concurrent requests render once and return complete images', async () => {
  let renders = 0;
  const results = await Promise.all(Array.from({ length: 4 }, () => cachedPng('parallel', async () => { renders++; return pngFixture(); })));
  assert.equal(renders, 1);
  for (const png of results) assert.ok(png.equals(pngFixture()));
  assert.ok(!(await fs.readdir(dir)).some((name) => name.endsWith('.tmp')));
});

test('failed or invalid rendering is not cached and can be retried', async () => {
  await assert.rejects(cachedPng('retry', () => { throw new Error('render failed'); }), /render failed/);
  await assert.rejects(cachedPng('retry', () => pngFixture().subarray(0, 24)), /invalid/);
  assert.ok(!(await fs.readdir(dir)).includes('retry.png'));
  assert.deepEqual(pngDimensions(await cachedPng('retry', () => pngFixture())), { width: 1200, height: 630 });
});

test('pruneOgCache removes stale entries and leftovers but keeps recently used ones', async () => {
  const stale = path.join(dir, 'stale.png'), fresh = path.join(dir, 'fresh.png'), tmp = path.join(dir, 'x.png.123.tmp');
  await Promise.all([fs.writeFile(stale, pngFixture()), fs.writeFile(fresh, pngFixture()), fs.writeFile(tmp, 'partial')]);
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

test('ogSvg uses a contained thumbnail in place of the local graph', () => {
  const svg = ogSvg({
    note: { title: 'Thumbnail note', displayTitle: 'Thumbnail note', kind: 'blog' },
    outgoing: [],
    incoming: [],
    siteLabel: 'example.com',
    thumbnailDataUri: 'data:image/png;base64,fixture'
  });
  assert.match(svg, /<image href="data:image\/png;base64,fixture" x="740" y="115" width="400" height="400" preserveAspectRatio="xMidYMid meet"\/>/);
  assert.doesNotMatch(svg, /<circle /, 'thumbnail cards do not render the local graph');
});

test('ogSvg keeps the local graph when a note has no thumbnail', () => {
  const svg = ogSvg({
    note: { title: 'Graph note', displayTitle: 'Graph note', kind: 'blog' },
    outgoing: [],
    incoming: [],
    siteLabel: 'example.com'
  });
  assert.match(svg, /<circle /);
  assert.match(svg, /<g transform="translate\(740 115\)">/);
  assert.doesNotMatch(svg, /<image /);
});

test('thumbnail normalization supports JPEG and WebP and same-path replacements change the card', async () => {
  const render = (uri) => new Resvg(ogSvg({ note: { title: 'Thumbnail', kind: 'blog' }, outgoing: [], incoming: [], siteLabel: 'example.com', thumbnailDataUri: uri })).render().asPng();
  for (const format of ['jpg', 'webp']) {
    const raster = await imageService.transform(pngFixture(), { src: 'fixture.png', format }, { service: { config: {} } }, console);
    await fs.writeFile(path.join(dir, `cover.${format}`), raster.data);
    const uri = await thumbnailDataUri(`cover.${format}`, { vaultRoot: dir });
    assert.match(uri, /^data:image\/png;base64,/);
    assert.deepEqual(pngDimensions(render(uri)), { width: 1200, height: 630 });
  }
  const imagePath = path.join(dir, 'replace.png');
  await fs.writeFile(imagePath, pngFixture());
  const before = await thumbnailDataUri('replace.png', { vaultRoot: dir });
  await fs.writeFile(imagePath, new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="red"/></svg>').render().asPng());
  const after = await thumbnailDataUri('replace.png', { vaultRoot: dir });
  assert.notEqual(before, after, '같은 경로라도 이미지 내용이 SVG 캐시 키에 반영된다');
  assert.notDeepEqual(render(before), render(after));
});

test('renderOgPng rejects unsupported or escaping thumbnail paths explicitly', async () => {
  const garden = {
    notes: [{
      path: '20_Projects/blog/thumbnail-test.md',
      slug: 'thumbnail-test',
      kind: 'blog',
      title: 'Thumbnail test',
      displayTitle: 'Thumbnail test',
      thumbnail: '20_Projects/blog/assets/unsupported.txt',
      outgoing: [],
      incoming: []
    }]
  };
  await assert.rejects(renderOgPng(garden, garden.notes[0].path, { siteLabel: 'example.com' }), /Unsupported OG thumbnail format/);
  garden.notes[0].thumbnail = '../private/secret.png';
  await assert.rejects(renderOgPng(garden, garden.notes[0].path, { siteLabel: 'example.com' }), /outside the vault/);
});
