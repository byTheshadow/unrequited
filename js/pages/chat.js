import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, formatTime, formatDateSep,
  haptic, toast, sleep, randInt, pick,
  openSheet, confirmSheet,
} from '../utils.js';
import {
  generateForCharacter,
  DEFAULT_THINKING_HINTS,
  DEFAULT_SKIP_HINTS,
} from '../cardEngine.js';
import * as keepAlive from '../lib/keepAlive.js';

let state = {
  convId: null,
  conv: null,
  character: null,
  user: null,
  messages: [],
  typing: false,
  destroyed: false,
  replyTimer: null,
  thinkingTimer: null,
  thinkingRotate: null,
  onVisibility: null,
};

function shouldShowTimeSep(prev, curr) {
  if (!prev) return true;
  return (curr.timestamp - prev.timestamp) > 5 * 60 * 1000;
}

function bubbleHTML(msg, character, user, showTimeSep) {
  const timeSep = showTimeSep
    ? `<div class="msg-time-sep">${formatDateSep(msg.timestamp)}　${formatTime(msg.timestamp)}</div>`
    : '';

  if (msg.sender === 'system' || msg.type === 'system') {
    return `${timeSep}<div class="msg-system" data-id="${msg.id}">${escapeHtml(msg.content)}</div>`;
  }

  const isUser = msg.sender === 'user';
  const av = isUser
    ? avatarHTML(user && user.avatar, (user && user.name) || '我', 32)
    : avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  const readMark = isUser
    ? `<span class="msg-read">${msg.isRead ? '已读' : '送达'}</span>`
    : '';
  return `
    ${timeSep}
    <div class="msg-row ${isUser ? 'msg-user' : 'msg-char'}" data-id="${msg.id}">
      ${!isUser ? `<div class="msg-avatar">${av}</div>` : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${escapeHtml(msg.content)}</div>
        ${isUser ? `<div class="msg-meta">${readMark}</div>` : ''}
      </div>
      ${isUser ? `<div class="msg-avatar">${av}</div>` : ''}
    </div>
  `;
}

function typingHTML(character) {
  const av = avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  return `
    <div class="msg-row msg-char msg-typing" id="typing-indicator">
      <div class="msg-avatar">${av}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble typing-bubble">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    </div>
  `;
}

async function loadAll(convId) {
  const conv = await db.conversations.get(convId);
  if (!conv) throw new Error('对话不存在');
  const character = await db.characters.get(conv.characterId);
  const user = (await db.user.toArray())[0] || { name: '我', avatar: '' };
  const messages = await db.messages.where('conversationId').equals(convId).sortBy('timestamp');
  return { conv, character, user, messages };
}

function renderMessages() {
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  let prev = null;
  const html = state.messages.map((m) => {
    const sep = shouldShowTimeSep(prev, m);
    prev = m;
    return bubbleHTML(m, state.character, state.user, sep);
  }).join('');
  box.innerHTML = html;
  scrollToBottom(false);
  bindBubbleEvents();
}

function scrollToBottom(smooth = true) {
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  requestAnimationFrame(() => {
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  });
}

function appendMessage(msg) {
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  const prev = state.messages[state.messages.length - 1] || null;
  const sep = shouldShowTimeSep(prev, msg);
  state.messages.push(msg);
  const t = document.getElementById('typing-indicator');
  const html = bubbleHTML(msg, state.character, state.user, sep);
  if (t) t.insertAdjacentHTML('beforebegin', html);
  else box.insertAdjacentHTML('beforeend', html);
  scrollToBottom(true);
  bindBubbleEvents();
}

async function persistConvSummary() {
  const last = state.messages[state.messages.length - 1];
  if (!last) return;
  await db.conversations.update(state.convId, {
    lastMessage: last.content,
    lastMessageTime: last.timestamp,
  });
}

async function sendUserMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const msg = {
    conversationId: state.convId,
    sender: 'user', content: text,
    type: 'text', status: 'sent',
    quotedMessageId: null,
    timestamp: Date.now(), isRead: false,
  };
  const id = await db.messages.add(msg);
  msg.id = id;
  appendMessage(msg);
  input.value = '';
  autoGrow(input);
  await persistConvSummary();
  updateSendBtn();

  await schedulePendingReply();
}

