import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { comicCover, comicNeighbors, type ComicWork } from '../src/lib/comics.ts';
import { comics } from '../src/content/comics.ts';
const work = (slug: string): ComicWork => ({ slug, title: slug, pages: [{ src: '/p1.webp', width: 1080, height: 1350, alt: slug }] });
test('a single comic has no previous or next work', () => {
  assert.deepEqual(comicNeighbors([work('one')], 'one'), { previous: null, next: null });
});
test('comic navigation follows registration order and never wraps at the ends', () => {
  const works = ['one', 'two', 'three'].map(work);
  assert.deepEqual(comicNeighbors(works, 'one'), { previous: null, next: works[1] });
  assert.deepEqual(comicNeighbors(works, 'two'), { previous: works[0], next: works[2] });
  assert.deepEqual(comicNeighbors(works, 'three'), { previous: works[1], next: null });
  assert.throws(() => comicNeighbors(works, 'missing'), /Unknown comic/);
});
test('the catalogue cover is the first reading page', () => {
  const w = work('one');
  assert.equal(comicCover(w), w.pages[0]);
});
test('registered comics are the two published works in reading order', () => {
  assert.deepEqual(comics.map(c => [c.slug, c.pages.length]), [['soft-mana-core', 8], ['id-photo', 12]]);
});
test('every registered page is a 4:5 image with alt text that exists in public', () => {
  for (const comic of comics) {
    for (const page of comic.pages) {
      assert.equal(page.width * 5, page.height * 4, page.src);
      assert.ok(page.alt.trim().length > 0, page.src);
      assert.ok(fs.existsSync(path.join('public', page.src)), page.src);
    }
  }
});
test('the ID photo comic opens on its cover and keeps the original first page second', () => {
  const idPhoto = comics.find(c => c.slug === 'id-photo')!;
  assert.equal(idPhoto.pages[0].src, '/comics/id-photo/cover.webp');
  assert.equal(idPhoto.pages[1]!.src, '/comics/id-photo/page-1.webp');
  assert.equal(idPhoto.pages[1]!.alt, '사원증 사진. 옷깃을 잡은 주인공에게 선배가 찍을게요~ 한다.');
});

test('the ID photo spread directly precedes its badge and portrait', () => {
  const pages = comics.find(work => work.slug === 'id-photo')!.pages;
  assert.deepEqual(pages.filter(page => page.artworkLayer).map(page => page.artworkLayer), ['gaze', 'badge']);
  const gaze = pages.findIndex(page => page.artworkLayer === 'gaze');
  assert.equal(pages[gaze + 1]?.artworkLayer, 'badge');
  assert.equal(pages[gaze + 2]?.src, '/comics/id-photo/page-8.webp');
});
test('every registered page stays light enough to open on a phone without a long wait', () => {
  // 1080x1350 원고는 손실 WebP로 장당 100~200KB면 화질 차이가 보이지 않는다. 무손실로 저장하면 장당 1MB 가까이 되어 첫 장이 늦게 뜬다.
  const limit = 300 * 1024;
  for (const comic of comics) {
    for (const page of comic.pages) {
      const size = fs.statSync(path.join('public', page.src)).size;
      assert.ok(size <= limit, `${page.src} is ${Math.round(size / 1024)}KB`);
    }
  }
});
