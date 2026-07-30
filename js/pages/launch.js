import { db } from '../db.js';
import { pick, haptic } from '../utils.js';
import { navigate } from '../router.js';

// ==================== 经典塔罗数据与 HTML ====================
const TAROT_CARDS = [
  {
    name: '星星', subtitle: 'THE STAR',
    svg: `
      <circle cx="55" cy="45" r="1.5" fill="currentColor" opacity="0.9"/>
      <circle cx="95" cy="55" r="2" fill="currentColor" opacity="0.9"/>
      <circle cx="45" cy="70" r="1.2" fill="currentColor" opacity="0.7"/>
      <circle cx="105" cy="90" r="1.5" fill="currentColor" opacity="0.8"/>
      <circle cx="35" cy="105" r="1" fill="currentColor" opacity="0.6"/>
      <path d="M75 55 l3 8 l8 1 l-6 5 l2 8 l-7 -4 l-7 4 l2 -8 l-6 -5 l8 -1 z" fill="currentColor"/>
      <path d="M60 100 q15 -8 30 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      <path d="M55 115 q20 -6 40 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
    `
  },
  {
    name: '月亮', subtitle: 'THE MOON',
    svg: `
      <path d="M78 45 a30 30 0 1 0 18 55 a24 24 0 1 1 -18 -55 z" fill="currentColor" opacity="0.92"/>
      <circle cx="45" cy="55" r="1" fill="currentColor" opacity="0.7"/>
      <circle cx="105" cy="80" r="1" fill="currentColor" opacity="0.6"/>
      <path d="M50 125 q25 -10 50 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    `
  },
  {
    name: '太阳', subtitle: 'THE SUN',
    svg: `
      <circle cx="75" cy="80" r="20" fill="currentColor" opacity="0.92"/>
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="75" y1="42" x2="75" y2="52"/>
        <line x1="75" y1="108" x2="75" y2="118"/>
        <line x1="37" y1="80" x2="47" y2="80"/>
        <line x1="103" y1="80" x2="113" y2="80"/>
        <line x1="48" y1="53" x2="55" y2="60"/>
        <line x1="95" y1="100" x2="102" y2="107"/>
        <line x1="48" y1="107" x2="55" y2="100"/>
        <line x1="95" y1="60" x2="102" y2="53"/>
      </g>
    `
  },
  {
    name: '恋人', subtitle: 'THE LOVERS',
    svg: `
      <circle cx="55" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M46 76 q9 16 18 0 v40 h-18 z" fill="currentColor" opacity="0.5"/>
      <circle cx="95" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M86 76 q9 16 18 0 v40 h-18 z" fill="currentColor" opacity="0.5"/>
      <path d="M75 92 l-6 -7 a4 4 0 0 1 6 -3 a4 4 0 0 1 6 3 z" fill="currentColor"/>
    `
  },
  {
    name: '愚人', subtitle: 'THE FOOL',
    svg: `
      <circle cx="75" cy="55" r="8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M70 65 l-14 28 l9 5 l10 -18 l10 18 l9 -5 l-14 -28" fill="currentColor" opacity="0.55"/>
      <line x1="65" y1="102" x2="60" y2="128" stroke="currentColor" stroke-width="1.3"/>
      <line x1="85" y1="102" x2="90" y2="128" stroke="currentColor" stroke-width="1.3"/>
      <path d="M100 62 l14 -8 v10 z" fill="currentColor"/>
    `
  },
  {
    name: '女祭司', subtitle: 'THE HIGH PRIESTESS',
    svg: `
      <line x1="52" y1="50" x2="52" y2="130" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <line x1="98" y1="50" x2="98" y2="130" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <circle cx="75" cy="60" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M64 78 l11 -4 l11 4 v50 h-22 z" fill="currentColor" opacity="0.5"/>
      <circle cx="75" cy="42" r="3" fill="currentColor"/>
    `
  },
  {
    name: '世界', subtitle: 'THE WORLD',
    svg: `
      <ellipse cx="75" cy="85" rx="30" ry="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <circle cx="75" cy="85" r="10" fill="currentColor" opacity="0.85"/>
      <path d="M75 50 l3 6 l-3 -1 l-3 1 z" fill="currentColor" opacity="0.6"/>
      <path d="M75 120 l3 -6 l-3 1 l-3 -1 z" fill="currentColor" opacity="0.6"/>
    `
  },
  {
    name: '隐者', subtitle: 'THE HERMIT',
    svg: `
      <path d="M75 45 a10 10 0 0 1 10 10 v20 l10 40 h-40 l10 -40 v-20 a10 10 0 0 1 10 -10 z" fill="currentColor" opacity="0.7"/>
      <circle cx="75" cy="52" r="4" fill="var(--color-bg-primary)"/>
      <circle cx="98" cy="80" r="5" fill="currentColor"/>
      <circle cx="98" cy="80" r="2.5" fill="var(--color-bg-primary)"/>
    `
  }
];

