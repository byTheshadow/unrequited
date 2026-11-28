import { initRouter } from './router.js';
import { initTheme } from './themeManager.js';
import { db, initDB } from './db.js';
import * as scheduler from './lib/scheduler.js';
import * as keepAlive from './lib/keepAlive.js';
import * as githubBackup from './lib/githubBackup.js';
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

    // GitHub 自动备份：每天最多一次，不阻塞应用启动。
    void runScheduledGitHubBackup();

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

  if (keepAlive.consumeInterruptedNotice()) {
    const notice = document.createElement('aside');
    notice.className = 'keepalive-global-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.innerHTML = `
      <span class="keepalive-global-notice-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg></span>
      <span class="keepalive-global-notice-copy"><strong>保活已被打断</strong><span>后台音频已经停止，需要重新开启保活。</span></span>
      <button type="button" data-action="restart">重新开启</button>
      <button type="button" data-action="dismiss" aria-label="关闭提示">知道了</button>`;
    document.body.appendChild(notice);
    requestAnimationFrame(() => notice.classList.add('show'));
    notice.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'restart') {
        const ok = await keepAlive.start();
        await keepAlive.saveEnabled(true);
        if (ok) notice.remove();
      } else {
        notice.classList.remove('show');
        setTimeout(() => notice.remove(), 320);
      }
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => {
        console.warn('SW register failed:', e);
      });
    });
  }
}

async function runScheduledGitHubBackup() {
  try {
    const configRow = await db.settings.get('github.backup');
    const config = configRow?.value;
    if (!config?.auto || !config.repo || !config.path) return;
    const token = githubBackup.loadToken();
    if (!token) return;
    const last = Number(config.lastUploadedAt || 0);
    if (last && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const payload = await githubBackup.buildBackupPayload(db);
    const result = await githubBackup.uploadBackup({
      token,
      repo: config.repo,
      branch: config.branch || 'main',
      path: config.path,
      payload,
    });
    await db.settings.put({
      key: 'github.backup',
      value: { ...config, lastUploadedAt: result.uploadedAt },
    });
  } catch (err) {
    console.warn('GitHub auto backup skipped:', err);
  }
}

boot();

