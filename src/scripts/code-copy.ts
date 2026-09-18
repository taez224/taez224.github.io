export {};
// 코드 블록마다 복사 버튼을 붙인다. 버튼은 스크립트가 있어야 동작하므로 빌드 출력에 넣지 않고 여기서 만든다.
// 언어 이름이 없는 블록은 빌드 때 머리 줄이 없으므로, 버튼을 둘 머리 줄도 여기서 만든다.
// 동작과 모양은 헤더의 링크 복사(share.ts)와 같다. 복사하면 2초 동안 체크를, 실패하면 5초 동안 안내를 보인다.
// 복사하는 값은 code의 글자 그대로다. 강조용 span은 textContent에 섞이지 않는다.
// 아이콘은 호버 판을 그리는 작은 상자(code-copy-plate) 안에 둔다. 판을 44px 버튼 전체에 깔면 머리 줄 밖으로 넘친다.
const icon = (body: string) => `<span class="code-copy-plate"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg></span>`;
const COPY_ICON = icon('<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path>');
const DONE_ICON = icon('<path d="m5 12 5 5 9-10"></path>');
const HIDDEN_STATUS = 'code-copy-status visually-hidden';

for (const block of document.querySelectorAll<HTMLElement>('.body .code-block')) {
  const code = block.querySelector('code');
  if (!code) continue;
  let head = block.querySelector<HTMLElement>('.code-head');
  if (!head) {
    head = document.createElement('div');
    head.className = 'code-head';
    block.prepend(head);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  button.title = '코드 복사';
  button.setAttribute('aria-label', '코드 복사');
  button.innerHTML = COPY_ICON;
  // 성공은 체크 아이콘이 보여 주므로 화면 낭독기에만 알리고, 실패는 할 일을 알려야 하므로 눈에도 보인다.
  const status = document.createElement('span');
  status.className = HIDDEN_STATUS;
  status.setAttribute('role', 'status');
  head.append(status, button);

  let timer = 0;
  const reset = () => {
    window.clearTimeout(timer);
    delete button.dataset.state;
    button.innerHTML = COPY_ICON;
    status.textContent = '';
    status.className = HIDDEN_STATUS;
  };
  const settle = (state: 'done' | 'error') => {
    const failed = state === 'error';
    button.dataset.state = state;
    button.innerHTML = failed ? COPY_ICON : DONE_ICON;
    status.textContent = failed ? '복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.' : '코드를 복사했습니다.';
    status.className = failed ? 'code-copy-status' : HIDDEN_STATUS;
    window.clearTimeout(timer);
    timer = window.setTimeout(reset, failed ? 5000 : 2000);
  };
  button.addEventListener('click', async () => {
    reset();
    // 클립보드 API가 없는 환경(http 주소, 일부 내장 브라우저)도 여기서 실패로 처리된다.
    try { await navigator.clipboard.writeText(code.textContent ?? ''); settle('done'); } catch { settle('error'); }
  });
}