function cardHTML(card) {
  return `
    <div class="lc-wrap">
      <svg class="lc-card" viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lc-border" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.6"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0.2"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="146" height="196" rx="10" fill="none"
              stroke="url(#lc-border)" stroke-width="1.4"/>
        <rect x="8" y="8" width="134" height="184" rx="7" fill="none"
              stroke="currentColor" stroke-width="0.5" opacity="0.35"/>
        ${card.svg}
        <text x="75" y="158" text-anchor="middle" font-size="10"
              fill="currentColor" opacity="0.75" letter-spacing="2">${card.name}</text>
        <text x="75" y="174" text-anchor="middle" font-size="5.5"
              fill="currentColor" opacity="0.45" letter-spacing="2.5">${card.subtitle}</text>
      </svg>
    </div>
  `;
}

// ==================== 运行时控制状态 ====================
let timers = [];
let clickTarget = null;
let clickHandler = null;
let didGo = false;
let ecgAnimationFrameId = null; // 新增：保存心电图进度条渲染帧

// ==================== 入口渲染路由 ====================
export async function render(root) {
  let launchStyle = 'classic';
  try {
    const row = await db.settings.get('launchStyle');
    if (row) launchStyle = row.value;
  } catch (e) {
    console.warn('Failed to load launchStyle from DB:', e);
  }

  if (launchStyle === 'ecg') {
    renderECGStyle(root);
  } else {
    renderClassicStyle(root);
  }
}

// ==================== 动画风格1：经典塔罗 ====================
function renderClassicStyle(root) {
  const card = pick(TAROT_CARDS);

  root.innerHTML = `
    <div class="launch-page page classic-theme" id="launch-root">
      <div class="lp-bg"></div>
      <div class="lp-content">
        ${cardHTML(card)}
        <div class="lp-quote" id="lp-quote">&nbsp;</div>
        <div class="lp-hint" id="lp-hint">轻 触 继 续</div>
      </div>
      <style>
        .launch-page.classic-theme {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
        }
        .lp-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 30%, var(--color-bg-primary) 90%);
          pointer-events: none;
        }
        .lp-content {
          position: relative;
          display: flex; flex-direction: column;
          align-items: center; gap: 28px;
          padding: 32px;
        }
        .lc-wrap {
          width: 132px; height: 176px;
          color: var(--color-accent);
          perspective: 900px;
        }
        .lc-card {
          width: 100%; height: 100%;
          display: block;
          filter: drop-shadow(0 10px 30px var(--color-shadow));
          animation: launchFlip 1.5s cubic-bezier(.2,.7,.2,1) both;
          transform-origin: center;
        }
        .lp-quote {
          max-width: 300px;
          text-align: center;
          font-size: 14px;
          line-height: 2;
          letter-spacing: 1px;
          color: var(--color-text-secondary);
          opacity: 0;
          animation: launchQuoteIn 1s ease 0.9s forwards;
          min-height: 3em;
        }
        .lp-hint {
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--color-text-tertiary);
          opacity: 0;
          animation: launchQuoteIn 0.8s ease 2s forwards;
        }
      </style>
    </div>
  `;

  // 加载治愈语
  fetch('./data/healingQuotes.json')
    .then((r) => r.json())
    .catch(() => ['在你看不见的地方，光也在发生'])
    .then((quotes) => {
      const el = document.getElementById('lp-quote');
      if (el) el.textContent = pick(quotes);
    });

  const go = () => {
    if (didGo) return;
    didGo = true;
    haptic(6);
    navigate('/home');
  };

  clickTarget = document.getElementById('launch-root');
  clickHandler = go;
  clickTarget.addEventListener('click', clickHandler);

  timers.push(setTimeout(go, 3000));
}

