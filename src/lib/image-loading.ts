import type { ImageDimensions } from './public-assets.ts';

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
function setAttribute(tag: string, name: string, value: string): string {
  const existing = new RegExp(`\\s${name}="[^"]*"`);
  return existing.test(tag) ? tag.replace(existing, () => ` ${name}="${value}"`)
    : tag.replace(/\s*\/?>$/, () => ` ${name}="${value}">`);
}

// 본문 렌더러가 검증한 HTML의 이미지 태그만 보강한다. 다른 마크업은 다시 조립하지 않는다.
export async function prepareBodyImages(html: string, dimensionsFor: (url: string) => Promise<ImageDimensions | null>): Promise<string> {
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  let bodyImageCount = 0;
  const prepared = await Promise.all(tags.map(async (original) => {
    // 첫 그림은 첫 화면의 주요 이미지일 수 있다. 글 카드나 작성자가 지정한 로딩 방식은 유지한다.
    const loading = attribute(original, 'loading') ?? (bodyImageCount++ === 0 ? 'eager' : 'lazy');
    let tag = setAttribute(original, 'loading', loading);
    tag = setAttribute(tag, 'decoding', attribute(original, 'decoding') ?? 'async');
    const size = await dimensionsFor(attribute(original, 'src') ?? '');
    if (size) {
      const specified = attribute(original, 'width');
      const width = specified === undefined ? size.width : /^\d+$/.test(specified) ? Number(specified) : 0;
      if (width > 0) {
        // Obsidian에 적은 높이가 아니라 원본 비율로 높이를 구한다. CSS height:auto가 좁은 화면에서도 이 비율을 지킨다.
        tag = setAttribute(tag, 'width', String(width));
        tag = setAttribute(tag, 'height', String(Math.max(1, Math.round(width * size.height / size.width))));
      }
    }
    return tag;
  }));
  let at = 0;
  return html.replace(/<img\b[^>]*>/g, () => prepared[at++]!);
}
