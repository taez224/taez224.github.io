import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBodyImages } from '../src/lib/image-loading.ts';

const tags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
function imageAt(html: string, index: number): string {
  const tag = tags(html)[index];
  assert.ok(tag, `${index + 1}번째 이미지가 있다`);
  return tag;
}

test('the first body image loads eagerly and later images load lazily without changing surrounding markup', async () => {
  const html = '<h2 id="first">제목</h2><figure><img src="/one.png" alt="a&amp;b"><figcaption>설명</figcaption></figure><p><img src="/two.png" alt="둘째"></p>';
  const result = await prepareBodyImages(html, async () => null);
  assert.match(imageAt(result, 0), /loading="eager"/);
  assert.match(imageAt(result, 1), /loading="lazy"/);
  for (const tag of tags(result)) assert.match(tag, /decoding="async"/);
  assert.equal(result.replace(/<img\b[^>]*>/g, 'IMAGE'), html.replace(/<img\b[^>]*>/g, 'IMAGE'));
  assert.match(result, /alt="a&amp;b"/);
});

test('local image space uses its original ratio, including an explicitly chosen width', async () => {
  const result = await prepareBodyImages('<img src="/a.png"><img src="/a.png" width="300" height="999">', async () => ({ width: 1200, height: 800 }));
  assert.match(imageAt(result, 0), /width="1200" height="800"/);
  assert.match(imageAt(result, 1), /width="300" height="200"/);
});

test('explicit card and author loading choices are kept without making the first ordinary body image lazy', async () => {
  const result = await prepareBodyImages('<a class="article-card"><img src="/card.png" loading="lazy" decoding="sync" width="160" height="90"></a><img src="/body.png">', async () => null);
  assert.match(imageAt(result, 0), /loading="lazy" decoding="sync" width="160" height="90"/);
  assert.match(imageAt(result, 1), /loading="eager"/);
});

test('an image without known dimensions keeps its size hints and a document without images is unchanged', async () => {
  const result = await prepareBodyImages('<img src="https://example.com/a.png" width="320">', async () => null);
  assert.match(result, /width="320"/);
  assert.doesNotMatch(result, /height=/);
  assert.equal(await prepareBodyImages('<p>그림 없음</p>', async () => { throw new Error('읽으면 안 된다'); }), '<p>그림 없음</p>');
});

test('existing attribute values are kept literally rather than interpreted as replacement patterns', async () => {
  const result = await prepareBodyImages('<img src="/a.png" loading="lazy$&amp;" alt="원본">', async () => null);
  assert.ok(result.includes('loading="lazy$&amp;"'));
  assert.ok(result.includes('alt="원본"'));
});
