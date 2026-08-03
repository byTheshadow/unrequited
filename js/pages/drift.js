import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import { generateForCharacter } from '../cardEngine.js';
import {
  ICON, escapeHtml, formatTime, haptic, toast, openSheet, confirmSheet, pick
} from '../utils.js';

// 纯手绘线条风格内联 SVG，无 Unicode emoji
const DRIFT_ICON = {
  driftBottle: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M9 6h6M10 6v3.5a2 2 0 0 1-.58 1.42l-2.84 2.83A3 3 0 0 0 6 15.88V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.12a3 3 0 0 0-.58-2.13l-2.84-2.83A2 2 0 0 1 14 9.5V6"/><path d="M9 16h6M8 19h8"/></svg>`,
  driftBottleBig: `<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M9 6h6M10 6v3.5a2 2 0 0 1-.58 1.42l-2.84 2.83A3 3 0 0 0 6 15.88V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.12a3 3 0 0 0-.58-2.13l-2.84-2.83A2 2 0 0 1 14 9.5V6"/><path d="M9 16h6M8 19h8"/></svg>`,
  envelope: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  mailbox: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h8"/><path d="M18 10.5V13a4 4 0 0 1-8 0V8h8"/><path d="M2 6l10 7 10-7"/><circle cx="18" cy="18" r="3"/><path d="M21 21l-1.5-1.5"/></svg>`,
  textCards: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  starDust: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M18.36 5.64l-1.42 1.42M7.05 16.95l-1.42 1.42M18.36 18.36l-1.42-1.42M7.05 7.05L5.64 5.64M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`,
  postboxCylinderBig: `<svg viewBox="0 0 64 64" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 22h24M16 30h32M20 48h24" opacity="0.3"/><path d="M16 26a16 16 0 0 1 32 0v26a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V26z"/><path d="M22 18V12h20v6"/><path d="M24 26h16v6H24z"/><path d="M32 32v12M28 38h8"/></svg>`,
  salvageWave: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12M12 6v6l4 2"/><path d="M6 17c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0" opacity="0.6"/></svg>`
};

// 预设的深空回音
const SPACE_WHISPERS = [
  "宇宙是一个庞大的回音室，你的执念，已在三万光年外的星轨上激起了微弱的涟漪。",
  "星尘在永夜的冷寂中重塑。它掠过你的信笺，留下一声无法翻译的叹息：『我听到了。』",
  "这封信在光年与梦境的折缝中失重。也许，答案早就在你将它投向夜空的那一刻写好。",
  "没有回音，亦没有光。只有冷寂的以太中泛起的一缕波澜——原来，你还没忘记。",
  "时间是不均匀的漏沙。那些没有寄出的情绪，在深空里结成了晶莹的冰晶，正反射着你来时的光。"
];

let activeTab = 'write'; 
let characters = [];
let targetCharId = 'unknown'; 
let writeStep = 'waiting'; // 'waiting' (星海漂浮状态) | 'writing' (写信展开状态)
const typingTimers = new Map();

// 注入通灵机制专属 CSS 样式
const styleEl = document.createElement('style');
styleEl.innerHTML = `
  /* 通灵占位卡样式 */
  .drift-timeline-item.item-impulse {
    opacity: 0.85;
  }
  .drift-timeline-card.impulse-card {
    border: 1px dashed rgba(168, 85, 247, 0.6);
    background: linear-gradient(135deg, rgba(20, 10, 35, 0.6) 0%, rgba(10, 10, 20, 0.8) 100%);
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.15);
    animation: impulsePulse 3s infinite ease-in-out;
  }
  @keyframes impulsePulse {
    0%, 100% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.4); }
    50% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.35); border-color: rgba(168, 85, 247, 0.8); }
  }
  .impulse-writing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: #a855f7;
    margin-top: 8px;
  }
  .impulse-dot {
    width: 6px;
    height: 6px;
    background-color: #a855f7;
    border-radius: 50%;
    animation: impulseDotPulse 1.2s infinite alternate;
  }
  .impulse-dot:nth-child(2) { animation-delay: 0.3s; }
  .impulse-dot:nth-child(3) { animation-delay: 0.6s; }
  @keyframes impulseDotPulse {
    0% { opacity: 0.2; transform: scale(0.8); }
    100% { opacity: 1; transform: scale(1.2); }
  }

  /* 通灵仪式全屏浮层 */
  .commune-overlay {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(8, 5, 15, 0.95);
    backdrop-filter: blur(10px);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s ease;
  }
  .commune-overlay.show {
    opacity: 1;
    pointer-events: auto;
  }
  .commune-portal {
    position: relative;
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .portal-ring-bg {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 2px solid rgba(168, 85, 247, 0.1);
    border-radius: 50%;
  }
  .portal-ring-active {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 2px solid transparent;
    border-top-color: #a855f7;
    border-right-color: #c084fc;
    border-radius: 50%;
    transform: rotate(0deg);
    transition: transform 3s linear;
  }
  .commune-overlay.charging .portal-ring-active {
    transform: rotate(1080deg);
  }
  .portal-core {
    width: 120px;
    height: 120px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .portal-core:active {
    transform: scale(0.95);
    box-shadow: 0 0 35px rgba(168, 85, 247, 0.5);
  }
  .commune-title {
    font-size: 1.25rem;
    color: #e9d5ff;
    margin-top: 30px;
    letter-spacing: 2px;
  }
  .commune-desc {
    font-size: 0.9rem;
    color: #a78bfa;
    margin-top: 10px;
    max-width: 280px;
    text-align: center;
    line-height: 1.5;
  }
  .commune-close {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
  }

  /* 在线共鸣屏幕边缘发光波纹特效 */
  .resonance-ripple {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    box-shadow: inset 0 0 80px rgba(168, 85, 247, 0.6);
    pointer-events: none;
    z-index: 1999;
    opacity: 0;
    transition: opacity 1.5s ease-out;
  }
  .resonance-ripple.play {
    animation: ripplePulse 3s forwards;
  }
  @keyframes ripplePulse {
    0% { opacity: 0; box-shadow: inset 0 0 20px rgba(168, 85, 247, 0); }
    30% { opacity: 1; box-shadow: inset 0 0 80px rgba(168, 85, 247, 0.7); }
    100% { opacity: 0; box-shadow: inset 0 0 30px rgba(168, 85, 247, 0); }
  }
`;
document.head.appendChild(styleEl);

