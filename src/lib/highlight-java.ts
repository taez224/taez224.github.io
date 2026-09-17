import { defineLanguage, type HighlightTokenClass, type TokenRange } from '@tanstack/highlight/core';

// 앞선 규칙이 잡은 자리를 건너뛰며 순서대로 훑는 작은 실행기다. 라이브러리에 같은 일을 하는 도우미가
// 있지만 internal 경로에 있어 공개 진입점으로는 불러올 수 없으므로 여기에 둔다.
// 이미 잡힌 자리는 문자 단위 점유 표로 기억한다. 잡힌 범위 목록을 매번 훑으면 긴 코드에서 매치 수의 제곱으로
// 느려진다. 정렬은 createHighlighter가 결과를 받아 다시 하므로 여기서 하지 않는다.
// className이 null인 규칙은 색을 입히지 않고 자리만 차지해, 뒤 규칙이 그 안을 칠하지 못하게 막는다.
type Pattern = { className: HighlightTokenClass | ((match: RegExpExecArray) => HighlightTokenClass) | null; regex: RegExp };

function runPatterns(code: string, patterns: readonly Pattern[]): TokenRange[] {
  const ranges: TokenRange[] = [];
  const taken = new Uint8Array(code.length);
  for (const { className, regex } of patterns) {
    // 정규식 리터럴은 모듈 전체가 공유하므로 lastIndex가 남지 않게 복제해서 돈다.
    const scanner = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = scanner.exec(code))) {
      // 길이 0 일치는 같은 자리를 무한히 맴돌므로 한 칸 밀어 준다.
      if (match[0] === '') { scanner.lastIndex += 1; continue; }
      const start = match.index;
      const end = start + match[0].length;
      if (taken.subarray(start, end).includes(1)) continue;
      taken.fill(1, start, end);
      if (className === null) continue;
      ranges.push({ className: typeof className === 'function' ? className(match) : className, end, start });
    }
  }
  return ranges;
}

// Java 식별자는 유니코드 글자·숫자에 더해 통화 기호(₩ € $)를 받는다. 식별자 안에 든 낱말을 키워드로
// 잡지 않도록 앞뒤 경계를 이 클래스로 막는다. \p{Sc}는 \p{ID_Continue}와 겹치지 않아 $도 여기서 들어온다.
const IDENTIFIER_PART = String.raw`[\p{ID_Continue}\p{Sc}]`;
const IDENTIFIER_START = String.raw`[\p{ID_Start}\p{Sc}_]`;
const IDENTIFIER = `${IDENTIFIER_START}${IDENTIFIER_PART}*`;
// 전부 대문자인 두 글자 이상 이름(LIMIT, RUNTIME)이다. Java에서는 상수와 enum 값의 관례라 타입·함수로 보지 않는다.
// 공개 노트의 Java 블록에서 이런 이름 가운데 클래스는 URI.create처럼 정적 메서드를 부르는 자리에만 나온다.
// 그 모양(점 없이 시작해 소문자 메서드 호출이 붙음)만 타입으로 보고, 나머지(URL u, List<URL>)는 색 없이 둔다.
const CONSTANT = String.raw`\p{Lu}[\p{Lu}\p{Nd}_\p{Sc}]+(?!${IDENTIFIER_PART})`;
const CONSTANT_TYPE = String.raw`(?<!\.)${CONSTANT}(?=\.\p{Ll}${IDENTIFIER_PART}*[ \t]*\()`;
const word = (...names: string[]) => new RegExp(String.raw`(?<!${IDENTIFIER_PART})(?:${names.join('|')})(?!${IDENTIFIER_PART})`, 'gu');

// 주석과 문자열은 한 정규식에서 함께 겨룬다. 따로 돌리면 문자열 안의 //가 주석으로, 주석 안의 "가
// 문자열로 새어 뒤쪽 코드가 통째로 잘못 칠해진다. 텍스트 블록(""")을 먼저 두어 따옴표 세 개가
// 빈 문자열 두 개로 읽히지 않게 하고, 이스케이프는 한 덩어리로 삼켜 \"가 닫는 따옴표가 되지 않게 한다.
const COMMENTS_AND_STRINGS = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"""(?:\\[\s\S]|[^\\])*?(?:"""|$)|"(?:\\[^\r\n]|[^"\\\r\n])*"?|'(?:\\[^\r\n]|[^'\\\r\n])*'?/g;

