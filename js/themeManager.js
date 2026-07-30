const THEMES = [
  { id: 'minimal-dark',  name: '极简 暗' },
  { id: 'minimal-light', name: '极简 亮' },
  { id: 'glass-dark',    name: '毛玻璃 暗' },
  { id: 'glass-light',   name: '毛玻璃 亮' },
  { id: 'starry',        name: '星夜' },
  { id: 'warm-healing',  name: '暖光治愈' },
];

const STORAGE_KEY = 'unrequited:theme';
const ANIM_KEY = 'unrequited:anim';

export function getThemes() {
  return THEMES.slice();
}

export function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'minimal-dark';
}

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  localStorage.setItem(STORAGE_KEY, id);
  document.body.setAttribute('data-theme', id);

  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    meta.setAttribute('content', bg);
  });
}

export function setAnimEnabled(on) {
  localStorage.setItem(ANIM_KEY, on ? '1' : '0');
  document.body.setAttribute('data-anim', on ? 'on' : 'off');
}

export function getAnimEnabled() {
  return localStorage.getItem(ANIM_KEY) !== '0';
}

export function initTheme() {
  setTheme(getCurrentTheme());
  setAnimEnabled(getAnimEnabled());
}
