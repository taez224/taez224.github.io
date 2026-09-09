import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isPathInside, decodedAssetTargetPath, resolveDevAssetRequest, mimeTypeFor } from '../src/integrations/vault-assets.mjs';

test('isPathInside accepts a nested path and the root itself, rejects anything that escapes', () => {
  const root = '/vault';
  assert.equal(isPathInside(root, '/vault/_attachments/x.svg'), true);
  assert.equal(isPathInside(root, '/vault'), true);
  assert.equal(isPathInside(root, '/vault/../etc/passwd'), false);
  assert.equal(isPathInside(root, '/etc/passwd'), false);
  assert.equal(isPathInside(root, '/vaultsibling/x.svg'), false);
});

test('decodedAssetTargetPath decodes each URL segment once to recover the real filesystem filename', () => {
  // A Korean-named attachment: garden.mjs percent-encodes each path segment
  // independently when it builds the dist-relative destination string.
  const encodedSegment = encodeURIComponent('한글 그림.svg');
  const destination = `assets/vault/_attachments/${encodedSegment}`;
  const target = decodedAssetTargetPath('/dist', destination);
  assert.equal(target, path.join('/dist', 'assets/vault/_attachments/한글 그림.svg'));
});

test('resolveDevAssetRequest matches the exact encoded destination behind the base path', () => {
  const encodedSegment = encodeURIComponent('한글 그림.svg');
  const assetCopies = new Map([
    ['_attachments/한글 그림.svg', `assets/vault/_attachments/${encodedSegment}`],
    ['_attachments/reviewed.svg', 'assets/vault/_attachments/reviewed.svg']
  ]);
  const found = resolveDevAssetRequest({
    assetCopies,
    base: '/obsidian',
    pathname: `/obsidian/assets/vault/_attachments/${encodedSegment}`
  });
  assert.equal(found, '_attachments/한글 그림.svg');
});

test('resolveDevAssetRequest matches even when Vite has already stripped the base from req.url', () => {
  // Vite mounts server.middlewares under the configured base and strips it
  // from req.url before any middleware runs, so in real dev usage the
  // pathname a middleware sees never has the base prefix. The matcher must
  // still resolve this the same as the base-prefixed form, so dev and
  // production agree on what a given URL serves.
  const assetCopies = new Map([['_attachments/reviewed.svg', 'assets/vault/_attachments/reviewed.svg']]);
  assert.equal(resolveDevAssetRequest({ assetCopies, base: '/obsidian', pathname: '/assets/vault/_attachments/reviewed.svg' }), '_attachments/reviewed.svg');
});

test('resolveDevAssetRequest returns null for paths outside the reviewed asset list or the asset route', () => {
  const assetCopies = new Map([['_attachments/reviewed.svg', 'assets/vault/_attachments/reviewed.svg']]);
  assert.equal(resolveDevAssetRequest({ assetCopies, base: '/obsidian', pathname: '/obsidian/assets/vault/_attachments/unreviewed.svg' }), null);
  assert.equal(resolveDevAssetRequest({ assetCopies, base: '/obsidian', pathname: '/obsidian/_attachments/reviewed.svg' }), null);
  assert.equal(resolveDevAssetRequest({ assetCopies, base: '/obsidian', pathname: '/_attachments/reviewed.svg' }), null);
});

test('mimeTypeFor covers every reviewed image extension', () => {
  assert.equal(mimeTypeFor('x.svg'), 'image/svg+xml');
  assert.equal(mimeTypeFor('x.png'), 'image/png');
  assert.equal(mimeTypeFor('x.jpg'), 'image/jpeg');
  assert.equal(mimeTypeFor('x.jpeg'), 'image/jpeg');
  assert.equal(mimeTypeFor('x.gif'), 'image/gif');
  assert.equal(mimeTypeFor('x.webp'), 'image/webp');
  assert.equal(mimeTypeFor('x.avif'), 'image/avif');
  assert.equal(mimeTypeFor('x.unknown'), 'application/octet-stream');
});
