import { initRouter } from './router.js';
import { initTheme } from './themeManager.js';
import { initDB } from './db.js';
import * as scheduler from './lib/scheduler.js';
import * as keepAlive from './lib/keepAlive.js';
import { CallManager } from './lib/callManager.js';
import { MissManager } from './lib/missManager.js';
import { runAwayChat } from './lib/groupChat.js';

async function boot() {
  initTheme();

  try {
    await initDB();

    // 初始化想念箱
    await MissManager.init();

    // 初始化全局通话管理器
    CallManager.init();

    // 初始化并启动角色主动消息调度器
    scheduler.init();

    // 群聊离场结算：每次启动，每个群每个成员各自掷一次骰
    await runAwayChat();

    // 后台保活：如果上次是开着的，等第一次用户交互时静默恢复
    // （浏览器要求音频必须由用户手势触发，所以不能直接在 boot 里 start）
    if (await keepAlive.loadEnabled()) {
      const resume = async () => {
        document.removeEventListener('pointerdown', resume);
        document.removeEventListener('keydown', resume);
        try { await keepAlive.start(); } catch (e) { /* 忽略 */ }
      };
      document.addEventListener('pointerdown', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    }
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

