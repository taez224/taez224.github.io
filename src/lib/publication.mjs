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

function sameText(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase() === String(right ?? '').trim().toLocaleLowerCase();
}

function sourceHostname(source) {
  try {
    const url = new URL(String(source ?? '').trim());
    return url.protocol === 'https:' ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

// A matching publication rule deliberately requires a valid source on one of
// that rule's hosts. This keeps a display label from publishing arbitrary or
// missing source URLs as trusted external articles.
export function externalPublicationFor(config, relativePath, meta = {}) {
  if (!relativePath.startsWith('20_Projects/blog/') || String(meta.status ?? '') !== 'published') return '';
  const source = String(meta.source ?? '').trim();
  const hostname = sourceHostname(source);
  const publication = String(meta.publication ?? '').trim();
  for (const rule of config.externalPublications ?? []) {
    const hosts = Array.isArray(rule.hosts) ? rule.hosts.map((host) => String(host).trim().toLowerCase()) : [];
    const publications = Array.isArray(rule.publications) ? rule.publications : [];
    const hostMatched = hostname && hosts.includes(hostname);
    const publicationMatched = publications.some((label) => sameText(label, publication));
    if (!hostMatched && !publicationMatched) continue;
    if (!hostname || !hosts.includes(hostname)) {
      throw new Error(`External publication ${rule.name} requires a valid source URL on a configured host: ${relativePath}`);
    }
    return String(rule.name ?? '');
  }
  return '';
}

function isDevelopmentNote(relativePath, folder) {
  return pathMatches(relativePath, folder) && relativePath.endsWith('.md')
    && !relativePath.includes('\\')
    && !relativePath.split('/').some((part) => part.startsWith('_') || part.startsWith('.'));
}

export function validatePublicationConfig(config) {
  for (const rule of config.externalPublications ?? []) {
    if (!rule || typeof rule !== 'object' || !String(rule.name ?? '').trim()
      || !Array.isArray(rule.hosts) || !rule.hosts.length
      || !Array.isArray(rule.publications) || !rule.publications.length
      || rule.hosts.some((host) => typeof host !== 'string' || !host.trim() || host.includes('/') || host.includes(':'))
      || rule.publications.some((publication) => typeof publication !== 'string' || !publication.trim())) {
      throw new Error(`Invalid external publication rule: ${JSON.stringify(rule)}`);
    }
  }
  for (const asset of config.assets ?? []) {
    if (typeof asset !== 'string' || asset.startsWith('/') || asset.includes('\\') || asset.split('/').some((part) => part === '..' || part === '.') || isExcluded(config, asset) || !/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(asset)) {
      throw new Error(`Invalid reviewed image asset: ${asset}`);
    }
  }
  for (const rule of config.include) {
    if (!pathMatches(rule.path, developmentRoot)) continue;
    const wholeFolder = rule.mode === 'all' && rule.files === undefined;
    const fileList = Array.isArray(rule.files) && rule.mode === undefined;
    if (!developmentFolders.has(rule.path) || !(wholeFolder || fileList) || rule.statuses || rule.types) {
      throw new Error(`Development publication requires mode all or a file list in Concepts, Troubleshooting or Tools: ${rule.path}`);
    }
    for (const file of rule.files ?? []) {
      if (typeof file !== 'string' || !isDevelopmentNote(file, rule.path)) {
        throw new Error(`Invalid development publication file: ${file}`);
      }
    }
  }
}

export function isExcluded(config, relativePath) {
  if (developmentCategory(relativePath) && relativePath.split('/').some((part) => part.startsWith('_') || part.startsWith('.'))) return true;
  return [...privateRoots, ...config.exclude].some((root) => pathMatches(relativePath, root));
}

export function isIncluded(config, relativePath, meta = {}) {
  if (isExcluded(config, relativePath)) return false;
  const rule = config.include.find((entry) => pathMatches(relativePath, entry.path));
  if (!rule) return false;
  if (pathMatches(relativePath, developmentRoot)) {
    return developmentFolders.has(rule.path) && isDevelopmentNote(relativePath, rule.path)
      && (rule.mode === 'all' || (rule.files ?? []).includes(relativePath));
  }
  if ((rule.files ?? []).includes(relativePath)) return true;
  if (rule.mode === 'all') return true;
  return (rule.statuses ?? []).includes(meta.status) || (rule.types ?? []).includes(meta.type);
}
