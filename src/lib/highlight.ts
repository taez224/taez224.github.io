import { createHighlighter, renderNodesToHtml, renderTokens } from '@tanstack/highlight/core';
import { css } from '@tanstack/highlight/languages/css';
import { dockerfile } from '@tanstack/highlight/languages/dockerfile';
import { html } from '@tanstack/highlight/languages/html';
import { js } from '@tanstack/highlight/languages/js';
import { json } from '@tanstack/highlight/languages/json';
import { markdown } from '@tanstack/highlight/languages/markdown';
import { python } from '@tanstack/highlight/languages/python';
import { shell } from '@tanstack/highlight/languages/shell';
import { ts } from '@tanstack/highlight/languages/ts';
import { tsx } from '@tanstack/highlight/languages/tsx';
import { yaml } from '@tanstack/highlight/languages/yaml';
import { java } from './highlight-java.ts';

// 노트에 실제로 쓰는 언어만 등록한다. 강조는 빌드 때만 돌아가 방문자에게 스크립트가 가지 않지만,
// 쓰지 않는 언어를 미리 불러오지 않는다. HTML 크기는 실제로 강조한 블록의 토큰 수에 따라 늘어난다.
// 언어 묶음(@tanstack/highlight/languages)을 통째로 가져오면 번들러 없는 테스트·dev에서 30개 모듈이 모두
// 평가되므로 언어별 경로로 가져온다.
// 별칭은 라이브러리가 함께 받는다(javascript→js, typescript→ts, bash→shell, xml→html, yml→yaml, md→markdown).
// java는 라이브러리에 없어 highlight-java.ts에서 직접 정의한다.
const highlighter = createHighlighter({
  languages: [java, js, ts, tsx, yaml, shell, json, css, html, markdown, python, dockerfile]
});

// 도표로 바뀌는 코드 블록이다. mermaid-render.ts가 원문을 읽어 다시 그리므로 색을 입히지 않는다.
// 지금은 mermaid를 등록하지 않아 정규화 단계에서도 걸러지지만, 라이브러리에 mermaid 언어가 있어
// 누군가 등록하면 그때부터 이 목록만 남는다. 도표를 색칠하지 않는 것은 등록 여부와 무관한 결정이다.
export const EXCLUDED_LANGUAGES = new Set(['mermaid']);

// 코드 블록 머리 줄에 보이는 언어 이름. 강조 여부와 따로 정한다. gradle처럼 색을 입히지 않는 언어도
// 작성자가 적은 언어라 이름은 보이고, 목록에 없는 언어는 적은 그대로 보인다. text는 "언어 없음"과 같다.
const LANGUAGE_LABELS: Record<string, string> = {
  java: 'Java', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  tsx: 'TSX', jsx: 'JSX', yaml: 'YAML', yml: 'YAML', json: 'JSON', css: 'CSS', html: 'HTML', xml: 'XML',
  markdown: 'Markdown', md: 'Markdown', python: 'Python', py: 'Python', dockerfile: 'Dockerfile',
  bash: 'Bash', shell: 'Shell', sh: 'Shell', zsh: 'Zsh', gradle: 'Gradle', kotlin: 'Kotlin', sql: 'SQL', c: 'C'
};
const UNNAMED_LANGUAGES = new Set(['', 'text', 'plaintext', 'txt']);

export function codeLanguageLabel(lang: string): string {
  const key = lang.trim().toLowerCase();
  if (UNNAMED_LANGUAGES.has(key)) return '';
  return LANGUAGE_LABELS[key] ?? lang.trim();
}

// markdown-it의 highlight 옵션에 맞춘 반환값이다. 빈 문자열을 주면 markdown-it이 원문을 이스케이프한다.
// 완성된 <pre> 블록을 돌려주면 markdown-it이 그것을 그대로 쓰면서 language-* 클래스를 떼어 내고,
// 그러면 mermaid-render.ts의 `code.language-mermaid` 선택자가 도표를 찾지 못한다. 안쪽 토큰만 돌려준다.
export function highlightCode(code: string, lang: string): string {
  if (!lang || EXCLUDED_LANGUAGES.has(lang.toLowerCase())) return '';
  // 모르는 언어는 plaintext로 정규화된다. plaintext는 토큰을 만들지 않아 이스케이프한 원문과 같으므로
  // markdown-it에 맡기고 여기서 손대지 않는다.
  const name = highlighter.normalizeLanguage(lang);
  if (name === 'plaintext') return '';
  return renderNodesToHtml(renderTokens(highlighter.tokenize(code, { lang: name }).tokens));
}