export async function render(root, params) {
  characters = await db.characters.toArray();

  root.innerHTML = `
    <div class="drift-container">
      <!-- 极简渐变呼吸感背景 -->
      <div class="drift-bg-glow">
        <div class="glow-orb orb-1"></div>
        <div class="glow-orb orb-2"></div>
        <div class="glow-orb orb-3"></div>
      </div>

      <!-- 顶栏 -->
      <div class="drift-top-bar">
        <button class="drift-btn-circle" id="drift-back" aria-label="返回">${ICON.back}</button>
        <span class="drift-title">深空信箱</span>
        <button class="drift-btn-circle" id="drift-tut-btn" style="opacity: 0.8;" aria-label="教程">${DRIFT_ICON.starDust}</button>
      </div>

      <!-- 未读回信小提示栏 -->
      <div id="unread-alert-bar" class="unread-alert-bar"></div>

      <!-- 选项卡导航 -->
      <div class="drift-tabs">
        <button class="drift-tab-item active" data-tab="write">
          ${DRIFT_ICON.envelope}
          <span>写信</span>
        </button>
        <button class="drift-tab-item" data-tab="mailbox">
          ${DRIFT_ICON.mailbox}
          <span>收件箱</span>
        </button>
        <button class="drift-tab-item" data-tab="long-cards">
          ${DRIFT_ICON.textCards}
          <span>长段字卡</span>
        </button>
      </div>

      <!-- 主视图区域 -->
      <div class="drift-view-content" id="drift-view"></div>

      <!-- 投递星光动画浮层 -->
      <div id="drift-animation-overlay" class="drift-anim-overlay hide">
        <div class="drift-anim-bottle">
          ${DRIFT_ICON.driftBottle}
        </div>
        <div class="drift-particles-container"></div>
        <div class="drift-anim-text">信笺正在化作星光投向深空…</div>
      </div>

      <!-- 打捞动画浮层 -->
      <div id="salvage-animation-overlay" class="drift-anim-overlay salvage hide">
        <div class="salvage-anim-vortex">
          <div class="salvage-swirl"></div>
          <div class="salvage-bottle-rise">
            ${DRIFT_ICON.driftBottle}
          </div>
        </div>
        <div class="drift-anim-text">正在捕获深空的思绪涟漪…</div>
      </div>

      <!-- 在线共鸣屏幕边缘微光特效 -->
      <div id="resonance-ripple-el" class="resonance-ripple"></div>

      <!-- 通灵仪式全屏浮层 -->
      <div id="commune-overlay-el" class="commune-overlay">
        <button class="commune-close" id="btn-close-commune" aria-label="取消">${ICON.x || '✕'}</button>
        <div class="commune-portal" id="commune-touch-zone">
          <div class="portal-ring-bg"></div>
          <div class="portal-ring-active" id="portal-spinner"></div>
          <div class="portal-core">
            ${DRIFT_ICON.starDust}
          </div>
        </div>
        <div class="commune-title" id="commune-status-title">开启星轨共鸣</div>
        <div class="commune-desc" id="commune-status-desc">双击或长按星尘中心以凝聚心念</div>
      </div>
    </div>
  `;

  // 绑定返回与指引事件
  root.querySelector('#drift-back').addEventListener('click', () => {
    haptic(6);
    goBack('/home');
  });

  root.querySelector('#drift-tut-btn').addEventListener('click', () => {
    haptic(6);
    navigate('/tutorial');
  });

  root.querySelectorAll('.drift-tab-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // 绑定通灵面板的关闭按钮
  root.querySelector('#btn-close-commune').addEventListener('click', () => {
    haptic(6);
    closeCommuneOverlay();
  });

  // 执行星轨链接判定与未读更新
  await processCompletedImpulses();
  await checkOfflineImpulseTrigger();
  switchTab('write');
  updateUnreadAlert();
}

async function switchTab(tabName) {
  haptic(6);
  activeTab = tabName;
  
  document.querySelectorAll('.drift-tab-item').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabName;
    btn.classList.toggle('active', isTarget);
  });

  const view = document.getElementById('drift-view');
  if (!view) return;

  clearAllTypingTimers();

  // 每次切换Tab时，都顺便触发一次写信完成状态的检测，并尝试触发“在线共鸣”
  await processCompletedImpulses();
  triggerOnlineResonanceCheck();

  if (tabName === 'write') {
    writeStep = 'waiting';
    renderWriteView(view);
  } else if (tabName === 'mailbox') {
    await renderMailboxView(view);
  } else if (tabName === 'long-cards') {
    await renderLongCardsView(view);
  }

  updateUnreadAlert();
}

