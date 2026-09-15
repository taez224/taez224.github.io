const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  (async () => {
    try {
      // 도표가 있는 페이지에서만 렌더러와 Mermaid를 병렬로 요청한다.
      const [{ default: mermaid }, { renderMermaidBlocks }] = await Promise.all([
        import('mermaid'),
        import('./mermaid-render.ts')
      ]);
      await renderMermaidBlocks(blocks, mermaid);
    } catch {
      // 모듈을 불러오지 못하면 원래 코드 블록을 유지한다.
    }
  })();
}
