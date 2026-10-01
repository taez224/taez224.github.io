// 사이트의 제보 링크가 여는 이슈 폼 주소를 만든다. 폼은 .github/ISSUE_TEMPLATE/feedback.yml이고, 쿼리의 키는 그 폼의 칸 id다.
// 링크 문구는 폼의 이름과 같게 둔다. 눌러서 도착한 페이지의 이름이 링크와 같아야 독자가 제대로 왔다고 안다.
// tests/feedback.test.ts가 폼 파일과 이 값들이 같은지 검사한다.
export const FEEDBACK_LABEL = '오류·의견 보내기';
export const FEEDBACK_TEMPLATE = 'feedback.yml';
const NEW_ISSUE = 'https://github.com/taez224/taez224.github.io/issues/new';

// page는 독자가 보던 페이지의 전체 주소다. 주소를 알 수 없는 페이지(찾을 수 없는 페이지)는 null을 주어 칸을 비워 둔다.
// 주소만 넣는다. vault 경로 같은 내부 값은 공개 이슈에 남으므로 넣지 않는다.
// 제목은 채우지 않는다. 글 제목을 채우면 독자가 그대로 보내 같은 글의 제보가 모두 같은 제목이 되고, 제목에 증상이 남지 않는다.
// 폼에도 기본 제목이 없어, GitHub이 제목 없이는 제출을 막고 독자가 한 줄로 증상을 적게 된다.
export function feedbackUrl(page: string | null): string {
  const query = [['template', FEEDBACK_TEMPLATE], ...(page ? [['page', page]] : [])];
  return `${NEW_ISSUE}?${query.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}
