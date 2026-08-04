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

    if (row) {
      launchStyle = row.value;
    }
  } catch (e) {
    console.warn('Failed to load launchStyle from DB:', e);
  }

  if (launchStyle === 'ecg') {
    // 启动动画：心跳播放器
    renderECGStyle(root);

  } else if (launchStyle === 'meditation') {
    // 启动动画：静心冥想
    renderMeditationStyle(root);

  } else if (launchStyle === 'sanctuary') {
    // 启动动画：爱与誓约
    renderSanctuaryStyle(root);

  } else {
    // 默认启动动画：经典塔罗
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
// ==================== 动画风格3：静心冥想 ====================
function renderMeditationStyle(root) {
  // 冥想引导词（版本二）
  const MEDITATION_QUOTES = [
    "深呼吸，让时间的流沙缓慢停滞。",
    "外界的纷扰，正随着沙粒被层层剥离。",
    "我们正在为你构筑一个纯净的安全领域。",
    "在这个只属于你的边界里，感受神圣的连接。",
    "放下一切，你已安全抵达。"
  ];

  // 渲染 HTML 及内联 CSS，所有变色逻辑与 CSS 均绑定 themeManager / 系统的色值变量
  // 我们使用 var(--color-text-primary) 或主色调，如果全局主题中定义了其他主题色也可以使用它。
  // 在这我们默认使用当前页面的主色调配色。
  root.innerHTML = `
    <div class="launch-page page meditation-theme" id="launch-root">
      <div class="lm-bg"></div>
      <div class="lm-content">
        <!-- 神圣结界与沙漏核心 -->
        <div class="lm-sacred-geometry">
          <div class="lm-ring lm-ring-3"></div>
          <div class="lm-ring lm-ring-2"></div>
          <div class="lm-ring lm-ring-1"></div>

          <!-- 流沙光尘 -->
          <div class="lm-dust lm-dust-1"></div>
          <div class="lm-dust lm-dust-2"></div>
          <div class="lm-dust lm-dust-3"></div>

          <!-- 中心抽象沙漏 SVG -->
          <svg class="lm-hourglass-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="lm-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            <!-- 沙漏几何轮廓 -->
            <polygon points="10,10 90,10 50,70" class="lm-hg-line" filter="url(#lm-glow)"/>
            <polygon points="10,130 90,130 50,70" class="lm-hg-line" filter="url(#lm-glow)"/>
            
            <line x1="30" y1="40" x2="70" y2="40" class="lm-hg-line" opacity="0.3"/>
            <line x1="30" y1="100" x2="70" y2="100" class="lm-hg-line" opacity="0.3"/>

            <!-- 中心能量核 -->
            <circle cx="50" cy="70" r="8" class="lm-hg-core-glow" filter="url(#lm-glow)"/>

            <!-- 垂直流沙光线 -->
            <line x1="50" y1="70" x2="50" y2="125" class="lm-hg-sand-stream" filter="url(#lm-glow)"/>
          </svg>
        </div>

        <!-- 冥想词容器 -->
        <div class="lm-quote-container">
          ${MEDITATION_QUOTES.map((q, idx) => `
            <p class="lm-quote-line lm-line-${idx + 1}">${q}</p>
          `).join('')}
        </div>

        <div class="lm-hint" id="lm-hint">轻 触 屏 幕 进 入</div>
      </div>

      <style>
        /* 样式隔离 */
        .meditation-theme {
          --meditation-color: var(--color-text-primary, #d4af37);
          --meditation-bg: var(--color-bg-primary, #030305);
          
          width: 100%; height: 100%;
          background-color: var(--meditation-bg);
          color: var(--meditation-color);
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Songti SC', 'STSong', 'Noto Serif SC', serif;
        }

        .lm-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, transparent 60%);
          z-index: 0;
        }

        .lm-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%; height: 100%;
          perspective: 1000px;
        }

        .lm-sacred-geometry {
          position: relative;
          width: 200px;
          height: 200px;
          transform-style: preserve-3d;
          margin-bottom: 70px;
          animation: lmFloat 6s ease-in-out infinite;
        }

        /* 3D 星环 */
        .lm-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 15px inset rgba(255, 255, 255, 0.03),
                      0 0 8px var(--meditation-color);
        }
        .lm-ring-1 {
          border-top: 2px solid var(--meditation-color);
          transform: rotateX(70deg) rotateY(15deg);
          animation: lmSpinRing1 12s linear infinite;
        }
        .lm-ring-2 {
          border-right: 2px solid var(--meditation-color);
          transform: rotateX(60deg) rotateY(-30deg);
          animation: lmSpinRing2 18s linear infinite reverse;
          width: 110%; height: 110%;
          top: -5%; left: -5%;
          opacity: 0.6;
        }
        .lm-ring-3 {
          border-bottom: 1px dashed var(--meditation-color);
          transform: rotateX(80deg) rotateZ(45deg);
          animation: lmSpinRing3 25s linear infinite;
          width: 130%; height: 130%;
          top: -15%; left: -15%;
          opacity: 0.3;
        }

        /* 中心沙漏 */
        .lm-hourglass-svg {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 70px;
          height: 105px;
          overflow: visible;
          filter: drop-shadow(0 0 6px var(--meditation-color));
        }
        .lm-hg-line {
          fill: none;
          stroke: var(--meditation-color);
          stroke-width: 1;
          opacity: 0.8;
        }
        .lm-hg-sand-stream {
          stroke: var(--meditation-color);
          stroke-width: 1.5;
          stroke-dasharray: 4 4;
          animation: lmSandFlow 1s linear infinite;
        }
        .lm-hg-core-glow {
          fill: var(--meditation-color);
          opacity: 0;
          animation: lmCorePulse 4s ease-in-out infinite;
        }

        /* 治愈语序列 */
        .lm-quote-container {
          position: relative;
          width: 85%;
          max-width: 360px;
          height: 55px;
          text-align: center;
        }

        .lm-quote-line {
          position: absolute;
          inset: 0;
          font-size: 14px;
          line-height: 1.8;
          letter-spacing: 2px;
          color: var(--color-text-primary, rgba(255, 255, 255, 0.95));
          text-shadow: 0 0 8px var(--meditation-color);
          opacity: 0;
        }

        /* 逐句循环播放动画设计 */
        .lm-line-1 { animation: lmTextFadeInOut 3.5s ease-in-out forwards 0.5s; }
        .lm-line-2 { animation: lmTextFadeInOut 3.5s ease-in-out forwards 4s; }
        .lm-line-3 { animation: lmTextFadeInOut 3.5s ease-in-out forwards 7.5s; }
        .lm-line-4 { animation: lmTextFadeInOut 3.5s ease-in-out forwards 11s; }
        .lm-line-5 { animation: lmTextFadeInLast 3s ease-out forwards 14.5s; }

        .lm-hint {
          position: absolute;
          bottom: 50px;
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--color-text-tertiary, rgba(255, 255, 255, 0.4));
          opacity: 0;
          animation: lmHintFadeIn 2s ease forwards 16s;
          cursor: pointer;
        }

        /* 尘埃 */
        .lm-dust {
          position: absolute;
          width: 2px; height: 2px;
          background: var(--meditation-color);
          border-radius: 50%;
          box-shadow: 0 0 4px var(--meditation-color);
          opacity: 0;
        }
        .lm-dust-1 { left: 42%; top: 58%; animation: lmRise 5s ease-in infinite 0s; }
        .lm-dust-2 { left: 56%; top: 62%; animation: lmRise 6s ease-in infinite 1.5s; width: 1px; height: 1px; }
        .lm-dust-3 { left: 47%; top: 66%; animation: lmRise 4.5s ease-in infinite 2.5s; width: 3px; height: 3px; }

        /* keyframes 动画 */
        @keyframes lmSpinRing1 { 0% { transform: rotateX(70deg) rotateY(15deg) rotateZ(0deg); } 100% { transform: rotateX(70deg) rotateY(15deg) rotateZ(360deg); } }
        @keyframes lmSpinRing2 { 0% { transform: rotateX(60deg) rotateY(-30deg) rotateZ(0deg); } 100% { transform: rotateX(60deg) rotateY(-30deg) rotateZ(360deg); } }
        @keyframes lmSpinRing3 { 0% { transform: rotateX(80deg) rotateZ(0deg); } 100% { transform: rotateX(80deg) rotateZ(360deg); } }
        
        @keyframes lmFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes lmSandFlow {
          0% { stroke-dashoffset: 8; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes lmCorePulse {
          0%, 100% { opacity: 0.1; transform: scale(0.8) translate(-50%, -50%); }
          50% { opacity: 0.6; transform: scale(1.4) translate(-50%, -50%); }
        }
        @keyframes lmTextFadeInOut {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); filter: blur(4px); }
          18% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          82% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          100% { opacity: 0; transform: translateY(-8px) scale(1.04); filter: blur(4px); }
        }
        @keyframes lmTextFadeInLast {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); filter: blur(4px); }
          30% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes lmHintFadeIn {
          to { opacity: 1; }
        }
        @keyframes lmRise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          50% { opacity: 0.7; }
          100% { transform: translateY(-70px) scale(0.4); opacity: 0; }
        }
      </style>
    </div>
  `;

  // 点击或 18.5秒 倒计时结束进入 App (5句引导词 17.5s + 1s缓冲)
  const go = () => {
    if (didGo) return;
    didGo = true;
    haptic(6);
    navigate('/home');
  };

  clickTarget = document.getElementById('launch-root');
  clickHandler = go;
  clickTarget.addEventListener('click', clickHandler);

  // 18.5 秒如果没有点击，自动进入 App
  timers.push(setTimeout(go, 18500));
}

// ==================== 动画风格3：爱与誓约 (冥想避风港) ====================
function renderSanctuaryStyle(root) {
  // 冥想引导词（版本三）
  const SANCTUARY_QUOTES = [
    "以爱之名，立下神圣的屏障。",
    "恐惧与阴霾，在此刻悉数消散。",
    "在彼此的信任里，我们找到了最坚固的锚点。",
    "任由时空变迁，我们心灵的连接不可动摇。",
    "结界已定。你被保护着，你安全了。"
  ];

  // 渲染 HTML 与内联 CSS，所有变色逻辑与 CSS 均绑定项目的配色变量
  root.innerHTML = `
    <div class="launch-page page sanctuary-theme" id="launch-root">
      <!-- 逐渐消散的浓雾 -->
      <div class="ls-fog-layer"></div>

      <div class="ls-content">
        <!-- 视觉核心：小舟、水波与连接的纽带 -->
        <div class="ls-boat-scene">
          
          <!-- 结界爆发的星芒 -->
          <div class="ls-sanctuary-star"></div>

          <!-- 代表双向连接的双螺旋光轨 -->
          <svg class="ls-bond-spiral" viewBox="0 0 60 140" xmlns="http://www.w3.org/2000/svg">
            <path class="ls-bond-path ls-path-left" d="M20,140 C-10,100 70,60 30,10" />
            <path class="ls-bond-path ls-path-right" d="M40,140 C70,100 -10,60 30,10" />
          </svg>

          <!-- 孤舟 SVG -->
          <svg class="ls-boat-svg" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 50,45 80,45" class="ls-boat-line"/>
            <polygon points="50,15 50,45 25,45" class="ls-boat-line" style="opacity: 0.6;"/>
            <path d="M10,45 L90,45 L75,55 L25,55 Z" class="ls-boat-line" fill="rgba(255, 255, 255, 0.05)"/>
          </svg>

          <!-- 水面涟漪 -->
          <div class="ls-water-ripple ls-ripple-1"></div>
          <div class="ls-water-ripple ls-ripple-2"></div>
        </div>

        <!-- 誓约冥想词容器 -->
        <div class="ls-vow-container">
          ${SANCTUARY_QUOTES.map((q, idx) => `
            <p class="ls-vow-line ls-line-${idx + 1}">${q}</p>
          `).join('')}
        </div>

        <div class="ls-hint" id="ls-hint">轻 触 屏 幕 进 入</div>
      </div>

      <style>
        .sanctuary-theme {
          --sanc-color: var(--color-text-primary, #e2e8f0);
          --sanc-glow: var(--color-text-primary-glow, rgba(226, 232, 240, 0.4));
          --sanc-bg: var(--color-bg-primary, #050b14);
          
          width: 100%; height: 100%;
          background-color: var(--sanc-bg);
          color: var(--sanc-color);
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Songti SC', 'STSong', 'Noto Serif SC', serif;
        }

        /* 逐渐消散的浓雾（驱逐不好的能量） */
        .ls-fog-layer {
          position: absolute;
          inset: -50%;
          background: radial-gradient(circle at center, transparent 20%, var(--sanc-bg) 75%),
                      repeating-radial-gradient(circle at center, rgba(255, 255, 255, 0.02) 0, rgba(255, 255, 255, 0.01) 10px, transparent 20px);
          filter: blur(20px);
          z-index: 10;
          opacity: 1;
          animation: lsBanishFog 12s ease-out forwards;
          pointer-events: none;
        }

        .ls-content {
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%; height: 100%;
        }

        .ls-boat-scene {
          position: relative;
          width: 200px;
          height: 230px;
          margin-bottom: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
        }

        /* 水面安全涟漪 */
        .ls-water-ripple {
          position: absolute;
          bottom: 15px;
          width: 110px;
          height: 26px;
          border-radius: 50%;
          border: 1px solid var(--sanc-color);
          box-shadow: 0 0 12px var(--sanc-glow);
          transform: rotateX(75deg);
          opacity: 0;
        }
        .ls-ripple-1 {
          animation: lsRippleExpand 4s infinite ease-out 6s;
        }
        .ls-ripple-2 {
          animation: lsRippleExpand 4s infinite ease-out 8s;
        }

        /* 孤舟 SVG */
        .ls-boat-svg {
          position: relative;
          width: 55px;
          height: 55px;
          margin-bottom: 20px;
          filter: drop-shadow(0 0 8px var(--sanc-glow));
          animation: lsBoatRock 4s ease-in-out infinite;
          z-index: 2;
        }
        .ls-boat-line {
          fill: none;
          stroke: var(--sanc-color);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        /* 双螺旋连接光轨 */
        .ls-bond-spiral {
          position: absolute;
          bottom: 52px;
          width: 50px;
          height: 120px;
          z-index: 1;
          opacity: 0;
          animation: lsSpiralReveal 3s ease-in forwards 8s;
        }
        .ls-bond-path {
          fill: none;
          stroke: var(--sanc-color);
          stroke-width: 1.2;
          filter: drop-shadow(0 0 4px var(--sanc-color));
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
        }
        .ls-path-left {
          animation: lsDrawBond 4s ease-in-out forwards 8s, lsFloatBond 3s ease-in-out infinite 12s;
        }
        .ls-path-right {
          animation: lsDrawBond 4s ease-in-out forwards 8.5s, lsFloatBond 3s ease-in-out infinite 12s;
        }

        /* 守护星芒爆发 */
        .ls-sanctuary-star {
          position: absolute;
          top: 35px;
          width: 2px; height: 2px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 0 10px 4px var(--sanc-color);
          opacity: 0;
          animation: lsStarBurst 3s ease-out forwards 11s;
        }

        /* 誓约文字排版 */
        .ls-vow-container {
          position: relative;
          width: 85%;
          max-width: 380px;
          height: 50px;
          text-align: center;
        }
        .ls-vow-line {
          position: absolute;
          inset: 0;
          font-size: 14px;
          line-height: 1.8;
          letter-spacing: 2px;
          color: var(--color-text-primary, rgba(255, 255, 255, 0.95));
          text-shadow: 0 0 10px var(--sanc-glow);
          opacity: 0;
        }

        /* 引导词出场顺序 */
        .ls-line-1 { animation: lsVowFade 3.5s ease-in-out forwards 0.5s; }
        .ls-line-2 { animation: lsVowFade 3.5s ease-in-out forwards 4s; }
        .ls-line-3 { animation: lsVowFade 3.5s ease-in-out forwards 7.5s; }
        .ls-line-4 { animation: lsVowFade 3.5s ease-in-out forwards 11s; }
        .ls-line-5 { animation: lsVowStay 3s ease-out forwards 14.5s; }

        /* 底部进入提示 */
        .ls-hint {
          position: absolute;
          bottom: 45px;
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--color-text-tertiary, rgba(255, 255, 255, 0.35));
          opacity: 0;
          animation: lsHintIn 2s ease forwards 16s;
          cursor: pointer;
        }

        /* Keyframes */
        @keyframes lsBanishFog {
          0% { opacity: 1; transform: scale(1) rotate(0deg); }
          50% { opacity: 0.6; transform: scale(1.15) rotate(5deg); }
          100% { opacity: 0; transform: scale(1.4) rotate(10deg); visibility: hidden; }
        }
        @keyframes lsBoatRock {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-6px) rotate(3deg); }
        }
        @keyframes lsRippleExpand {
          0% { transform: rotateX(75deg) scale(0.3); opacity: 0.7; stroke-width: 1.5px; }
          100% { transform: rotateX(75deg) scale(1.8); opacity: 0; stroke-width: 0px; }
        }
        @keyframes lsSpiralReveal { to { opacity: 1; } }
        @keyframes lsDrawBond { to { stroke-dashoffset: 0; } }
        @keyframes lsFloatBond {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes lsStarBurst {
          0% { opacity: 0; transform: scale(0.5); }
          30% { opacity: 1; transform: scale(2.2); box-shadow: 0 0 25px 8px var(--sanc-color); }
          100% { opacity: 0.8; transform: scale(1.4); box-shadow: 0 0 15px 4px var(--sanc-color); }
        }
        @keyframes lsVowFade {
          0% { opacity: 0; transform: translateY(8px); filter: blur(3px); }
          18% { opacity: 1; transform: translateY(0); filter: blur(0); }
          82% { opacity: 1; transform: translateY(0); filter: blur(0); }
          100% { opacity: 0; transform: translateY(-8px); filter: blur(3px); }
        }
        @keyframes lsVowStay {
          0% { opacity: 0; transform: translateY(8px); filter: blur(3px); }
          30% { opacity: 1; transform: translateY(0); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes lsHintIn { to { opacity: 1; } }
      </style>
    </div>
  `;

  // 18.5秒后未操作自动跳入 App，或随时点击进入
  const go = () => {
    if (didGo) return;
    didGo = true;
    haptic(6);
    navigate('/home');
  };

  clickTarget = document.getElementById('launch-root');
  clickHandler = go;
  clickTarget.addEventListener('click', clickHandler);

  timers.push(setTimeout(go, 18500));
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

