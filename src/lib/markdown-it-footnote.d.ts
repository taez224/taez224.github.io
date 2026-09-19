// markdown-it-footnote는 타입을 싣지 않는다. DefinitelyTyped 판은 markdown-it 14 타입을 함께 끌어와
// 이 저장소가 쓰는 markdown-it 15의 자체 타입과 섞이므로, 쓰는 모양만 여기 선언한다.
declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const footnote: (markdown: MarkdownIt) => void;
  export default footnote;
}