// ----------------- [视图渲染：写信流程] -----------------
function renderWriteView(container) {
  const optionsHtml = characters.map(c => `
    <option value="${c.id}">寄给：${escapeHtml(c.name)}</option>
  `).join('');

  container.innerHTML = `
    <div class="drift-card write-card">
      
      <!-- 状态 1：海上漂浮等待视图 -->
      <div class="state-waiting ${writeStep === 'waiting' ? 'active' : 'hide'}" id="view-wait">
        <div class="action-top">
          <div class="hint-text">写下你无法寄出的思绪，或开启星轨羁绊...</div>
          <div class="drift-write-btns" style="display: flex; gap: 12px; justify-content: center; width: 100%; padding: 0 16px;">
            <button class="btn-open-envelope" id="btn-trigger-open" style="flex: 1;">
              ${DRIFT_ICON.envelope}
              打开信封
            </button>
            <button class="btn btn-secondary" id="btn-commune-trigger" style="flex: 1; padding: 14px 20px; font-size: 0.95rem; border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.05); color: #e9d5ff;">
              ${DRIFT_ICON.starDust}
              静候来信
            </button>
          </div>
        </div>

        <div class="sea-animation-area">
          <!-- 漂浮起伏的瓶子 -->
          <div class="floating-bottle">
            ${DRIFT_ICON.driftBottleBig}
          </div>
          
          <!-- 流线型视差波浪 SVG -->
          <div class="drift-sea-container">
            <svg class="drift-waves" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 28" preserveAspectRatio="none">
              <defs>
                <path id="wave-path" d="M-160 12c30 0 58-5 88-5s 58 5 88 5 58-5 88-5 58 5 88 5 v18h-352z" />
              </defs>
              <g class="wave-parallax">
                <use href="#wave-path" x="48" y="0" class="wave-use wave1" />
                <use href="#wave-path" x="48" y="2" class="wave-use wave2" />
                <use href="#wave-path" x="48" y="4" class="wave-use wave3" />
                <use href="#wave-path" x="48" y="6" class="wave-use wave4" />
              </g>
            </svg>
          </div>
          
          <!-- 闪烁星光 -->
          <div class="sea-stars">
            <div class="sea-star" style="top: 15%; left: 20%; width: 2px; height: 2px;"></div>
            <div class="sea-star" style="top: 35%; left: 80%; width: 3px; height: 3px; animation-delay: 1s;"></div>
            <div class="sea-star" style="top: 50%; left: 15%; width: 2px; height: 2px; animation-delay: 2s;"></div>
            <div class="sea-star" style="top: 25%; left: 65%; width: 4px; height: 4px; animation-delay: 1.5s;"></div>
          </div>
        </div>
      </div>

      <!-- 状态 2：信封 3D 展开与书写视图 -->
      <div class="state-writing ${writeStep === 'writing' ? 'active' : 'hide'}" id="view-write">
        <div class="envelope-3d" id="envelope-elem">
          <div class="env-flap"></div>
          <div class="env-body"></div>
          
          <!-- 书写信纸 -->
          <div class="env-paper">
            <div class="letter-header">
              <select class="select drift-select-char" id="drift-char-select">
                <option value="unknown">投递至「未知深空」</option>
                ${optionsHtml}
              </select>
            </div>
            <textarea class="textarea drift-textarea" id="drift-content" placeholder="在这里写下你的念念不忘..." maxlength="500"></textarea>
            
            <div class="letter-actions">
              <button class="btn btn-secondary" id="btn-close-envelope">收起信纸</button>
              <button class="btn btn-primary" id="btn-throw-letter">
                ${DRIFT_ICON.driftBottle}
                投递出去
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

  const viewWait = container.querySelector('#view-wait');
  const viewWrite = container.querySelector('#view-write');
  const envElem = container.querySelector('#envelope-elem');

  // 打开信封：触发淡出、翻盖折叠与纸张向上抽出
  container.querySelector('#btn-trigger-open').addEventListener('click', () => {
    haptic(10);
    viewWait.style.opacity = '0';
    viewWait.style.pointerEvents = 'none';
    
    setTimeout(() => {
      viewWait.classList.remove('active');
      viewWait.classList.add('hide');
      
      viewWrite.classList.remove('hide');
      viewWrite.classList.add('active');
      
      setTimeout(() => {
        envElem.classList.add('open');
        writeStep = 'writing';
      }, 50);
    }, 300);
  });

  // 收起信纸折叠回信封
  container.querySelector('#btn-close-envelope').addEventListener('click', () => {
    haptic(8);
    envElem.classList.remove('open');
    
    setTimeout(() => {
      viewWrite.classList.remove('active');
      viewWrite.classList.add('hide');
      
      viewWait.classList.remove('hide');
      viewWait.classList.add('active');
      
      setTimeout(() => {
        viewWait.style.opacity = '1';
        viewWait.style.pointerEvents = 'auto';
        writeStep = 'waiting';
      }, 50);
    }, 600);
  });

  // 投递写信
  container.querySelector('#btn-throw-letter').addEventListener('click', () => {
    const text = container.querySelector('#drift-content').value.trim();
    const charIdVal = container.querySelector('#drift-char-select').value;
    
    if (!text) {
      toast('信笺上还没有写字呢');
      return;
    }

    haptic(15);
    targetCharId = charIdVal === 'unknown' ? 'unknown' : Number(charIdVal);
    triggerThrowAnimation(text, targetCharId);
  });

  // 绑定主动通灵仪式按钮
  container.querySelector('#btn-commune-trigger').addEventListener('click', () => {
    haptic(10);
    openCommuneSelection();
  });
}

// ----------------- [投递动画与回复机制验证] -----------------
async function triggerThrowAnimation(content, charId) {
  const overlay = document.getElementById('drift-animation-overlay');
  if (!overlay) return;

  overlay.classList.remove('hide');
  overlay.classList.add('show');

  const particlesWrap = overlay.querySelector('.drift-particles-container');
  particlesWrap.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'drift-particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 2}s`;
    p.style.width = p.style.height = `${Math.random() * 4 + 2}px`;
    particlesWrap.appendChild(p);
  }

  setTimeout(async () => {
    await generateDriftReply(content, charId);
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    
    toast('信件已随星光漂向深空');
    switchTab('mailbox');
  }, 3000);
}

