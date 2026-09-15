const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  (async () => {
    try {
      // 도표가 있는 페이지에서만 받는다. 렌더러는 앞머리를 읽느라 YAML 파서를 함께 들이므로,
      // 정적으로 부르면 도표가 없는 노트 페이지도 압축 후 13.8KB를 더 받게 된다.
      // Mermaid 본체와 나란히 요청하므로 도표가 있는 페이지에서는 기다리는 시간이 늘지 않는다.
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