// ==================== 动画风格2：心跳播放器 ====================
function renderECGStyle(root) {
  root.innerHTML = `
    <div class="launch-page page ecg-theme" id="launch-root">
      <div class="lp-bg"></div>
      <div class="mp3-player-container">
        
        <!-- 播放器主体 -->
        <div class="mp3-player">
          <!-- 播放器顶部状态栏 -->
          <div class="mp3-header">
            <span class="mp3-status-dot"></span>
            <span class="mp3-status-text">STATUS: CONNECTED</span>
          </div>
          
          <!-- 播放器显示屏 -->
          <div class="mp3-screen">
            <!-- 心电图监视器 -->
            <div class="ecg-monitor">
              <svg class="ecg-svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                <defs>
                  <pattern id="ecg-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.08"/>
                  </pattern>
                </defs>
                <!-- 网格背景 -->
                <rect width="100%" height="100%" fill="url(#ecg-grid)" />
                
                <!-- 滚动的心电图（无缝循环波形） -->
                <g class="ecg-path-group">
                  <path d="M 0 30 L 30 30 Q 35 24 40 30 T 45 30 L 55 30 L 58 35 L 62 5 L 67 48 L 71 30 L 78 30 Q 84 20 90 30 T 96 30 L 200 30 M 200 30 L 230 30 Q 235 24 240 30 T 245 30 L 255 30 L 258 35 L 262 5 L 267 48 L 271 30 L 278 30 Q 284 20 290 30 T 296 30 L 400 30" 
                        fill="none" stroke="var(--color-accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
                </g>
              </svg>
            </div>
            
            <!-- 治愈系文案 -->
            <div class="mp3-quote-area">
              <p class="mp3-quote" id="lp-quote">&nbsp;</p>
            </div>
          </div>
          
          <!-- 播放器底部控制区 -->
          <div class="mp3-controls">
            <!-- 进度显示 -->
            <div class="mp3-time-info">
              <span class="mp3-time-curr" id="mp3-timer">00:00</span>
              <div class="mp3-progress-track">
                <div class="mp3-progress-bar" id="mp3-progress"></div>
              </div>
              <span class="mp3-time-total">00:03</span>
            </div>
            
            <!-- 拟物控制按钮 -->
            <div class="mp3-buttons">
              <button class="mp3-btn prev" type="button" aria-label="上一曲">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6L18 18V6z"/>
                </svg>
              </button>
              <button class="mp3-btn play-pause active" type="button" id="mp3-play-btn" aria-label="播放暂停">
                <div class="play-icon hidden">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <div class="pause-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                </div>
              </button>
              <button class="mp3-btn next" type="button" aria-label="下一曲">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6zm9-12v12h2V6z"/>
                </svg>
              </button>
            </div>
          </div>
          
        </div>
        
        <div class="lp-hint">轻 触 屏 幕 进 入</div>
      </div>
      
      <style>
        .launch-page.ecg-theme {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          background-color: var(--color-bg-primary);
          color: var(--color-text-primary);
          user-select: none;
          -webkit-user-select: none;
        }
        .lp-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 20%, var(--color-bg-primary) 95%);
          pointer-events: none;
        }
        
        /* 播放器容器 */
        .mp3-player-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 85%;
          max-width: 310px;
          animation: fadeIn 0.8s ease-out;
        }
        
        /* 播放器面板 */
        .mp3-player {
          width: 100%;
          background: var(--color-bg-secondary);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 20px 40px var(--color-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        /* 状态指示栏 */
        .mp3-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 4px;
        }
        .mp3-status-dot {
          width: 6px;
          height: 6px;
          background-color: var(--color-accent);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--color-accent);
          animation: breath 2s infinite ease-in-out;
        }
        .mp3-status-text {
          font-size: 9px;
          font-family: monospace;
          letter-spacing: 1.5px;
          color: var(--color-text-tertiary);
        }
        
        /* 屏幕部分 */
        .mp3-screen {
          background-color: rgba(0, 0, 0, 0.25);
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.15);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
        }
        
        /* 心电网格与路径 */
        .ecg-monitor {
          width: 100%;
          height: 60px;
          position: relative;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.15);
          border-radius: 6px;
          color: var(--color-text-tertiary);
          mask-image: linear-gradient(to right, transparent, white 15%, white 85%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, white 15%, white 85%, transparent);
        }
        .ecg-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .ecg-path-group {
          transform-origin: left center;
          animation: ecg-scroll 3s linear infinite;
        }
        @keyframes ecg-scroll {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        
        /* 治愈文案区 */
        .mp3-quote-area {
          min-height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
        }
        .mp3-quote {
          font-size: 13.5px;
          line-height: 1.8;
          text-align: center;
          color: var(--color-text-secondary);
          letter-spacing: 0.8px;
          margin: 0;
          animation: launchQuoteIn 0.8s ease forwards;
        }
        
        /* 进度条与播放按钮 */
        .mp3-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mp3-time-info {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          font-family: monospace;
          color: var(--color-text-tertiary);
        }
        .mp3-progress-track {
          flex: 1;
          height: 3px;
          background-color: var(--color-bg-tertiary);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }
        .mp3-progress-bar {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 0%;
          background-color: var(--color-accent);
          border-radius: 2px;
          box-shadow: 0 0 6px var(--color-accent);
        }
        .mp3-buttons {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 24px;
        }
        .mp3-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s;
        }
        .mp3-btn:active {
          transform: scale(0.9);
          background: rgba(255, 255, 255, 0.08);
        }
        .mp3-btn.prev, .mp3-btn.next {
          width: 32px; height: 32px;
        }
        .mp3-btn.play-pause {
          width: 44px; height: 44px;
          color: var(--color-accent);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }
        .mp3-btn.play-pause.active {
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.05);
        }
        
        .lp-hint {
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--color-text-tertiary);
          opacity: 0;
          animation: launchQuoteIn 0.8s ease 1s forwards;
          text-align: center;
          margin-top: 4px;
        }
        .hidden {
          display: none !important;
        }
      </style>
    </div>
  `;

  // 1. 加载治愈语
  fetch('./data/healingQuotes.json')
    .then((r) => r.json())
    .catch(() => ['在你看不见的地方，光也在发生'])
    .then((quotes) => {
      const el = document.getElementById('lp-quote');
      if (el) el.textContent = pick(quotes);
    });

  // 2. 动画时间参数 (自动进入 3000ms 计时器逻辑)
  const startTime = Date.now();
  const duration = 3000;
  const progressEl = document.getElementById('mp3-progress');
  const timerEl = document.getElementById('mp3-timer');
  const playBtn = document.getElementById('mp3-play-btn');

  let isPlaying = true;
  let totalPausedTime = 0;
  let pauseStartTime = null;

  // 定帧刷新函数
  const updateProgress = () => {
    if (!isPlaying) return;

    const now = Date.now();
    const elapsed = now - startTime - totalPausedTime;
    const progress = Math.min((elapsed / duration) * 100, 100);

    if (progressEl) {
      progressEl.style.width = `${progress}%`;
    }

    const elapsedSeconds = Math.floor(elapsed / 1000);
    const formattedTime = `00:${String(elapsedSeconds).padStart(2, '0')}`;
    
    if (timerEl) {
      timerEl.textContent = formattedTime;
    }

    if (elapsed >= duration) {
      go();
    } else {
      ecgAnimationFrameId = requestAnimationFrame(updateProgress);
    }
  };

  ecgAnimationFrameId = requestAnimationFrame(updateProgress);

  const go = () => {
    if (didGo) return;
    didGo = true;
    if (ecgAnimationFrameId) {
      cancelAnimationFrame(ecgAnimationFrameId);
    }
    haptic(6);
    navigate('/home');
  };

  // 可交互：点击播放暂停（暂停时可以停下来阅读文案，不强制跳转）
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止整个屏幕的跳转点击
      haptic(3);
      isPlaying = !isPlaying;
      
      const playIcon = playBtn.querySelector('.play-icon');
      const pauseIcon = playBtn.querySelector('.pause-icon');
      
      if (isPlaying) {
        playBtn.classList.add('active');
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        // 恢复播放：计算暂停累加时长
        if (pauseStartTime) {
          totalPausedTime += (Date.now() - pauseStartTime);
          pauseStartTime = null;
        }
        ecgAnimationFrameId = requestAnimationFrame(updateProgress);
      } else {
        playBtn.classList.remove('active');
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        // 挂起计时
        pauseStartTime = Date.now();
        if (ecgAnimationFrameId) {
          cancelAnimationFrame(ecgAnimationFrameId);
        }
      }
    });
  }

  // 绑定背景空白跳转
  clickTarget = document.getElementById('launch-root');
  clickHandler = go;
  clickTarget.addEventListener('click', clickHandler);
}

// ==================== 统一的销毁逻辑 ====================
export function destroy() {
  if (ecgAnimationFrameId) {
    cancelAnimationFrame(ecgAnimationFrameId);
    ecgAnimationFrameId = null;
  }
  timers.forEach(clearTimeout);
  timers = [];
  if (clickTarget && clickHandler) {
    clickTarget.removeEventListener('click', clickHandler);
  }
  clickTarget = null;
  clickHandler = null;
  didGo = false;
}