// 确保纯随机性：从字卡库中按洗牌概率随机抽取，无硬编码偏置
async function generateDriftReply(sentContent, charId) {
  const now = Date.now();

  // 添加用户发出信件的记录
  await db.driftLetters.add({
    characterId: charId,
    timestamp: now,
    type: 'sent',
    content: sentContent,
    isRead: 1
  });

  let replyText = '';
  let finalCharId = charId;

  if (charId === 'unknown') {
    // 投递至未知：纯随机从用户自定义的长段字卡抽取
    const longs = await db.longFragments.toArray();
    if (longs.length > 0) {
      const picked = pick(longs);
      replyText = picked.content;
    } else {
      replyText = pick(SPACE_WHISPERS);
    }
    finalCharId = 'unknown';
  } else {
    // 投递给指定角色：由角色字卡库抽取拼接，确保随机
    try {
      const result = await generateForCharacter(charId);
      if (result && result.messages && result.messages.length > 0) {
        replyText = result.messages.join('\n');
      } else {
        const longs = await db.longFragments.toArray();
        if (longs.length > 0) {
          replyText = pick(longs).content;
        } else {
          replyText = pick(SPACE_WHISPERS);
        }
      }
    } catch (e) {
      replyText = pick(SPACE_WHISPERS);
    }
  }

  // 写入随机抽取的收到信件
  await db.driftLetters.add({
    characterId: finalCharId,
    timestamp: now + 500,
    type: 'received',
    content: replyText,
    isRead: 0
  });

  window.dispatchEvent(new CustomEvent('drift-unread-updated'));
}

