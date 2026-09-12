export function searchShortcut(platform = '', userAgent = '', maxTouchPoints = 0) {
  if (/Android|iPhone|iPad|iPod/i.test(`${platform} ${userAgent}`)
    || (/Mac/i.test(platform) && maxTouchPoints > 1)) return '';
  return /Mac/i.test(platform) ? '⌘K' : 'Ctrl+K';
}
