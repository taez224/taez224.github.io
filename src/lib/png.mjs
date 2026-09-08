import { crc32, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// resvg가 출력하는 8-bit RGB/RGBA, 비인터레이스 PNG를 검사한다.
// 헤더뿐 아니라 모든 청크의 CRC, 끝 표시, 압축 데이터와 스캔라인까지 확인한다.
export function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;
  let width, height, channels, ended = false, dataEnded = false;
  const compressed = [];
  for (let offset = 8; offset < buffer.length;) {
    if (offset + 12 > buffer.length) return null;
    const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, end - 4);
    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) return null;
    if (offset === 8 && type !== 'IHDR') return null;
    if (compressed.length && type !== 'IDAT') dataEnded = true;
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) return null;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] || data[11] || data[12]) return null;
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      if (dataEnded) return null;
      compressed.push(data);
    } else if (type === 'IEND') {
      if (length || end !== buffer.length) return null;
      ended = true;
    } else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') return null;
    offset = end;
  }
  if (!ended || !compressed.length) return null;
  const stride = width * channels + 1, expected = stride * height;
  if (expected > 32 * 1024 * 1024) return null;
  try {
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 });
    if (pixels.length !== expected) return null;
    for (let offset = 0; offset < pixels.length; offset += stride) if (pixels[offset] > 4) return null;
    return { width, height };
  } catch {
    return null;
  }
}