// ----------------- [收件箱渲染] -----------------
async function renderMailboxView(container) {
  const unreadCount = await db.driftLetters.where({ type: 'received', isRead: 0 }).count();
  const letters = await db.driftLetters.orderBy('timestamp').reverse().toArray();
  const charMap = new Map(characters.map((c) => [c.id, c]));

  const listHtml = letters.map((letter) => {
    const isSent = letter.type === 'sent';
    const isImpulse = letter.status === 'impulse';
    const timeStr = formatTime(letter.timestamp);

    let senderName = '我';
    if (!isSent) {
      if (letter.characterId === 'unknown') {
        senderName = '未知存在';
      } else {
        const c = charMap.get(letter.characterId);
        senderName = c ? c.name : '未知存在';
      }
    }

    const unreadDot = (!isSent && !letter.isRead && !isImpulse) ? '<span class="drift-unread-dot"></span>' : '';
    let bubbleClass = isSent ? 'sent-bubble' : 'received-bubble';
    
    // 如果是通灵撰写中状态，展示特殊卡片样式与占位提示
    if (isImpulse) {
      bubbleClass = 'impulse-card';
      const elapsed = Date.now() - letter.timestamp;
      let impulseStatusText = '正在脑海中整理思绪，写信冲动初现...';
      if (elapsed > 4 * 3600000) {
        impulseStatusText = '字句在彼端汇聚，思念正在折叠中...';
      }

      return `
        <div class="drift-timeline-item item-received item-impulse" data-id="${letter.id}">
          <div class="drift-timeline-badge" style="background: #a855f7; color: white;">联</div>
          <div class="drift-timeline-card ${bubbleClass}">
            <div class="drift-letter-meta">
              <span class="drift-letter-sender" style="color: #c084fc;">${escapeHtml(senderName)} ${unreadDot}</span>
              <span class="drift-letter-time">${timeStr}</span>
            </div>
            <div class="drift-letter-body-container">
              <div class="drift-letter-text" style="color: #a78bfa; font-style: italic;">
                ✦ 通灵星轨连结中 ✦
                <div class="impulse-writing-indicator">
                  <div class="impulse-dot"></div>
                  <div class="impulse-dot"></div>
                  <div class="impulse-dot"></div>
                  <span>正在撰写中...</span>
                </div>
                <div style="font-size: 0.85rem; opacity: 0.8; margin-top: 6px;">
                  ${impulseStatusText}
                </div>
              </div>
            </div>
            <div class="drift-letter-actions">
              <button class="drift-text-btn-danger" data-act="delete-letter" data-id="${letter.id}">
                ${ICON.trash}
                <span>切断羁绊</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="drift-timeline-item ${isSent ? 'item-sent' : 'item-received'}" data-id="${letter.id}">
        <div class="drift-timeline-badge">${isSent ? '写' : '回'}</div>
        <div class="drift-timeline-card ${bubbleClass}">
          <div class="drift-letter-meta">
            <span class="drift-letter-sender">${escapeHtml(senderName)} ${unreadDot}</span>
            <span class="drift-letter-time">${timeStr}</span>
          </div>
          <div class="drift-letter-body-container">
            <div class="drift-letter-text" id="text-body-${letter.id}">
              ${(!isSent && !letter.isRead)
                ? '<span class="tap-to-read">✦ 点击拆封阅读此信 ✦</span>'
                : escapeHtml(letter.content).replace(/\n/g, '<br>')}
            </div>
          </div>
          <div class="drift-letter-actions">
            <button class="drift-text-btn-danger" data-act="delete-letter" data-id="${letter.id}">
              ${ICON.trash}
              <span>销毁</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- 顶部仪式感打捞区域 -->
    <div class="salvage-trigger-zone">
      <div class="salvage-trigger-box">
        <div class="salvage-info">
          <span class="salvage-title">深空漂浮中</span>
          <span class="salvage-sub">当前深空回音积攒量：${unreadCount} 封</span>
        </div>
        <button class="btn btn-primary btn-salvage" id="btn-salvage-bottle" ${unreadCount === 0 ? 'disabled' : ''}>
          ${DRIFT_ICON.salvageWave}
          打捞漂流瓶
        </button>
      </div>
    </div>

    <div class="drift-mailbox-list">
      ${letters.length === 0 
        ? `<div class="empty-state">
            <div class="empty-state-icon mailbox-large-icon">
              <div class="mailbox-glowing-halo"></div>
              ${DRIFT_ICON.postboxCylinderBig}
            </div>
            <div class="empty-state-title">星河岑寂，收件箱空无一物</div>
            <div class="empty-state-sub">去写封信投递到深空吧，或静候来信感应对方。</div>
          </div>`
        : listHtml
      }
    </div>
  `;

  // 绑定仪式感打捞事件
  const salvageBtn = container.querySelector('#btn-salvage-bottle');
  if (salvageBtn) {
    salvageBtn.addEventListener('click', () => {
      haptic(15);
      triggerSalvageAnimation();
    });
  }

  // 点击信件卡片拆封
  container.querySelectorAll('.drift-timeline-card').forEach((card) => {
    const itemEl = card.closest('.drift-timeline-item');
    if (itemEl.classList.contains('item-impulse')) return; // 撰写中无法点击拆封

    const itemId = Number(itemEl.getAttribute('data-id'));

    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act="delete-letter"]')) return;

      const letterObj = await db.driftLetters.get(itemId);
      if (letterObj && letterObj.type === 'received' && !letterObj.isRead) {
        haptic(10);
        await db.driftLetters.update(itemId, { isRead: 1 });
        const dot = card.querySelector('.drift-unread-dot');
        if (dot) dot.remove();

        const textContainer = document.getElementById(`text-body-${itemId}`);
        if (textContainer) {
          triggerTypewriter(textContainer, letterObj.content);
        }
        updateUnreadAlert();
      }
    });
  });

  // 销毁信件 / 切断羁绊
  container.querySelectorAll('[data-act="delete-letter"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const letterObj = await db.driftLetters.get(id);
      const isImpulse = letterObj && letterObj.status === 'impulse';
      const confirmText = isImpulse 
        ? '确定切断与角色的心念共鸣吗？这会抹除他当前的写信状态。' 
        : '确定销毁这封信吗？消逝的思绪将不可挽回。';

      const ok = await confirmSheet(confirmText, {
        okText: isImpulse ? '切断' : '销毁',
        danger: true
      });
      if (ok) {
        haptic(8);
        await db.driftLetters.delete(id);
        toast(isImpulse ? '共鸣星轨已中断' : '信件已烧毁');
        switchTab('mailbox');
      }
    });
  });
}

// ----------------- [仪式感打捞漂流瓶动画] -----------------
function triggerSalvageAnimation() {
  const overlay = document.getElementById('salvage-animation-overlay');
  if (!overlay) return;

  overlay.classList.remove('hide');
  overlay.classList.add('show');

  setTimeout(async () => {
    // 捞取第一条未读回信（排除正在撰写的）
    const firstUnread = await db.driftLetters
      .where({ type: 'received', isRead: 0 })
      .filter(l => l.status !== 'impulse')
      .first();

    overlay.classList.remove('show');
    overlay.classList.add('hide');

    if (firstUnread) {
      haptic(20);
      await db.driftLetters.update(firstUnread.id, { isRead: 1 });
      openSalvagedLetterSheet(firstUnread);
      switchTab('mailbox');
    } else {
      toast('星潮涌动，信件还在以太中穿梭');
    }
  }, 3000);
}

