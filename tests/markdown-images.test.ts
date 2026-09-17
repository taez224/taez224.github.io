import test from 'node:test';
import assert from 'node:assert/strict';
import { render, renderWithVisibility } from './helpers/markdown.ts';

// 사이트는 그림의 원래 비율을 지키므로 너비만 따른다. 높이는 대체 텍스트에서 떼어 내되 속성으로 내보내지 않는다.
test('Obsidian image sizes set the width, drop the height and stay out of the alt text', () => {
  const renderer = renderWithVisibility();
  for (const [source, expected] of [
    ['![[picture.png|300]]', '<img src="/assets/picture.png" alt="picture" width="300" />'],
    ['![[picture.png|300x200]]', '<img src="/assets/picture.png" alt="picture" width="300" />'],
    ['![설명|320](picture.png)', '<img src="/assets/picture.png" alt="설명" width="320" />'],
    ['![설명|640x480](https://example.com/a.png)', '<img src="https://example.com/a.png" alt="설명" width="640" />'],
    ['![250](https://example.com/b.png)', '<img src="https://example.com/b.png" alt="" width="250" />']
  ]) {
    assert.equal(renderer('x.md', source).trim(), `<p>${expected}</p>`, source);
  }
});

test('image labels that are not sizes stay alt text', () => {
  const renderer = renderWithVisibility();
  assert.match(renderer('x.md', '![[picture.png|그림]]'), /<img src="\/assets\/picture.png" alt="그림" \/>/);
  assert.match(renderer('x.md', '![2024년 풍경](https://example.com/c.png)'), /alt="2024년 풍경" \/>/);
  assert.match(renderer('x.md', '![a|b](https://example.com/d.png)'), /alt="a\|b" \/>/);
});

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