// module-info.java 안에서만 뜻이 있는 낱말(module, requires, exports, opens, uses, provides, to, with,
// transitive)은 뺀다. 일반 코드에서는 to나 with 같은 변수 이름으로 더 자주 나온다. record·sealed·permits·
// var·yield는 문맥 키워드지만 변수 이름으로 쓰이는 일이 드물어 라이브러리의 JS·TS 목록과 같은 기준으로 넣는다.
const KEYWORDS = [
  'abstract', 'assert', 'break', 'case', 'catch', 'class', 'continue', 'default', 'do', 'else', 'enum', 'extends',
  'final', 'finally', 'for', 'if', 'implements', 'import', 'instanceof', 'interface', 'native', 'new', 'non-sealed',
  'package', 'permits', 'private', 'protected', 'public', 'record', 'return', 'sealed', 'static', 'strictfp', 'super',
  'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'var', 'volatile', 'while', 'yield'
];

export const java = defineLanguage({
  name: 'java',
  tokenize: (code) => runPatterns(code, [
    { className: (match) => (match[0].startsWith('/') ? 'comment' : 'string'), regex: COMMENTS_AND_STRINGS },
    // 애너테이션은 이름까지 한 덩어리로 잡는다. @Override와 @param의 @만 칠하면 눈에 걸린다.
    // 클래스는 라이브러리의 TS 데코레이터와 같은 function이다. meta로 두면 테마의 회색이 주석과 갈리지 않는다.
    { className: 'function', regex: new RegExp(String.raw`@${IDENTIFIER_START}${IDENTIFIER_PART}*(?:\.${IDENTIFIER_START}${IDENTIFIER_PART}*)*`, 'gu') },
    { className: 'keyword', regex: word(...KEYWORDS) },
    { className: 'literal', regex: word('true', 'false', 'null') },
    { className: 'type', regex: word('boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short', 'void') },
    // 숫자는 접미사와 자릿수 구분 밑줄까지 받는다. 앞뒤가 식별자나 점이면 잡지 않는다.
    { className: 'number', regex: new RegExp(String.raw`(?<![\p{ID_Continue}\p{Sc}.])(?:0[xX](?:[\da-fA-F_]+(?:\.[\da-fA-F_]*)?|\.[\da-fA-F_]+)[pP][+-]?\d[\d_]*[fFdD]?|0[xX][\da-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[lLfFdD]?)(?![\p{ID_Continue}\p{Sc}.])`, 'gu') },
    // import·package의 경로(java.util.List)는 이름 하나다. 아래 규칙이 조각마다 타입·속성 색을 입히지 않도록 자리만 차지한다.
    { className: null, regex: new RegExp(String.raw`(?<=(?<!${IDENTIFIER_PART})(?:import|package)\s+(?:static\s+)?)${IDENTIFIER}(?:\s*\.\s*(?:${IDENTIFIER}|\*))*`, 'gu') },
    // 아래 세 규칙은 라이브러리의 TS 문법과 같은 기준이다. 대문자로 시작하는 이름은 타입, 점 바로 뒤의 이름은 속성,
    // 점 없이 괄호가 붙은 이름은 함수다. 파서 없이 모양으로만 가르므로 대문자로 시작하는 변수 이름은 타입으로 보인다.
    { className: 'type', regex: new RegExp(String.raw`(?<!${IDENTIFIER_PART})(?:${CONSTANT_TYPE}|(?!${CONSTANT})\p{Lu}${IDENTIFIER_PART}*)`, 'gu') },
    // 가변 인자(String... args)의 점 뒤는 멤버 접근이 아니므로 점이 하나일 때만 본다. 메서드 참조(String::valueOf)도 속성이다.
    { className: 'property', regex: new RegExp(String.raw`(?<=(?<!\.)\.|::)${IDENTIFIER}`, 'gu') },
    { className: 'function', regex: new RegExp(String.raw`(?<!${IDENTIFIER_PART})(?!\p{Lu})${IDENTIFIER}(?=[ \t]*\()`, 'gu') }
  ])
});
