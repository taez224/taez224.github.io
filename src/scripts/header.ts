export {};
// 헤더 뒤에 깔리는 종이색 판의 농도와 흐림. 첫 화면에서는 띠 위에 글자만 얹히고, 본문이 헤더 밑으로 들어오기 시작하면 판이 짙어진다.
// 처음 16px은 판의 색을 켜지 않는다. 손가락이 살짝 스칠 때마다 헤더가 번쩍이면 읽는 데 방해가 된다.
// 스크롤마다 계산하지 않고 다음 그리기에 한 번만 맞춘다.
const header = document.querySelector<HTMLElement>('.site-header');
if (header) {
  const START = 16;
  const SPAN = 160;
  // 흐림은 색보다 먼저 다 켠다. 맨 위에서 끄는 것은 홈 지도처럼 헤더 밑에 걸친 제목을 선명하게 두려는 것이고,
  // 색과 같은 곡선으로 올리면 본문이 메뉴 뒤에 닿는 동안(휴대폰 폭에서 스크롤 20px 안팎부터) 판이 거의 투명해 글자가 메뉴와 겹쳐 보인다.
  const BLUR_SPAN = 16;
  let pending = false;
  const update = () => {
    const progress = Math.max(0, Math.min(1, (window.scrollY - START) / SPAN));
    // 양끝을 부드럽게 만드는 곡선. 선형으로 두면 판이 켜지는 순간이 눈에 띈다.
    header.style.setProperty('--header-presence', String(progress * progress * (3 - 2 * progress)));
    header.style.setProperty('--header-blur', String(Math.max(0, Math.min(1, window.scrollY / BLUR_SPAN))));
    pending = false;
  };
  window.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}
