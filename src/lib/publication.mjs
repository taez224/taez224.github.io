const developmentRoot = '30_Resources/Development';
const privateRoots = ['00_Inbox', '10_Periodic Notes', '20_Projects/job-search-2026', `${developmentRoot}/DevLog`, '_workspace'];
const developmentFolders = new Map([
  [`${developmentRoot}/Concepts`, 'Concepts'],
  [`${developmentRoot}/Troubleshooting`, 'Troubleshooting'],
  [`${developmentRoot}/Tools`, 'Tools']
]);

export function pathMatches(relativePath, configuredPath) {
  const root = configuredPath.replace(/\/$/, '');
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

export function developmentCategory(relativePath) {
  return [...developmentFolders].find(([folder]) => pathMatches(relativePath, folder))?.[1] ?? null;
}

export function validatePublicationConfig(config) {
  for (const asset of config.assets ?? []) {
    if (typeof asset !== 'string' || asset.startsWith('/') || asset.includes('\\') || asset.split('/').some((part) => part === '..' || part === '.') || isExcluded(config, asset) || !/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(asset)) {
      throw new Error(`Invalid reviewed image asset: ${asset}`);
    }
  }
  for (const rule of config.include) {
    if (!pathMatches(rule.path, developmentRoot)) continue;
    if (!developmentFolders.has(rule.path) || !Array.isArray(rule.files) || rule.mode || rule.statuses || rule.types) {
      throw new Error(`Development publication requires a reviewed file list in Concepts, Troubleshooting or Tools: ${rule.path}`);
    }
    for (const file of rule.files) {
      if (!pathMatches(file, rule.path) || file.split('/').some((part) => part === '..' || part.startsWith('_') || part.startsWith('.')) || !file.endsWith('.md')) {
        throw new Error(`Invalid development publication file: ${file}`);
      }
    }
  }
}

export function isExcluded(config, relativePath) {
  return [...privateRoots, ...config.exclude].some((root) => pathMatches(relativePath, root));
}

export function isIncluded(config, relativePath, meta = {}) {
  if (isExcluded(config, relativePath)) return false;
  const rule = config.include.find((entry) => pathMatches(relativePath, entry.path));
  if (!rule) return false;
  if (pathMatches(relativePath, developmentRoot)) {
    return Boolean(developmentCategory(relativePath)) && (rule.files ?? []).includes(relativePath);
  }
  if ((rule.files ?? []).includes(relativePath)) return true;
  if (rule.mode === 'all') return true;
  return (rule.statuses ?? []).includes(meta.status) || (rule.types ?? []).includes(meta.type);
}
