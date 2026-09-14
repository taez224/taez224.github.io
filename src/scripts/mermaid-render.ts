import type { Mermaid } from 'mermaid';
type MermaidRenderer = Pick<Mermaid, 'initialize' | 'run'>;

export async function renderMermaidBlocks(blocks: Element[], mermaid: MermaidRenderer): Promise<void> {
  mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: 'base', themeVariables: { background: '#fbfaf6', lineColor: '#746f64', primaryColor: '#e3ece5', primaryTextColor: '#242720', secondaryColor: '#f2efe7', tertiaryColor: '#fbfaf6', fontFamily: 'Pretendard Variable, Pretendard, sans-serif' } });
  for (const code of blocks) {
    const pre = code.closest('pre');
    if (!pre) continue;
    const container = code.ownerDocument.createElement('div');
    container.className = 'mermaid';
    container.textContent = code.textContent;
    pre.replaceWith(container);
    try {
      await mermaid.run({ nodes: [container] });
    } catch {
      // 오류가 난 도표만 원문으로 되돌려 다른 도표는 계속 렌더링한다.
      container.replaceWith(pre);
    }
  }
}
