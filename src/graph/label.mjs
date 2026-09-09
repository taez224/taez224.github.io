// 13px 기준 글자 폭 어림. 한글 12.5, 영숫자 7.2, 그 외 4.5.
export function estimateTextWidth(line, fontSize = 13) {
  return [...line].reduce((sum, ch) => sum + (/[\u3131-\uD79D]/.test(ch) ? 12.5 : /[A-Za-z0-9]/.test(ch) ? 7.2 : 4.5), 0) * (fontSize / 13);
}

export function graphTitleLines(title, limit) {
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/).filter(Boolean)) {
    if (line && [...`${line} ${word}`].length <= limit) { line += ` ${word}`; continue; }
    if (line) lines.push(line);
    const characters = [...word];
    while (characters.length > limit) lines.push(characters.splice(0, limit).join(''));
    line = characters.join('');
  }
  if (line) lines.push(line);
  return lines;
}