function openSalvagedLetterSheet(letterObj) {
  const charMap = new Map(characters.map(c => [c.id, c]));
  let sender = '未知存在';
  if (letterObj.characterId !== 'unknown') {
    const c = charMap.get(letterObj.characterId);
    if (c) sender = c.name;
  }

  const { close } = openSheet({
    title: `打捞到的信笺 (来自: ${sender})`,
    body: `
      <div class="salvaged-sheet-body">
        <div class="salvaged-typewriter-text" id="salvaged-dialog-text"></div>
      </div>
    `,
    actions: `<button class="btn btn-primary btn-block" id="btn-close-salvaged">收好信笺</button>`,
    maxHeight: '65vh'
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.querySelector('#btn-close-salvaged').addEventListener('click', () => {
    close();
  });

  setTimeout(() => {
    const textEl = root.querySelector('#salvaged-dialog-text');
    if (textEl) {
      triggerTypewriter(textEl, letterObj.content);
    }
  }, 200);
}

// ----------------- [打字机输出特效] -----------------
function triggerTypewriter(element, text) {
  element.innerHTML = '';
  element.classList.add('typing-active');
  
  let i = 0;
  const speed = 70; 
  const timerId = setInterval(() => {
    if (i < text.length) {
      const char = text.charAt(i);
      if (char === '\n') {
        element.innerHTML += '<br>';
      } else {
        element.innerHTML += escapeHtml(char);
      }
      i++;
      if (i % 3 === 0) haptic(3);
    } else {
      clearInterval(timerId);
      typingTimers.delete(element.id);
      element.classList.remove('typing-active');
    }
  }, speed);

  typingTimers.set(element.id, timerId);
}

function clearAllTypingTimers() {
  for (const [id, timer] of typingTimers.entries()) {
    clearInterval(timer);
  }
  typingTimers.clear();
}

// ----------------- [长段字卡去重导入与管理] -----------------
async function renderLongCardsView(container) {
  const longs = await db.longFragments.orderBy('createdAt').reverse().toArray();

  container.innerHTML = `
    <div class="drift-card long-cards-card">
      <div class="long-cards-header">
        <div class="long-cards-title">长段字卡库</div>
        <div class="long-cards-desc">
          在这里导入大段文字，当投递给「未知深空」或关联角色没有配置字卡时，回信会从这里随机抽取。
        </div>
      </div>

      <div class="long-cards-import-zone">
        <textarea class="textarea long-import-input" id="long-import-text" placeholder="支持批量导入：每行输入一条，自动过滤并跳过已存在的重复内容。"></textarea>
        <button class="btn btn-primary btn-block" id="btn-import-long">批量导入</button>
      </div>

      <div class="long-list-header">
        <span>当前存储 (${longs.length} 条)</span>
        ${longs.length > 0 ? `<button class="drift-text-btn-danger" id="btn-clear-all-long">清空全部</button>` : ''}
      </div>

      <div class="long-cards-list">
        ${longs.map(item => `
          <div class="long-item">
            <div class="long-item-content">${escapeHtml(item.content)}</div>
            <button class="long-item-del" data-id="${item.id}" aria-label="删除">${ICON.trash}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 重复行自动检测过滤
  container.querySelector('#btn-import-long').addEventListener('click', async () => {
    const text = container.querySelector('#long-import-text').value.trim();
    if (!text) {
      toast('请输入字卡内容');
      return;
    }

    haptic(10);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const existingLongs = await db.longFragments.toArray();
    const existingSet = new Set(existingLongs.map(item => item.content));

    let addCount = 0;
    let skipCount = 0;

    for (const line of lines) {
      if (existingSet.has(line)) {
        skipCount++;
      } else {
        await db.longFragments.add({
          content: line,
          createdAt: Date.now()
        });
        existingSet.add(line);
        addCount++;
      }
    }

    if (skipCount > 0) {
      toast(`导入成功 ${addCount} 条，跳过已存在的重复卡片 ${skipCount} 条`);
    } else {
      toast(`导入成功 ${addCount} 条长段字卡`);
    }
    switchTab('long-cards');
  });

  container.querySelectorAll('.long-item-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      haptic(8);
      await db.longFragments.delete(id);
      switchTab('long-cards');
    });
  });

  const clearBtn = container.querySelector('#btn-clear-all-long');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const ok = await confirmSheet('确定清空所有长段字卡吗？', { danger: true });
      if (ok) {
        haptic(12);
        await db.longFragments.clear();
        toast('已清空');
        switchTab('long-cards');
      }
    });
  }
}

async function updateUnreadAlert() {
  const unreadCount = await db.driftLetters.where({ type: 'received', isRead: 0 }).filter(l => l.status !== 'impulse').count();
  const alertBar = document.getElementById('unread-alert-bar');
  if (!alertBar) return;

  if (unreadCount > 0) {
    alertBar.innerHTML = `
      <div class="unread-alert-content">
        <span class="pulse-star">${DRIFT_ICON.starDust}</span>
        <span>你收到了 ${unreadCount} 封来自深空的回信，请前往 [收件箱] 打捞查收</span>
      </div>
    `;
    alertBar.style.display = 'block';
  } else {
    alertBar.style.display = 'none';
  }
}

