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
  
  // 收件箱大邮箱筒 SVG
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
          <div class="hint-text">写下你无法寄出的思绪...</div>
          <button class="btn-open-envelope" id="btn-trigger-open">
            ${DRIFT_ICON.envelope}
            打开信封
          </button>
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

    const unreadDot = (!isSent && !letter.isRead) ? '<span class="drift-unread-dot"></span>' : '';
    const bubbleClass = isSent ? 'sent-bubble' : 'received-bubble';

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
            <div class="empty-state-sub">去写封信投递到深空吧，或许会唤醒微弱的回音。</div>
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
    const itemId = Number(card.closest('.drift-timeline-item').getAttribute('data-id'));

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

  // 销毁信件
  container.querySelectorAll('[data-act="delete-letter"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const ok = await confirmSheet('确定销毁这封信吗？消逝的思绪将不可挽回。', {
        okText: '销毁',
        danger: true
      });
      if (ok) {
        haptic(8);
        await db.driftLetters.delete(id);
        toast('信件已烧毁');
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
    // 捞取第一条未读回信
    const firstUnread = await db.driftLetters
      .where({ type: 'received', isRead: 0 })
      .first();

    overlay.classList.remove('show');
    overlay.classList.add('hide');

    if (firstUnread) {
      haptic(20);
      await db.driftLetters.update(firstUnread.id, { isRead: 1 });
      openSalvagedLetterSheet(firstUnread);
      switchTab('mailbox');
    } else {
      toast('一无所获，星光又散去了');
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
  const unreadCount = await db.driftLetters.where({ type: 'received', isRead: 0 }).count();
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

export function destroy() {
  clearAllTypingTimers();
}
