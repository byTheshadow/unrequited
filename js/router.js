const routes = {
  '/': () => import('./pages/launch.js'),
  '/home': () => import('./pages/home.js'),
};

let currentPage = null;
let currentPath = null;

async function render() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const path = hash.split('?')[0];

  if (path === currentPath) return;
  currentPath = path;

  const loader = routes[path] || routes['/home'];
  const app = document.getElementById('app');

  if (currentPage && typeof currentPage.destroy === 'function') {
    try { currentPage.destroy(); } catch (e) { /* ignore */ }
  }

  try {
    const mod = await loader();
    app.innerHTML = '';
    currentPage = mod;
    if (typeof mod.render === 'function') mod.render(app);
  } catch (err) {
    console.error('Route load failed:', err);
    app.innerHTML = `<div style="padding:2rem;color:var(--color-text-secondary);text-align:center;">
      页面加载失败，请刷新重试
    </div>`;
  }
}

export function navigate(path) {
  if (path.startsWith('#')) path = path.slice(1);
  if (location.hash === '#' + path) {
    render();
  } else {
    location.hash = path;
  }
}

export function initRouter() {
  window.addEventListener('hashchange', render);
  render();
}
