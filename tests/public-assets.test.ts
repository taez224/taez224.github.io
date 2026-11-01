import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { createAssetResolver } from '../src/lib/public-assets.ts';
import { makeVault } from './vault-fixture.ts';


const config = { exclude: ['01_Slipbox/비공개'], assets: ['_attachments/reviewed.png'], include: [{ path: '01_Slipbox', mode: 'all' }] };
const files = {
  '01_Slipbox/그림.png': 'png',
  '01_Slipbox/하위/같은이름.png': 'png',
  '01_Slipbox/다른/같은이름.png': 'png',
  '01_Slipbox/비공개/숨김.png': 'png',
  '01_Slipbox/문서.pdf': 'pdf',
  '30_Resources/References/Books/표지.png': 'png',
  '_attachments/reviewed.png': 'png',
  '_attachments/unreviewed.png': 'png'
};
const note = '01_Slipbox/노트.md';

test('public folders, the books folder and reviewed attachments are usable; other vault files are not', async (t) => {
  const { resolve } = await createAssetResolver({ vaultRoot: await makeVault(t, files), config, base: '/obsidian' });
  assert.deepEqual(resolve(note, '그림.png'), { url: `/obsidian/assets/vault/01_Slipbox/${encodeURIComponent('그림.png')}`, sourcePath: '01_Slipbox/그림.png' });
  assert.equal(resolve(note, '표지.png')?.sourcePath, '30_Resources/References/Books/표지.png');
  assert.equal(resolve(note, 'reviewed.png')?.sourcePath, '_attachments/reviewed.png');
  assert.equal(resolve(note, 'unreviewed.png'), null, '검토 목록에 없는 첨부는 쓸 수 없다');
  assert.equal(resolve(note, '비공개/숨김.png'), null, '제외 규칙에 걸린 파일은 쓸 수 없다');
});

test('a filename shared by two public images needs a path, and only images count as assets', async (t) => {
  const { resolve } = await createAssetResolver({ vaultRoot: await makeVault(t, files), config, base: '' });
  assert.equal(resolve(note, '같은이름.png'), null, '파일 이름만으로는 어느 쪽인지 알 수 없다');
  assert.equal(resolve('01_Slipbox/하위/노트.md', '같은이름.png')?.sourcePath, '01_Slipbox/하위/같은이름.png', '노트와 같은 폴더의 파일을 먼저 찾는다');
  assert.equal(resolve(note, '문서.pdf'), null);
  assert.deepEqual(resolve(note, 'https://example.com/a.png'), { url: 'https://example.com/a.png' });
});

test('only assets resolved for a body are recorded for copying into the build', async (t) => {
  const assets = await createAssetResolver({ vaultRoot: await makeVault(t, files), config, base: '' });
  assets.resolve(note, '그림.png', { copy: false });
  assert.equal(assets.copies.size, 0, '썸네일 확인처럼 copy: false로 찾은 자산은 복사 목록에 넣지 않는다');
  assets.resolve(note, '그림.png');
  assert.deepEqual([...assets.copies], [['01_Slipbox/그림.png', `assets/vault/01_Slipbox/${encodeURIComponent('그림.png')}`]]);
});

test('a reviewed asset path that is not a file fails the build', async (t) => {
  await assert.rejects(createAssetResolver({ vaultRoot: await makeVault(t, files), config: { ...config, assets: ['_attachments'] }, base: '' }), /Reviewed asset is not a file: _attachments/);
});

test('dimensions are read only for resolved public images and cached for the assembly', async (t) => {
  const root = await makeVault(t, { '01_Slipbox/picture.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"></svg>' });
  const assets = await createAssetResolver({ vaultRoot: root, config: { ...config, assets: [] }, base: '/obsidian' });
  assert.equal(await assets.dimensionsFor('https://example.com/image.png'), null);
  assert.equal(await assets.dimensionsFor('/obsidian/assets/vault/01_Slipbox/picture.svg'), null, '아직 원문에서 참조하지 않은 파일은 읽지 않는다');
  const image = assets.resolve(note, 'picture.svg')!;
  const first = assets.dimensionsFor(image.url);
  assert.equal(assets.dimensionsFor(image.url), first);
  assert.deepEqual(await first, { width: 600, height: 400 });
  assert.deepEqual([...assets.copies.keys()], ['01_Slipbox/picture.svg']);
});

test('image dimensions follow EXIF orientation and unreadable dimensions do not stop publication', async (t) => {
  const root = await makeVault(t, { '01_Slipbox/broken.png': 'not an image' });
  await sharp({ create: { width: 120, height: 80, channels: 3, background: 'white' } }).jpeg().withMetadata({ orientation: 6 }).toFile(path.join(root, '01_Slipbox/rotated.jpg'));
  const assets = await createAssetResolver({ vaultRoot: root, config: { ...config, assets: [] }, base: '' });
  assert.deepEqual(await assets.dimensionsFor(assets.resolve(note, 'rotated.jpg')!.url), { width: 80, height: 120 });
  assert.equal(await assets.dimensionsFor(assets.resolve(note, 'broken.png')!.url), null);
});
