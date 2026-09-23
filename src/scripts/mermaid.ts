// 순서 처리만 정적으로 가져온다. 렌더러와 Mermaid는 도표가 있는 페이지에서만 아래 load가 불러온다.
import { keepDiagramsInTheme } from './mermaid-queue.ts';

const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  let rendered: { container: Element; pre: Element }[] = [];
  type Render = typeof import('./mermaid-render.ts')['renderMermaidBlocks'];
  let render: Render | null = null;
  let mermaid: Parameters<Render>[1] | null = null;
  keepDiagramsInTheme({
    themeNow: () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    // 도표가 있는 페이지에서만 렌더러와 Mermaid를 병렬로 요청한다.
    load: async () => {
      const [loaded, renderer] = await Promise.all([import('mermaid'), import('./mermaid-render.ts')]);
      mermaid = loaded.default;
      render = renderer.renderMermaidBlocks;
    },
    // 다시 그릴 때는 그린 도표와 크게 보기 버튼을 걷고 원문 코드 블록을 되살린다. 서체는 이미 받아 두어 기다리지 않는다.
    draw: async () => {
      if (!render || !mermaid) return;
      const first = rendered.length === 0;
      let codes = blocks;
      if (!first) {
        const previous = rendered;
        rendered = [];
        for (const { container, pre } of previous) {
          if (container.previousElementSibling?.classList.contains('diagram-open')) container.previousElementSibling.remove();
          container.replaceWith(pre);
        }
        codes = previous.map(({ pre }) => pre.querySelector('code.language-mermaid')).filter((code): code is Element => code !== null);
      }
      rendered = first ? await render(codes, mermaid) : await render(codes, mermaid, 0);
    },
    listen: (handler) => document.addEventListener('themechange', handler)
  }).catch(() => {
    // 모듈을 불러오지 못하면 원래 코드 블록을 유지한다.
  });
}
