const routes = {
  '/': () => import('./pages/launch.js'),
  '/home': () => import('./pages/home.js'),
  '/cards': () => import('./pages/cards.js'),
  '/chat': () => import('./pages/chat.js'),
  '/characters': () => import('./pages/characters.js'),
  '/decks': () => import('./pages/decks.js'),
  '/settings': () => import('./pages/settings/index.js'),
  '/divination': () => import('./pages/divination/index.js'),
  '/drift': () => import('./pages/drift.js'),
  '/tutorial': () => import('./pages/tutorial.js')
};

let currentPage = null;
let currentHash = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const params = {};
  if (qs) {
    qs.split('&').forEach((pair) => {
      if (!pair) return;
      const [k, v = ''] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    });
  }
  return { path: path || '/', params };
}

async function render() {
  const hash = location.hash || '#/';
  if (hash === currentHash) return;
  currentHash = hash;

  const { path, params } = parseHash();
  const loader = routes[path] || routes['/home'];
  const app = document.getElementById('app');

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) {}
  }

  try {
    const mod = await loader();
    app.innerHTML = '';
    currentPage = mod;
    if (typeof mod.render === 'function') await mod.render(app, params);
  } catch (err) {
    console.error('Route load failed:', err);
    app.innerHTML = `<div style="padding:2rem;color:var(--color-text-secondary);text-align:center;">
      页面加载失败，请刷新重试<br><small style="opacity:.6">${(err && err.message) || ''}</small>
    </div>`;
  }
}

export function navigate(path) {
  if (path.startsWith('#')) path = path.slice(1);
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

export function goBack(fallback = '/home') {
  if (history.length > 1) history.back();
  else navigate(fallback);
}

export function initRouter() {
  window.addEventListener('hashchange', render);
  render();
}
