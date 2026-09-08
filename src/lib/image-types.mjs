import path from 'node:path';

// 공개 자산으로 허용하는 이미지 형식. 노트 조립, 개발 서버, OG 카드가 모두 이 표를 본다.
// 형식을 늘리거나 줄일 때 한 곳만 고치면 세 경로의 판정이 같이 움직인다.
const IMAGE_MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

export function imageMimeType(filePath) {
  return IMAGE_MIME_TYPES.get(path.extname(String(filePath ?? '')).toLowerCase()) ?? null;
}

export function isImagePath(value) {
  return imageMimeType(value) !== null;
}
