const THEMES = [
  { id: 'minimal-dark',        name: '极简 暗' },
  { id: 'minimal-light',       name: '极简 亮' },
  { id: 'glass-dark',          name: '毛玻璃 暗' },
  { id: 'glass-light',         name: '毛玻璃 亮' },
  { id: 'starry',              name: '星夜' },
  { id: 'warm-healing',        name: '暖光治愈' },
  { id: 'pink-healing',        name: '粉色治愈' },
  { id: 'ocean-blue',          name: '海洋蓝' },
  { id: 'ocean-white',         name: '海洋白' },
  { id: 'green-healing-light', name: '治愈绿白' },
  { id: 'mono-starfield',      name: '星砂黑白' },
  // ==== 在下面插入新玻璃主题 ====
  { id: 'frosted-aurora', name: '极光毛玻璃' },
  { id: 'liquid-nebula',  name: '液态星云' },
  { id: 'liquid-amber',   name: '液态琥珀' }
   // ==== 新增：糖果与食物色系主题 ====
  { id: 'matcha-latte',        name: '抹茶拿铁' },
  { id: 'grape-candy',         name: '葡萄水果糖' },
  { id: 'peach-gummy',         name: '水蜜桃软糖' }

];

const STORAGE_KEY = 'unrequited:theme';
const ANIM_KEY = 'unrequited:anim';

export function getThemes() {
  return THEMES.slice();
}

export function getCurrentTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (THEMES.some((t) => t.id === saved)) return saved;
  return 'minimal-dark';
}

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;

  localStorage.setItem(STORAGE_KEY, id);
  document.body.setAttribute('data-theme', id);

  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const bg =
      getComputedStyle(document.body).getPropertyValue('--color-bg-primary').trim() ||
      getComputedStyle(document.body).backgroundColor;

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
