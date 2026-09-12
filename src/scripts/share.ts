export {};
// 공유 버튼. 손으로 쓰는 기기(hover 없음)에 공유 시트가 있으면 시트를 열고, 그 밖에는 주소를 복사한다.
// 서버가 없는 정적 사이트라 플랫폼별 공유 링크나 외부 스크립트 대신 브라우저 기능만 쓴다.
// 공유하는 값은 클릭한 시점의 현재 주소와 <head>의 제목·설명이다. fragment가 있으면 그 위치까지 함께 나간다.
// 클립보드 API가 없거나 거부되면 주소창에서 직접 복사할 수 있도록 안내한다.
const useSheet = typeof navigator.share === 'function' && window.matchMedia('(hover: none)').matches;
const idle = useSheet ? '공유' : '링크 복사';
const page = () => ({
  url: window.location.href,
  title: document.title,
  text: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || ''
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-share]')) {
  const label = button.querySelector<HTMLElement>('.share-label')!;
  const control = button.closest<HTMLElement>('[data-share-control]')!;
  const feedback = control.querySelector<HTMLElement>('[data-share-feedback]')!;
  // 상자 안에 글자가 들어갈 자리가 없어 이름은 숨긴 텍스트와 툴팁이 맡는다.
  const setLabel = (text: string) => { label.textContent = text; button.title = text; };
  setLabel(idle);
  control.hidden = false;
  let timer = 0;
  const reset = () => {
    window.clearTimeout(timer);
    setLabel(idle);
    delete button.dataset.state;
    feedback.textContent = '';
    feedback.classList.add('visually-hidden');
    feedback.style.transform = '';
  };
  const settle = (text: string, state: string) => {
    setLabel(text);
    button.dataset.state = state;
    const failed = state === 'error';
    feedback.textContent = failed ? '복사하지 못했습니다.\n주소창에서 링크를 복사해 주세요.' : '링크를 복사했습니다.';
    feedback.classList.toggle('visually-hidden', !failed);
    if (failed) {
      // 헤더 오른쪽 끝에 붙어 있어 좁은 화면에서 안내가 화면 밖으로 나가는 만큼만 옮긴다.
      const { left, right } = feedback.getBoundingClientRect();
      const shift = Math.max(0, 16 - left) - Math.max(0, right - window.innerWidth + 16);
      feedback.style.transform = `translateX(${shift}px)`;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(reset, failed ? 5000 : 2000);
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); settle('복사됨', 'done'); } catch { settle('복사 실패', 'error'); }
  };
  button.addEventListener('click', async () => {
    reset();
    const { url, title, text } = page();
    if (!useSheet) { await copy(url); return; }
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      // 시트를 닫으면 AbortError가 난다. 실패가 아니므로 아무것도 하지 않는다.
      // 그 밖의 거부(내장 브라우저의 권한 정책 등)는 시트 대신 주소를 복사해 준다.
      if (!(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) await copy(url);
    }
  });
}
