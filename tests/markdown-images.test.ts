import test from 'node:test';
import assert from 'node:assert/strict';
import { render, renderWithVisibility } from './helpers/markdown.ts';

const imageTag = (html: string) => html.match(/<img\b[^>]*>/)?.[0] ?? '';

// 사이트는 그림의 원래 비율을 지키므로 너비만 따른다. 높이는 대체 텍스트에서 떼어 내되 속성으로 내보내지 않는다.
test('Obsidian image sizes set the width, drop the height and stay out of the alt text', () => {
  const renderer = renderWithVisibility();
  for (const [source, alt, width] of [
    ['![[picture.png|300]]', 'picture', '300'],
    ['![[picture.png|300x200]]', 'picture', '300'],
    ['![설명|320](picture.png)', '설명', '320'],
    ['![설명|640x480](https://example.com/a.png)', '설명', '640'],
    ['![250](https://example.com/b.png)', '', '250']
  ]) {
    // 태그 전체의 속성 순서와 닫는 모양(`/>`)은 묻지 않고 너비, 높이 유무, 대체 텍스트만 본다.
    const img = imageTag(renderer('x.md', source));
    assert.match(img, new RegExp(`\\swidth="${width}"`), `${source}: 너비`);
    assert.doesNotMatch(img, /\sheight=/, `${source}: 높이는 내보내지 않는다`);
    assert.match(img, new RegExp(`\\salt="${alt}"`), `${source}: 대체 텍스트`);
  }
});

test('image labels that are not sizes stay alt text', () => {
  const renderer = renderWithVisibility();
  for (const [source, alt] of [
    ['![[picture.png|그림]]', '그림'],
    ['![2024년 풍경](https://example.com/c.png)', '2024년 풍경'],
    ['![a|b](https://example.com/d.png)', 'a|b']
  ]) {
    const img = imageTag(renderer('x.md', source));
    assert.ok(img.includes(` alt="${alt}"`), `${source}: 대체 텍스트 ${img}`);
    assert.doesNotMatch(img, /\swidth=/, `${source}: 크기가 아니므로 너비를 정하지 않는다`);
  }
});

test('an italic paragraph right after an image becomes its caption', () => {
  const html = render('x.md', '![카드](https://example.com/a.png)\n\n*링크를 받은 사람은 본문보다 [이 카드](https://example.com/)를 먼저 본다.*');
  // 링크의 rel·target은 markdown-links.test.ts가 본다. 여기서는 그림과 캡션이 한 figure로 묶이고 캡션 안의 링크가 살아 있는지만 본다.
  assert.match(html, /<figure><img [^>]*alt="카드"[^>]*><figcaption>링크를 받은 사람은 본문보다 <a href="https:\/\/example\.com\/"[^>]*>이 카드<\/a>를 먼저 본다\.<\/figcaption>\s*<\/figure>/);
  assert.doesNotMatch(html, /<em>/);
});

test('images without a following italic paragraph or inside a sentence stay plain images', () => {
  const plain = render('x.md', '![카드](https://example.com/a.png)\n\n다음 문단은 캡션이 아니다.');
  assert.match(plain, /<p><img [^>]*alt="카드"[^>]*><\/p>/);
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
