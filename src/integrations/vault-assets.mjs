import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGarden, projectPaths } from '../lib/get-garden.mjs';

const VAULT_ASSET_ROOT = 'assets/vault';

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

export function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// True when `candidate` resolves to a location strictly inside `root` (or
// equal to it). Used to make sure a reviewed asset's source never escapes
// the vault, and that its copy target never escapes the build output dir -
// both paths are derived from config-controlled strings, so this is a cheap
// guard against a future config typo (e.g. `../..`) writing outside the
// intended directory.
export function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// `assetCopies` maps a vault-relative source path to a dist-relative target
// path whose segments are already percent-encoded (see garden.mjs), because
// that target string doubles as the URL an <img src> points at. A URL and a
// filesystem path are not the same thing: for the file we write to disk to
// be found by a static file server at that URL, its name on disk has to be
// the plain (decoded) filename - e.g. an href segment `%ED%95%9C%EA%B8%80`
// must become a file literally named `한글` on disk, not a file named
// `%ED%95%9C%EA%B8%80`. This decodes each segment once to derive that path.
export function decodedAssetTargetPath(outputRoot, destinationRelativePath) {
  const segments = destinationRelativePath.split('/').map((segment) => decodeURIComponent(segment));
  return path.join(outputRoot, ...segments);
}

async function emptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyReviewedAssets({ assetCopies, vaultRoot, outputDir }) {
  const vaultAssetDir = path.join(outputDir, VAULT_ASSET_ROOT);
  // This integration owns assets/vault/ entirely: empty it first so a note
  // that stops referencing an image (or gets excluded) doesn't leave a
  // stale, no-longer-reachable copy behind in dist.
  await emptyDir(vaultAssetDir);
  for (const [sourceRelativePath, destinationRelativePath] of assetCopies) {
    const sourcePath = path.join(vaultRoot, sourceRelativePath);
    const targetPath = decodedAssetTargetPath(outputDir, destinationRelativePath);
    if (!isPathInside(vaultRoot, sourcePath)) {
      throw new Error(`Reviewed asset source escapes the vault: ${sourceRelativePath}`);
    }
    if (!isPathInside(outputDir, targetPath)) {
      throw new Error(`Reviewed asset target escapes the output directory: ${destinationRelativePath}`);
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
  }
}

// Given a request pathname (already stripped of query string) and the
// site's base path, finds the vault-relative source file to serve, or
// `null` if the request isn't for a reviewed asset. Matching is done on the
// *encoded* destination string exactly as garden.mjs produced it, so dev
// and production resolve the same URL to the same file without needing to
// re-derive encoding rules here.
//
// Vite mounts `server.middlewares` under the configured base and strips it
// from `req.url` before any middleware sees the request, so in practice
// `pathname` already arrives without the base prefix. This still strips a
// leading base itself when present, so matching is correct either way
// rather than depending on that Vite implementation detail.
export function resolveDevAssetRequest({ assetCopies, base, pathname }) {
  const trimmedBase = String(base ?? '').replace(/\/$/, '');
  const withoutBase = trimmedBase && pathname.startsWith(trimmedBase) ? pathname.slice(trimmedBase.length) : pathname;
  const prefix = `/${VAULT_ASSET_ROOT}/`;
  if (!withoutBase.startsWith(prefix)) return null;
  const destination = `${VAULT_ASSET_ROOT}/${withoutBase.slice(prefix.length)}`;
  for (const [sourceRelativePath, destinationRelativePath] of assetCopies) {
    if (destinationRelativePath === destination) return sourceRelativePath;
  }
  return null;
}

function createDevAssetMiddleware({ vaultRoot, base }) {
  return (req, res, next) => {
    const [pathname] = String(req.url ?? '').split('?');
    (async () => {
      const { assetCopies } = await getGarden();
      const sourceRelativePath = resolveDevAssetRequest({ assetCopies, base, pathname });
      if (!sourceRelativePath) {
        next();
        return;
      }
      const sourcePath = path.join(vaultRoot, sourceRelativePath);
      // Never serve outside the vault, even if assetCopies were somehow
      // tampered with between garden reassemblies.
      if (!isPathInside(vaultRoot, sourcePath)) {
        next();
        return;
      }
      try {
        const content = await fs.readFile(sourcePath);
        res.setHeader('Content-Type', mimeTypeFor(sourcePath));
        res.end(content);
      } catch {
        next();
      }
    })().catch(next);
  };
}

export default function vaultAssets() {
  let base = '';
  return {
    name: 'vault-assets',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base ?? '';
      },
      'astro:build:done': async ({ dir }) => {
        const outputDir = fileURLToPath(dir);
        const { vaultRoot } = projectPaths();
        const { assetCopies } = await getGarden();
        await copyReviewedAssets({ assetCopies, vaultRoot, outputDir });
      },
      'astro:server:setup': ({ server }) => {
        const { vaultRoot } = projectPaths();
        // Serve the same reviewed files dev builds copy on `astro build`,
        // without exposing the rest of the vault via `public/` or Vite's
        // `server.fs.allow`.
        server.middlewares.use(createDevAssetMiddleware({ vaultRoot, base }));
      }
    }
  };
}
