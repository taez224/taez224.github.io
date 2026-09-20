// 표식 도안에서 파비콘 SVG와 iOS 터치 아이콘 PNG를 만든다. src/lib/mark.ts의 격자를 고친 뒤 `node scripts/make-mark.ts`로 한 번 실행한다.
// PNG는 손으로 고칠 수 없고 도안과 어긋나면 눈에 띄지 않으므로, 두 파일 모두 생성물로 두고 tests/mark.test.ts가 격자와 대조한다.
// 래스터라이저를 거치지 않고 점을 직접 채운다. 칸 경계에 중간색이 섞이면 표식 색이 두 가지보다 늘어난다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FAVICON_GRID, markPath } from '../src/lib/mark.ts';
import { MARK } from '../src/lib/palette.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
// 180은 16의 배수가 아니다. 가운데 160px만 도안에 주고 사방 10px은 여백으로 둔다.
const TOUCH_SIZE = 180, SCALE = 10, MARGIN = 10;
const rgb = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

const size = FAVICON_GRID.length;
// 도안은 네 귀를 비워 도장 모서리를 낸다. 종이색 바탕을 통째로 깔면 그 빈칸까지 칠해져 어두운 탭 줄에서 밝은 점 네 개가 남는다.
// 그래서 바탕 없이 표식과 글자를 따로 칠한다. 글자는 격자의 빈칸에서 네 귀를 뺀 나머지다.
const isCorner = (x: number, y: number) => (x === 0 || x === size - 1) && (y === 0 || y === size - 1);
const letters = FAVICON_GRID.map((row, y) => [...row].map((cell, x) => (cell === '.' && !isCorner(x, y) ? '#' : '.')).join(''));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="${MARK.red}" d="${markPath(FAVICON_GRID)}"/><path fill="${MARK.paper}" d="${markPath(letters)}"/></svg>\n`;
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg);

const [paper, red] = [rgb(MARK.paper), rgb(MARK.red)];
const pixels = Buffer.alloc(TOUCH_SIZE * TOUCH_SIZE * 3);
for (let y = 0; y < TOUCH_SIZE; y += 1) {
  for (let x = 0; x < TOUCH_SIZE; x += 1) {
    const gridX = Math.floor((x - MARGIN) / SCALE), gridY = Math.floor((y - MARGIN) / SCALE);
    const inside = gridX >= 0 && gridX < size && gridY >= 0 && gridY < size;
    const color = inside && FAVICON_GRID[gridY][gridX] === '#' ? red : paper;
    pixels.set(color, (y * TOUCH_SIZE + x) * 3);
  }
}
await sharp(pixels, { raw: { width: TOUCH_SIZE, height: TOUCH_SIZE, channels: 3 } }).png().toFile(`${root}public/apple-touch-icon.png`);
console.log('public/favicon.svg, public/apple-touch-icon.png를 다시 만들었다.');
