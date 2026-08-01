import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import { generateForCharacter } from '../cardEngine.js';
import {
  ICON, escapeHtml, formatTime, haptic, toast, openSheet, confirmSheet, pick
} from '../utils.js';

// 精美内联 SVG 图标，无 Unicode emoji
const DRIFT_ICON = {
  driftBottle: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M9 6h6M10 6v3.5a2 2 0 0 1-.58 1.42l-2.84 2.83A3 3 0 0 0 6 15.88V20a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.12a3 3 0 0 0-.58-2.13l-2.84-2.83A2 2 0 0 1 14 9.5V6"/><path d="M9 16h6M8 19h8"/></svg>`,
  envelope: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  mailbox: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h8"/><path d="M18 10.5V13a4 4 0 0 1-8 0V8h8"/><path d="M2 6l10 7 10-7"/><circle cx="18" cy="18" r="3"/><path d="M21 21l-1.5-1.5"/></svg>`,
  textCards: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  starDust: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M18.36 5.64l-1.42 1.42M7.05 16.95l-1.42 1.42M18.36 18.36l-1.42-1.42M7.05 7.05L5.64 5.64M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`,
  
  // 邮箱筒 SVG (线条勾勒风格)
  postboxCylinder: `<svg viewBox="0 0 64 64" width="76" height="76" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 22h24M16 30h32M20 48h24" opacity="0.4"/><path d="M16 26a16 16 0 0 1 32 0v26a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V26z"/><path d="M22 18V12h20v6"/><path d="M24 26h16v6H24z"/><path d="M32 32v12M28 38h8"/></svg>`,
  
  // 捞网/星海微波图标
  salvageWave: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.5-4.5 10-10 10S2 17.5 2 12M12 6v6l4 2"/><path d="M6 17c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0" opacity="0.6"/></svg>`
};

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
let writeStep = 'postbox'; // 'postbox' (邮箱筒) | 'envelope' (折叠信封) | 'paper' (书写纸张)
const typingTimers = new Map();

