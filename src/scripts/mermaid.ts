import { renderMermaidBlocks } from './mermaid-render.ts';
const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  (async () => {
    try {
      const { default: mermaid } = await import('mermaid');
      await renderMermaidBlocks(blocks, mermaid);
    } catch {
      // 모듈을 불러오지 못하면 원래 코드 블록을 유지한다.
    }
  })();
}