// ----------------- [核心改造：写信冲动及通灵逻辑逻辑] -----------------

/**
 * 1. 命运之骰判定与写信任务执行：检查哪些处于 impulse 状态的角色信件已经超过了他们的随机撰写时间。
 * 如果到了时间，则正式动笔（调用角色生成引擎拼接），并转换状态为正常未读信件。
 */
async function processCompletedImpulses() {
  const now = Date.now();
  const letters = await db.driftLetters.toArray();
  const impulseLetters = letters.filter(l => l.status === 'impulse');

  for (const letter of impulseLetters) {
    // 到了时间点（startTime + duration）或者超过24小时Deadline，执行“动笔写信并寄出”
    const writeFinishedTime = letter.timestamp + (letter.duration || 3600000);
    const deadlineTime = letter.deadlineTime || (letter.timestamp + 24 * 3600000);

    if (now >= writeFinishedTime || now >= deadlineTime) {
      let replyText = '';
      if (letter.characterId === 'unknown') {
        const longs = await db.longFragments.toArray();
        replyText = longs.length > 0 ? pick(longs).content : pick(SPACE_WHISPERS);
      } else {
        try {
          // 真正的黑盒拼接字卡生成
          const result = await generateForCharacter(letter.characterId);
          if (result && result.messages && result.messages.length > 0) {
            replyText = result.messages.join('\n');
          } else {
            const longs = await db.longFragments.toArray();
            replyText = longs.length > 0 ? pick(longs).content : pick(SPACE_WHISPERS);
          }
        } catch (e) {
          replyText = pick(SPACE_WHISPERS);
        }
      }

      // 将写信冲动状态更新为真正的信件接收状态
      await db.driftLetters.update(letter.id, {
        status: 'received', // 取消 'impulse'，设定状态为接收完毕
        content: replyText,
        timestamp: Math.min(now, writeFinishedTime), // 保持真实的寄达时间
        isRead: 0
      });

      const charName = await getCharacterName(letter.characterId);
      toast(`✦ 一封来自 ${charName} 的信笺穿透星轨寄达了！✦`);
      haptic(25);
    }
  }
  
  // 触发全局未读红点同步
  window.dispatchEvent(new CustomEvent('drift-unread-updated'));
}

/**
 * 2. 离线命运判定：根据玩家上次离开网页的时间，以 15%/小时 的概率判定角色是否触发了写信冲动
 */
async function checkOfflineImpulseTrigger() {
  if (characters.length === 0) return;

  const now = Date.now();
  const lastActiveStr = localStorage.getItem('drift_last_active_time');
  localStorage.setItem('drift_last_active_time', String(now));

  if (!lastActiveStr) return; // 第一次登录不触发离线判定
  const lastActive = Number(lastActiveStr);
  const diffMs = now - lastActive;
  if (diffMs < 300000) return; // 离线小于 5 分钟不计算

  // 限制最大计算的离线小时数为 24 小时，防止长时间未登录产生垃圾数据
  const elapsedHours = Math.min(24, Math.floor(diffMs / 3600000));
  if (elapsedHours === 0) return;

  // 检查是否有任何已经在撰写的信
  const currentImpulses = await db.driftLetters.filter(l => l.status === 'impulse').toArray();
  if (currentImpulses.length > 0) return; // 同一时间只允许一个进行中的通灵写信事件

  let triggered = false;
  let triggerTimeOffset = 0;

  // 每一个小时均有 15% 概率触发判定
  for (let h = 1; h <= elapsedHours; h++) {
    if (Math.random() < 0.15) {
      triggered = true;
      triggerTimeOffset = h * 3600000;
      break;
    }
  }

  if (triggered) {
    const randomChar = pick(characters);
    const startTime = lastActive + triggerTimeOffset;
    // 随机 1 到 24 小时写信时间
    const duration = Math.floor(Math.random() * 23 + 1) * 3600000;

    await db.driftLetters.add({
      characterId: randomChar.id,
      timestamp: startTime,
      type: 'received',
      status: 'impulse',
      duration: duration,
      deadlineTime: startTime + 24 * 3600000,
      content: '',
      isRead: 0
    });

    // 顺便做一次计算，看它在离线期间是否已经写完了
    await processCompletedImpulses();
  }
}

/**
 * 3. 在线共鸣判定：当玩家交互/切换Tab时，有 15% 的概率随机引发在线共鸣
 */
let lastOnlineCheckTime = 0;
async function triggerOnlineResonanceCheck() {
  const now = Date.now();
  if (now - lastOnlineCheckTime < 60000) return; // 1 分钟检查冷却，避免高频操作刷屏
  lastOnlineCheckTime = now;

  // 必须没有正在撰写中的信
  const currentImpulses = await db.driftLetters.filter(l => l.status === 'impulse').toArray();
  if (currentImpulses.length > 0) return;

  // 15% 的概率判定
  if (Math.random() < 0.15) {
    const randomChar = pick(characters);
    if (!randomChar) return;

    // 播放边缘发光涟漪特效
    const ripple = document.getElementById('resonance-ripple-el');
    if (ripple) {
      ripple.classList.add('play');
      setTimeout(() => ripple.classList.remove('play'), 3000);
    }

    haptic(18);
    toast(`（星轨微芒）你与 ${randomChar.name} 产生了刹那的意识交叠，他写信的冲动已悄然萌发。`);

    // 触发写信冲动，并获得 1 ~ 24 小时随机写信时长
    const duration = Math.floor(Math.random() * 23 + 1) * 3600000;
    await db.driftLetters.add({
      characterId: randomChar.id,
      timestamp: now,
      type: 'received',
      status: 'impulse',
      duration: duration,
      deadlineTime: now + 24 * 3600000,
      content: '',
      isRead: 0
    });

    // 若当前是收件箱 Tab，直接重新渲染列表展示占位符
    if (activeTab === 'mailbox') {
      const view = document.getElementById('drift-view');
      if (view) renderMailboxView(view);
    }
  }
}