export async function render(root, params) {
  characters = await db.characters.toArray();

  root.innerHTML = `
    <div class="drift-container">
      <!-- 优化后的呼吸霓虹背景 -->
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

      <!-- 投递动画浮层 -->
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

  // 绑定导航事件
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
    writeStep = 'postbox';
    renderWriteView(view);
  } else if (tabName === 'mailbox') {
    await renderMailboxView(view);
  } else if (tabName === 'long-cards') {
    await renderLongCardsView(view);
  }

  updateUnreadAlert();
}

// ----------------- [视图渲染：写信流] -----------------
function renderWriteView(container) {
  const optionsHtml = characters.map(c => `
    <option value="${c.id}">寄给：${escapeHtml(c.name)}</option>
  `).join('');

  container.innerHTML = `
    <div class="drift-card write-card">
      
      <!-- 步骤1: 邮箱筒视图 -->
      <div class="postbox-step-view ${writeStep === 'postbox' ? 'active' : 'hide'}" id="step-postbox">
        <div class="postbox-cylinder-box">
          <div class="postbox-glowing-glow"></div>
          ${DRIFT_ICON.postboxCylinder}
        </div>
        <div class="postbox-hint">思绪已被封存，在此寄往深空</div>
        <button class="btn btn-primary" id="btn-start-write">
          ${DRIFT_ICON.envelope}
          开启信箱撰写思绪
        </button>
      </div>

      <!-- 步骤2: 信封封口视图 -->
      <div class="envelope-wrapper ${writeStep === 'envelope' ? 'active' : 'hide'}" id="step-envelope">
        <div class="envelope-outer">
          <div class="envelope-flap"></div>
          <div class="envelope-body-front"></div>
          <div class="envelope-paper-preview">
            <span class="paper-preview-text">写下你无法寄出的思绪...</span>
          </div>
          <button class="btn btn-primary btn-open-envelope" id="btn-open-envelope">
            ${DRIFT_ICON.envelope}
            打开信纸
          </button>
        </div>
      </div>

      <!-- 步骤3: 信纸书写视图 -->
      <div class="letter-paper-wrapper ${writeStep === 'paper' ? 'show' : 'hide'}" id="step-paper">
        <div class="letter-header">
          <select class="select drift-select-char" id="drift-char-select">
            <option value="unknown">投递至「未知深空」</option>
            ${optionsHtml}
          </select>
        </div>
        <textarea class="textarea drift-textarea" id="drift-content" placeholder="在这里写下你的念念不忘..." maxlength="500"></textarea>
        
        <div class="letter-actions">
          <button class="btn btn-secondary" id="btn-fold-envelope">收起</button>
          <button class="btn btn-primary" id="btn-throw-letter">
            ${DRIFT_ICON.driftBottle}
            投递出去
          </button>
        </div>
      </div>

    </div>
  `;

  // 事件1：点击邮箱筒开启写信
  container.querySelector('#btn-start-write').addEventListener('click', () => {
    haptic(10);
    writeStep = 'envelope';
    const pb = container.querySelector('#step-postbox');
    const ev = container.querySelector('#step-envelope');
    
    pb.classList.remove('active');
    pb.classList.add('hide');
    setTimeout(() => {
      ev.classList.remove('hide');
      ev.classList.add('active');
    }, 200);
  });

  // 事件2：打开信封
  container.querySelector('#btn-open-envelope').addEventListener('click', () => {
    haptic(10);
    const evBox = container.querySelector('#step-envelope');
    const paper = container.querySelector('#step-paper');
    
    evBox.classList.add('opened');
    setTimeout(() => {
      writeStep = 'paper';
      evBox.classList.remove('active');
      evBox.classList.add('hide');
      paper.classList.remove('hide');
      paper.classList.add('show');
    }, 450);
  });

  // 事件3：收起信纸回到信封
  container.querySelector('#btn-fold-envelope').addEventListener('click', () => {
    haptic(8);
    const evBox = container.querySelector('#step-envelope');
    const paper = container.querySelector('#step-paper');
    
    writeStep = 'envelope';
    paper.classList.remove('show');
    paper.classList.add('hide');
    
    evBox.classList.remove('opened');
    evBox.classList.remove('hide');
    evBox.classList.add('active');
  });

  // 事件4：投递出去
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

// ----------------- [写信投递动画与回信抽取] -----------------
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

async function generateDriftReply(sentContent, charId) {
  const now = Date.now();

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
    const longs = await db.longFragments.toArray();
    if (longs.length > 0) {
      const picked = pick(longs);
      replyText = picked.content;
    } else {
      replyText = pick(SPACE_WHISPERS);
    }
    finalCharId = 'unknown';
  } else {
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

  await db.driftLetters.add({
    characterId: finalCharId,
    timestamp: now + 500,
    type: 'received',
    content: replyText,
    isRead: 0
  });

  window.dispatchEvent(new CustomEvent('drift-unread-updated'));
}

// ----------------- [视图渲染：收件箱及打捞机制] -----------------
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
            <div class="empty-state-icon">${DRIFT_ICON.mailbox}</div>
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

  // 绑定信件卡片点击拆封
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

  // 删除信件事件
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

// ----------------- [打捞漂流瓶专属动画及弹出阅读] -----------------
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
      // 标记为已读
      await db.driftLetters.update(firstUnread.id, { isRead: 1 });
      
      // 优雅展开打捞信笺的底部弹窗
      openSalvagedLetterSheet(firstUnread);
      switchTab('mailbox');
    } else {
      toast('一无所获，星光又散去了');
    }
  }, 3000);
}

// 展开打捞结果弹窗
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

  // 延迟一小会儿后开始像打字机一样吐字
  setTimeout(() => {
    const textEl = root.querySelector('#salvaged-dialog-text');
    if (textEl) {
      triggerTypewriter(textEl, letterObj.content);
    }
  }, 200);
}

// ----------------- [打字机输出逻辑] -----------------
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

// ----------------- [视图渲染：长段字卡与自动去重] -----------------
async function renderLongCardsView(container) {
  const longs = await db.longFragments.orderBy('createdAt').reverse().toArray();

  container.innerHTML = `
    <div class="drift-card long-cards-card">
      <div class="long-cards-header">
        <div class="long-cards-title">长段字卡库</div>
        <div class="long-cards-desc">
          在这里导入大段文字（如长难句、诗篇、碎碎念），当投递给「未知深空」或关联角色没有字卡时，回信会从这里随机抽取。
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

  // 去重导入逻辑
  container.querySelector('#btn-import-long').addEventListener('click', async () => {
    const text = container.querySelector('#long-import-text').value.trim();
    if (!text) {
      toast('请输入字卡内容');
      return;
    }

    haptic(10);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    // 拉取现有的字卡内容做去重比对
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
        existingSet.add(line); // 加入集合防止此次批量导入内自身重复
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

// ----------------- [更新未读回信提醒] -----------------
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
