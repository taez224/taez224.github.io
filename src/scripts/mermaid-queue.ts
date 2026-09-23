// 도표를 그리는 순서만 맡는다. 렌더러(mermaid-render.ts)와 Mermaid에 기대지 않아 모든 노트 페이지가 정적으로 가져와도 가볍다.
// 렌더러를 여기서 가져오면 도표가 없는 노트도 렌더러와 크게 보기 코드, 도표들이 함께 쓰는 조각까지 처음부터 받는다.

// 그리기 요청을 한 줄에 세운다. 초기 렌더도 이 줄의 첫 작업이므로, 모듈을 불러오는 동안 바뀐 테마도 그 뒤에 처리된다.
// 세우지 않으면 먼저 시작한 그리기가 늦게 끝나 마지막 선택을 덮는다. 하나가 실패해도 다음 요청은 받는다.
export function queueTasks(): (task: () => Promise<void>) => Promise<void> {
  let queue = Promise.resolve();
  return (task) => {
    queue = queue.then(task).catch(() => {});
    return queue;
  };
}

// 도표를 지금 화면 모드로 유지한다. 모듈을 불러오고 처음 그리는 동안에도 독자는 화면 모드를 바꿀 수 있으므로,
// 전환을 듣는 일을 불러오기보다 먼저 하고 초기 그리기까지 같은 줄에 세운다. 그리는 동안 들어온 전환은 그 뒤에 처리된다.
// 이미 그 화면으로 그렸으면 다시 그리지 않는다. 도표는 CSS 변수를 읽지 못해 색을 설정으로 받으므로 이 판정이 페이지와 어긋나면 옛 색으로 남는다.
export function keepDiagramsInTheme({ themeNow, load, draw, listen }: {
  themeNow: () => string;
  load: () => Promise<void>;
  draw: () => Promise<void>;
  listen: (handler: () => void) => void;
}): Promise<void> {
  const enqueue = queueTasks();
  let drawn: string | null = null;
  const drawNow = async () => {
    if (drawn === themeNow()) return;
    drawn = themeNow();
    await draw();
  };
  listen(() => { enqueue(drawNow); });
  return enqueue(async () => {
    await load();
    await drawNow();
  });
}