/**
 * 4. 主动唤醒仪式（动画 A）
 */
function openCommuneSelection() {
  const charOptions = [
    { text: '随机角色', value: 'random' },
    ...characters.map(c => ({ text: c.name, value: c.id }))
  ];

  pick('你想调谐与谁的星轨连接？', charOptions.map(o => o.text), (index) => {
    if (index === -1) return;
    const choice = charOptions[index].value;
    startCommuneRitual(choice);
  });
}

let communeTimer = null;
let communeProgress = 0;
let hapticInterval = null;

function startCommuneRitual(choice) {
  const overlay = document.getElementById('commune-overlay-el');
  const spinner = document.getElementById('portal-spinner');
  const title = document.getElementById('commune-status-title');
  const desc = document.getElementById('commune-status-desc');
  const touchZone = document.getElementById('commune-touch-zone');

  if (!overlay || !touchZone) return;

  // 重置状态
  communeProgress = 0;
  overlay.classList.add('show');
  overlay.classList.remove('charging');
  spinner.style.transform = 'rotate(0deg)';
  title.innerText = '星轨已就绪';
  desc.innerText = '按住中心以太星盘\n凝聚你的精神念想...';

  // 绑定长按交互 (支持移动端 touch 和 网页端 mouse)
  const onStart = (e) => {
    e.preventDefault();
    haptic(15);
    overlay.classList.add('charging');
    title.innerText = '调谐频率中...';
    desc.innerText = '不要松开，正在以太海中锁定他的频率';

    let durationPassed = 0;
    let hapticDelay = 350; // 震动反馈初速度 350ms，会逐渐缩短变得像心跳一样剧烈

    const runHapticLoop = () => {
      haptic(4);
      hapticInterval = setTimeout(() => {
        hapticDelay = Math.max(80, hapticDelay - 45); // 加快节奏
        runHapticLoop();
      }, hapticDelay);
    };
    runHapticLoop();

    communeTimer = setTimeout(async () => {
      // 达到 3 秒成功完成
      clearTimeout(hapticInterval);
      overlay.classList.remove('charging');
      haptic(30);

      // 确定调谐的角色
      let finalCharId = choice;
      if (choice === 'random') {
        if (characters.length > 0) {
          finalCharId = pick(characters).id;
        } else {
          finalCharId = 'unknown';
        }
      }

      const charName = await getCharacterName(finalCharId);
      title.innerText = '连接锁定！';
      desc.innerText = `你与 ${charName} 成功达成心灵羁绊。`;
      
      // 添加在撰写中的占位信
      const now = Date.now();
      const duration = Math.floor(Math.random() * 23 + 1) * 3600000;
      await db.driftLetters.add({
        characterId: finalCharId,
        timestamp: now,
        type: 'received',
        status: 'impulse',
        duration: duration,
        deadlineTime: now + 24 * 3600000,
        content: '',
        isRead: 0
      });

      setTimeout(() => {
        closeCommuneOverlay();
        toast(`星轨锁定成功，静候 ${charName} 提笔写信...`);
        switchTab('mailbox');
      }, 1500);

    }, 3000);
  };

  const onEnd = () => {
    if (communeTimer) {
      clearTimeout(communeTimer);
      communeTimer = null;
    }
    if (hapticInterval) {
      clearTimeout(hapticInterval);
      hapticInterval = null;
    }
    overlay.classList.remove('charging');
    
    if (title.innerText !== '连接锁定！') {
      title.innerText = '星轨断开';
      desc.innerText = '以太共鸣溃散了，请重新按住星盘。';
      haptic(5);
    }
  };

  touchZone.addEventListener('mousedown', onStart);
  touchZone.addEventListener('mouseup', onEnd);
  touchZone.addEventListener('mouseleave', onEnd);

  touchZone.addEventListener('touchstart', onStart, { passive: false });
  touchZone.addEventListener('touchend', onEnd);
  touchZone.addEventListener('touchcancel', onEnd);
}

function closeCommuneOverlay() {
  const overlay = document.getElementById('commune-overlay-el');
  if (overlay) {
    overlay.classList.remove('show');
  }
  if (communeTimer) clearTimeout(communeTimer);
  if (hapticInterval) clearTimeout(hapticInterval);
}

// 辅助：获取角色姓名
async function getCharacterName(charId) {
  if (charId === 'unknown') return '未知存在';
  const c = await db.characters.get(charId);
  return c ? c.name : '未知存在';
}

export function destroy() {
  clearAllTypingTimers();
  if (communeTimer) clearTimeout(communeTimer);
  if (hapticInterval) clearTimeout(hapticInterval);
}
