// markdown-it-footnote는 타입을 싣지 않는다. DefinitelyTyped 판은 markdown-it 14 타입을 함께 끌어와
// 이 저장소가 쓰는 markdown-it 15의 자체 타입과 섞이므로, 쓰는 모양만 여기 선언한다.
declare module 'markdown-it-footnote' {
  // markdown-it의 기본 내보내기는 값(호출할 수 있는 생성자)이고, 인스턴스 타입은 이름 있는 내보내기다.
  import type { MarkdownIt } from 'markdown-it';
  const footnote: (markdown: MarkdownIt) => void;
  export default footnote;
}
