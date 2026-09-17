import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './helpers/markdown.ts';

test('an italic paragraph right after an image becomes its caption', () => {
  const html = render('x.md', '![카드](https://example.com/a.png)\n\n*링크를 받은 사람은 본문보다 [이 카드](https://example.com/)를 먼저 본다.*');
  assert.match(html, /<figure><img src="https:\/\/example\.com\/a\.png" alt="카드"( \/)?><figcaption>링크를 받은 사람은 본문보다 <a href="https:\/\/example\.com\/" rel="noreferrer" target="_blank">이 카드<\/a>를 먼저 본다\.<\/figcaption>\s*<\/figure>/);
  assert.doesNotMatch(html, /<em>/);
});

test('images without a following italic paragraph or inside a sentence stay plain images', () => {
  const plain = render('x.md', '![카드](https://example.com/a.png)\n\n다음 문단은 캡션이 아니다.');
  assert.match(plain, /<p><img src="https:\/\/example\.com\/a\.png" alt="카드"( \/)?><\/p>/);
  assert.doesNotMatch(plain, /<figure>/);
  const inline = render('x.md', '앞 문장 ![카드](https://example.com/a.png) 뒤 문장\n\n*기울임 문단*');
  assert.doesNotMatch(inline, /<figure>/);
  assert.match(inline, /<em>기울임 문단<\/em>/);
});

test('a paragraph that only starts or ends with italics is not a caption and never swallows later blocks', () => {
  const html = render('x.md', '![카드](https://example.com/a.png)\n\n*강조*로 시작하는 문단.\n\n## 다음 헤딩\n\n*통째로 기울임*');
  assert.doesNotMatch(html, /<figure>/);
  assert.match(html, /<p><em>강조<\/em>로 시작하는 문단\.<\/p>/);
  assert.match(html, /<h2[^>]*>다음 헤딩<\/h2>/);
  const tail = render('x.md', '![카드](https://example.com/a.png)\n\n앞은 평문 *뒤만 기울임*\n\n## 다음 헤딩');
  assert.doesNotMatch(tail, /<figure>/);
});
