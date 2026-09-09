import path from 'node:path';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vaultAssets from './src/integrations/vault-assets.mjs';
import config from './config.json' with { type: 'json' };

// 썸네일 같은 vault 자산은 프로젝트 루트 밖에 있다. dev 서버의 파일 접근 허용 목록에 vault를 넣는다.
const vaultRoot = path.resolve(process.env.GARDEN_VAULT_ROOT ?? '../obsidian');

export default defineConfig({
  site: 'https://taez224.github.io',
  base: config.basePath || '/',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap(), vaultAssets()],
  vite: { server: { fs: { allow: ['.', vaultRoot] } } }
});