function showTyping() {
  if (state.typing) return;
  state.typing = true;
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', typingHTML(state.character));
  scrollToBottom(true);
}
function hideTyping() {
  state.typing = false;
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

// ============ 回复定时器 ============

async function schedulePendingReply() {
  const cfg = (state.character && state.character.replyConfig) || {};
  const minD = Math.max(0, cfg.minReplyDelaySec || 0);
  const maxD = Math.max(minD, cfg.maxReplyDelaySec || 0);
  if (maxD === 0) return; // 未启用延迟回复，等手动触发

  const delayMs = Math.round((minD + Math.random() * (maxD - minD)) * 1000);
  const target = Date.now() + delayMs;
  await db.conversations.update(state.convId, { pendingReplyAt: target });
  if (state.conv) state.conv.pendingReplyAt = target;
  scheduleTimers();
}

function scheduleTimers() {
  cancelTimers({ keepSubtitle: false });
  if (!state.conv || !state.conv.pendingReplyAt) return;

  const remain = state.conv.pendingReplyAt - Date.now();
  if (remain <= 0) {
    executeReply();
    return;
  }

  const cfg = (state.character && state.character.replyConfig) || {};
  const hints = (cfg.thinkingHints && cfg.thinkingHints.length) ? cfg.thinkingHints : DEFAULT_THINKING_HINTS;
  const typingDurationMs = 3000;

  if (remain > typingDurationMs + 500) {
    startThinkingUI(hints);
    state.thinkingTimer = setTimeout(() => {
      if (state.destroyed) return;
      stopThinkingUI();
      showTyping();
    }, remain - typingDurationMs);
  } else {
    showTyping();
  }

  state.replyTimer = setTimeout(() => {
    if (state.destroyed) return;
    executeReply();
  }, remain);
}

function cancelTimers({ keepSubtitle } = {}) {
  clearTimeout(state.replyTimer);
  clearTimeout(state.thinkingTimer);
  clearInterval(state.thinkingRotate);
  state.replyTimer = null;
  state.thinkingTimer = null;
  state.thinkingRotate = null;
  if (!keepSubtitle) stopThinkingUI();
  hideTyping();
}

function startThinkingUI(hints) {
  const sub = document.getElementById('chat-subtitle');
  if (!sub) return;
  sub.classList.add('thinking');
  let idx = 0;
  sub.textContent = hints[idx];
  clearInterval(state.thinkingRotate);
  state.thinkingRotate = setInterval(() => {
    idx = (idx + 1) % hints.length;
    sub.textContent = hints[idx];
  }, 2800);
}

function stopThinkingUI() {
  const sub = document.getElementById('chat-subtitle');
  if (sub) {
    sub.classList.remove('thinking');
    const sig = state.character && state.character.signature;
    sub.textContent = sig || '';
  }
  clearInterval(state.thinkingRotate);
  state.thinkingRotate = null;
}

async function executeReply() {
  cancelTimers();
  if (state.destroyed) return;
  if (!state.character) { toast('未绑定角色'); return; }

  // 清除 pending 标记
  await db.conversations.update(state.convId, { pendingReplyAt: null });
  if (state.conv) state.conv.pendingReplyAt = null;

  const cfg = state.character.replyConfig || {};

  // 已读不回判定
  const skipChance = Math.min(1, Math.max(0, cfg.skipReplyChance || 0));
  if (skipChance > 0 && Math.random() < skipChance) {
    const skipList = (cfg.skipHints && cfg.skipHints.length) ? cfg.skipHints : DEFAULT_SKIP_HINTS;
    // user 上一条设为"已读"（对方看到了但没回）
    const lastUserMsg = [...state.messages].reverse().find((m) => m.sender === 'user' && !m.isRead);
    if (lastUserMsg) {
      await db.messages.update(lastUserMsg.id, { isRead: true });
      lastUserMsg.isRead = true;
      const el = document.querySelector(`.msg-row[data-id="${lastUserMsg.id}"] .msg-read`);
      if (el) el.textContent = '已读';
    }
    const sysMsg = {
      conversationId: state.convId,
      sender: 'system', content: pick(skipList),
      type: 'system', status: 'sent',
      quotedMessageId: null,
      timestamp: Date.now(), isRead: true,
    };
    const sysId = await db.messages.add(sysMsg);
    sysMsg.id = sysId;
    appendMessage(sysMsg);
    await persistConvSummary();
    return;
  }

  // 正常生成
  showTyping();
  await sleep(randInt(400, 900));
  if (state.destroyed) return;

  const { messages, reason } = await generateForCharacter(state.character.id);
  if (state.destroyed) return;

  if (!messages.length) {
    hideTyping();
    toast(reason === 'no_fragments' ? '此角色暂无可用的字卡内容' : '生成失败', 2200);
    return;
  }

  const lastUserMsg = [...state.messages].reverse().find((m) => m.sender === 'user' && !m.isRead);
  if (lastUserMsg) {
    await db.messages.update(lastUserMsg.id, { isRead: true });
    lastUserMsg.isRead = true;
    const el = document.querySelector(`.msg-row[data-id="${lastUserMsg.id}"] .msg-read`);
    if (el) el.textContent = '已读';
  }

  for (let i = 0; i < messages.length; i++) {
    if (state.destroyed) return;
    if (i > 0) {
      hideTyping(); showTyping();
      await sleep(randInt(600, 1400));
    }
    const msg = {
      conversationId: state.convId,
      sender: 'character', content: messages[i],
      type: 'card', status: 'sent',
      quotedMessageId: null,
      timestamp: Date.now(), isRead: true,
    };
    const id = await db.messages.add(msg);
    msg.id = id;
    hideTyping();
    appendMessage(msg);
  }
  await persistConvSummary();
}

// 手动星形按钮：跳过等待，立刻发送
async function manualTrigger() {
  const btn = document.querySelector('[data-act=trigger]');
  if (btn) btn.disabled = true;
  try {
    await executeReply();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateSendBtn() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;
  btn.disabled = !input.value.trim();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

let longPressTimer = null;
function bindBubbleEvents() {
  document.querySelectorAll('.msg-scroll [data-id]').forEach((row) => {
    const id = Number(row.getAttribute('data-id'));
    let moved = false;
    row.addEventListener('pointerdown', () => {
      moved = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => { if (!moved) openMsgActions(id); }, 500);
    });
    row.addEventListener('pointermove', () => { moved = true; });
    row.addEventListener('pointerup', () => clearTimeout(longPressTimer));
    row.addEventListener('pointerleave', () => clearTimeout(longPressTimer));
    row.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
  });
}

async function openMsgActions(id) {
  haptic(15);
  const { close } = openSheet({
    title: '消息',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-act="copy">
        <div class="sheet-list-body"><div class="sheet-list-title">复制文本</div></div>
      </div>
      <div class="sheet-list-item" data-act="delete">
        <div class="sheet-list-body"><div class="sheet-list-title" style="color:#dc2626;">删除消息</div></div>
      </div>
    </div>`,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.sheet-list-item');
    if (!item) return;
    const act = item.getAttribute('data-act');
    const msg = state.messages.find((m) => m.id === id);
    if (act === 'copy' && msg) {
      try { await navigator.clipboard.writeText(msg.content); toast('已复制'); }
      catch (e) { toast('复制失败'); }
      close();
    } else if (act === 'delete') {
      close();
      const ok = await confirmSheet('确定删除这条消息？', { danger: true, okText: '删除' });
      if (ok) {
        await db.messages.delete(id);
        state.messages = state.messages.filter((m) => m.id !== id);
        renderMessages();
        await persistConvSummary();
      }
    }
  });
}

async function openChatMenu() {
  const kaOn = await keepAlive.loadEnabled();
  const kaLive = keepAlive.isRunning();
  const { close } = openSheet({
    title: '对话操作',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-act="edit-char">
        <div class="sheet-list-body"><div class="sheet-list-title">编辑角色</div></div>
      </div>
      <div class="sheet-list-item" data-act="clear">
        <div class="sheet-list-body"><div class="sheet-list-title">清空消息</div></div>
      </div>
      <div class="sheet-list-item" data-act="keepalive">
        <div class="sheet-list-body">
          <div class="sheet-list-title">后台保活（实验）</div>
          <div class="sheet-list-sub">${kaOn ? (kaLive ? '已开启并在运行' : '已开启，未在运行（需要交互触发）') : '未开启，仅前台准时'}</div>
        </div>
        <div class="ka-toggle ${kaOn ? 'on' : ''}">${kaOn ? '开' : '关'}</div>
      </div>
    </div>`,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.sheet-list-item');
    if (!item) return;
    const act = item.getAttribute('data-act');
    if (act === 'edit-char') {
      close();
      if (state.character) navigate(`/characters?edit=${state.character.id}`);
      else toast('未绑定角色');
    } else if (act === 'clear') {
      close();
      const ok = await confirmSheet('清空所有消息？', { danger: true, okText: '清空' });
      if (ok) {
        await db.messages.where('conversationId').equals(state.convId).delete();
        state.messages = [];
        renderMessages();
        await db.conversations.update(state.convId, { lastMessage: '', lastMessageTime: Date.now() });
        toast('已清空');
      }
    } else if (act === 'keepalive') {
      const now = await keepAlive.loadEnabled();
      if (now) {
        keepAlive.stop();
        await keepAlive.saveEnabled(false);
        toast('已关闭后台保活');
      } else {
        const ok = await keepAlive.start();
        await keepAlive.saveEnabled(true);
        toast(ok ? '已开启，尝试保活中' : '已开启，下次交互后生效');
      }
      close();
    }
  });
}

export async function render(root, params = {}) {
  state = {
    convId: Number(params.id),
    conv: null, character: null, user: null,
    messages: [], typing: false, destroyed: false,
    replyTimer: null, thinkingTimer: null, thinkingRotate: null,
    onVisibility: null,
  };
  if (!state.convId) { navigate('/cards'); return; }

  root.innerHTML = `
    <div class="page chat-page">
      <div class="top-bar">
        <button class="top-bar-btn" data-act="back" aria-label="返回">${ICON.back}</button>
        <div class="chat-title-wrap">
          <div class="chat-title" id="chat-title">加载中</div>
          <div class="chat-subtitle" id="chat-subtitle"></div>
        </div>
        <button class="top-bar-btn" data-act="menu" aria-label="更多">${ICON.more}</button>
      </div>

      <div class="msg-scroll" id="msg-scroll"></div>

      <div class="chat-input-bar">
        <button class="input-icon-btn" data-act="trigger" title="立即触发回复">${ICON.spark}</button>
        <textarea id="chat-input" class="chat-input" rows="1" placeholder="说点什么..." maxlength="2000"></textarea>
        <button class="input-icon-btn send" id="send-btn" data-act="send" disabled title="发送">${ICON.send}</button>
      </div>

      <style>
        .chat-page {
          display: flex; flex-direction: column;
          height: 100vh; height: 100dvh;
          overflow: hidden;
        }
        .chat-title-wrap { flex: 1; text-align: center; overflow: hidden; }
        .chat-title { font-size: 14px; letter-spacing: 2px; color: var(--color-text-primary); }
        .chat-subtitle {
          font-size: 10px; color: var(--color-text-tertiary);
          letter-spacing: 1px; margin-top: 2px;
          transition: color 0.4s;
        }
        .chat-subtitle.thinking {
          color: var(--color-text-secondary);
          animation: breath 2.4s ease-in-out infinite;
        }

        .msg-scroll {
          flex: 1;
          overflow-y: auto; overflow-x: hidden;
          padding: 12px 14px 8px;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        .msg-time-sep {
          text-align: center; font-size: 10px;
          color: var(--color-text-tertiary);
          letter-spacing: 2px; padding: 14px 0 6px;
        }
        .msg-row {
          display: flex; gap: 8px; margin-bottom: 6px;
          align-items: flex-end;
          animation: fadeIn 0.35s ease;
        }
        .msg-row.msg-user { justify-content: flex-end; }
        .msg-avatar { flex-shrink: 0; }
        .msg-bubble-wrap { display: flex; flex-direction: column; max-width: 72%; }
        .msg-row.msg-user .msg-bubble-wrap { align-items: flex-end; }
        .msg-bubble {
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.55;
          word-break: break-word;
          white-space: pre-wrap;
          background: var(--color-bubble-character);
          color: var(--color-bubble-text);
          border-top-left-radius: 6px;
          box-shadow: 0 1px 2px var(--color-shadow);
        }
        .msg-row.msg-user .msg-bubble {
          background: var(--color-bubble-user);
          border-top-left-radius: 18px;
          border-top-right-radius: 6px;
        }
        .msg-meta {
          font-size: 10px;
          color: var(--color-text-tertiary);
          margin-top: 3px; padding: 0 4px;
          letter-spacing: 1px;
        }

        /* system 消息（居中灰） */
        .msg-system {
          text-align: center;
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: 2px;
          padding: 10px 24px;
          margin: 4px 0;
          animation: fadeIn 0.45s ease;
        }

        /* 输入指示器 */
        .typing-bubble {
          display: inline-flex; gap: 4px; padding: 12px 14px;
        }
        .typing-bubble .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-text-tertiary);
          animation: typingBounce 1.2s infinite ease-in-out;
        }
        .typing-bubble .dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-bubble .dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-4px); opacity: 1; }
        }

        /* 输入栏 */
        .chat-input-bar {
          display: flex; align-items: flex-end; gap: 6px;
          padding: 8px 10px;
          padding-bottom: calc(8px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--color-border);
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
        }
        .chat-input {
          flex: 1; min-height: 40px; max-height: 120px;
          padding: 10px 14px;
          border-radius: 20px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          color: var(--color-text-primary);
          font-size: 14px; line-height: 1.4;
          resize: none; overflow-y: auto;
        }
        .chat-input:focus { border-color: var(--color-accent); }
        .input-icon-btn {
          width: 40px; height: 40px; flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: var(--color-bg-secondary);
          transition: transform 0.15s, background 0.2s, color 0.2s;
        }
        .input-icon-btn:active { transform: scale(0.9); }
        .input-icon-btn.send { background: var(--color-accent); color: var(--color-bg-primary); }
        .input-icon-btn:disabled { opacity: 0.35; }

        .ka-toggle {
          font-size: 12px; letter-spacing: 2px;
          padding: 3px 10px; border-radius: 999px;
          background: var(--color-bg-tertiary);
          color: var(--color-text-tertiary);
        }
        .ka-toggle.on {
          background: var(--color-accent);
          color: var(--color-bg-primary);
        }
      </style>
    </div>
  `;

  try {
    const data = await loadAll(state.convId);
    if (state.destroyed) return;
    Object.assign(state, data);
  } catch (e) {
    toast(e.message || '对话加载失败');
    goBack('/cards');
    return;
  }

  document.getElementById('chat-title').textContent = (state.character && state.character.name) || '（角色已删除）';
  const sig = state.character && state.character.signature;
  document.getElementById('chat-subtitle').textContent = sig ? sig : '';

  renderMessages();

  // 事件
  root.querySelector('[data-act=back]').addEventListener('click', () => { haptic(6); goBack('/cards'); });
  root.querySelector('[data-act=menu]').addEventListener('click', openChatMenu);
  root.querySelector('[data-act=trigger]').addEventListener('click', () => { haptic(10); manualTrigger(); });
  const sendBtn = document.getElementById('send-btn');
  sendBtn.addEventListener('click', () => { haptic(6); sendUserMessage(); });

  const input = document.getElementById('chat-input');
  input.addEventListener('input', () => { autoGrow(input); updateSendBtn(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendUserMessage();
    }
  });

  // 恢复 pending 定时器（进入页面时检查）
  if (state.conv && state.conv.pendingReplyAt) {
    scheduleTimers();
  }

  // visibilitychange：回到前台时重新调度（兜底）
  state.onVisibility = async () => {
    if (state.destroyed) return;
    if (document.visibilityState !== 'visible') return;
    // 重新读一下 conv，可能被别处更新
    const fresh = await db.conversations.get(state.convId);
    if (fresh) {
      state.conv = fresh;
      if (fresh.pendingReplyAt) scheduleTimers();
    }
  };
  document.addEventListener('visibilitychange', state.onVisibility);

  // 尝试启动保活（如果用户之前开启过）
  if (await keepAlive.loadEnabled()) {
    keepAlive.start(); // 可能因未交互而失败，等用户下次点击后再触发
  }
}

export function destroy() {
  state.destroyed = true;
  cancelTimers();
  clearTimeout(longPressTimer);
  if (state.onVisibility) {
    document.removeEventListener('visibilitychange', state.onVisibility);
    state.onVisibility = null;
  }
}
