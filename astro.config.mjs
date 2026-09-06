import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import config from './config.json' with { type: 'json' };

export default defineConfig({
  site: 'https://taez224.github.io',
  base: config.basePath,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()]
});
