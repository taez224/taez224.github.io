import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// 브라우저 검사는 모두 fixtures.ts의 test를 쓴다. @playwright/test에서 바로 가져오면 외부 요청 차단이 빠진 채로 실행된다.
test('every browser spec takes its test from the shared fixture', () => {
  const dir = new URL('./browser/', import.meta.url);
  const specs = readdirSync(dir).filter((name) => name.endsWith('.spec.ts'));
  assert.ok(specs.length > 0, '브라우저 검사 파일이 있다');
  for (const name of specs) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    assert.match(source, /from '\.\/fixtures\.ts'/, `${name}가 공통 픽스처를 쓴다`);
    assert.doesNotMatch(source, /from '@playwright\/test'/, `${name}가 @playwright/test를 바로 가져오지 않는다`);
  }
});
