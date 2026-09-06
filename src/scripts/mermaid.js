const blocks = [...document.querySelectorAll('.body pre code.language-mermaid')];
if (blocks.length) {
  (async () => {
    try {
      const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
      const containers = blocks.map((code) => {
        const container = document.createElement('div');
        container.className = 'mermaid';
        container.textContent = code.textContent;
        code.closest('pre').replaceWith(container);
        return container;
      });
      mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { background: '#fbfaf6', lineColor: '#746f64', primaryColor: '#e3ece5', primaryTextColor: '#242720', secondaryColor: '#f2efe7', tertiaryColor: '#fbfaf6', fontFamily: 'Pretendard Variable, Pretendard, sans-serif' } });
      await mermaid.run({ nodes: containers });
    } catch {
      for (const code of blocks) code.closest('pre')?.classList.add('mermaid-fallback');
    }
  })();
}
