import { initRouter } from './router.js';
import { initTheme } from './themeManager.js';
import { initDB } from './db.js';

async function boot() {
  initTheme();

  try {
    await initDB();
  } catch (err) {
    console.warn('DB init failed:', err);
  }

  initRouter();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => {
        console.warn('SW register failed:', e);
      });
    });
  }
}

boot();
