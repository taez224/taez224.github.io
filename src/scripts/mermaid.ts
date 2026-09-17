const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  (async () => {
    try {
      // 도표가 있는 페이지에서만 렌더러와 Mermaid를 병렬로 요청한다.
      const [{ default: mermaid }, { renderMermaidBlocks }, { DARK_SCHEME_QUERY }] = await Promise.all([
        import('mermaid'),
        import('./mermaid-render.ts'),
        import('./mermaid-config.ts')
      ]);
      let rendered = await renderMermaidBlocks(blocks, mermaid);
      // 읽는 중에 시스템 화면 모드가 바뀌면(해 질 녘 자동 전환 등) 도표 색이 바탕과 어긋난다.
      // 그린 도표와 크게 보기 버튼을 걷고 원문 코드 블록을 되살려 새 모드의 색으로 다시 그린다. 서체는 이미 받아 두어 기다리지 않는다.
      matchMedia(DARK_SCHEME_QUERY).addEventListener('change', async () => {
        const previous = rendered;
        rendered = [];
        for (const { container, pre } of previous) {
          if (container.previousElementSibling?.classList.contains('diagram-open')) container.previousElementSibling.remove();
          container.replaceWith(pre);
        }
        rendered = await renderMermaidBlocks(previous.map(({ pre }) => pre.querySelector('code.language-mermaid')).filter((code): code is Element => code !== null), mermaid, 0);
      });
    } catch {
      // 모듈을 불러오지 못하면 원래 코드 블록을 유지한다.
    }
  })();
}
