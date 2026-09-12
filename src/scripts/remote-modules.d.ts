// 원격 ESM은 설치하지 않으므로 사용하는 API만 선언한다.
declare module 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs' {
  const mermaid: {
    initialize(options: { startOnLoad: boolean; theme: string; themeVariables: Record<string, string> }): void;
    run(options: { nodes: HTMLElement[] }): Promise<void>;
  };
  export default mermaid;
}
