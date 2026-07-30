import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, formatTime, formatDateSep,
  haptic, toast, sleep, randInt, openSheet, confirmSheet,
} from '../utils.js';
import { generateForCharacter } from '../cardEngine.js';

let state = {
  convId: null,
  conv: null,
  character: null,
  user: null,
  messages: [],
  typing: false,
  destroyed: false,
};

function shouldShowTimeSep(prev, curr) {
  if (!prev) return true;
  return (curr.timestamp - prev.timestamp) > 5 * 60 * 1000; // 5 分钟
}

function bubbleHTML(msg, character, user, showTimeSep) {
  const isUser = msg.sender === 'user';
  const av = isUser
    ? avatarHTML(user && user.avatar, (user && user.name) || '我', 32)
    : avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  const readMark = isUser
    ? `<span class="msg-read">${msg.isRead ? '已读' : '送达'}</span>`
    : '';
  const timeSep = showTimeSep
    ? `<div class="msg-time-sep">${formatDateSep(msg.timestamp)}　${formatTime(msg.timestamp)}</div>`
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
  // Remove typing before insert
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
    sender: 'user',
    content: text,
    type: 'text',
    status: 'sent',
    quotedMessageId: null,
    timestamp: Date.now(),
    isRead: false,
  };
  const id = await db.messages.add(msg);
  msg.id = id;
  appendMessage(msg);
  input.value = '';
  autoGrow(input);
  await persistConvSummary();
  updateSendBtn();
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

async function triggerReply() {
  if (!state.character) { toast('未绑定角色'); return; }
  const btn = document.querySelector('[data-act=trigger]');
  if (btn) btn.disabled = true;

  showTyping();
  await sleep(randInt(800, 2200));

  const { messages, reason } = await generateForCharacter(state.character.id);
  if (state.destroyed) return;

  if (!messages.length) {
    hideTyping();
    const tip = reason === 'no_fragments'
      ? '此角色暂无可用的字卡内容'
      : '生成失败';
    toast(tip, 2200);
    if (btn) btn.disabled = false;
    return;
  }

  // 将上一条用户消息标记已读
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
      sender: 'character',
      content: messages[i],
      type: 'card',
      status: 'sent',
      quotedMessageId: null,
      timestamp: Date.now(),
      isRead: true,
    };
    const id = await db.messages.add(msg);
    msg.id = id;
    hideTyping();
    appendMessage(msg);
  }
  await persistConvSummary();
  if (btn) btn.disabled = false;
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
  document.querySelectorAll('.msg-row[data-id]').forEach((row) => {
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

export async function render(root, params = {}) {
  state = { convId: Number(params.id), conv: null, character: null, user: null, messages: [], typing: false, destroyed: false };
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
        <button class="input-icon-btn" data-act="trigger" title="触发回复">${ICON.spark}</button>
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
        .chat-subtitle { font-size: 10px; color: var(--color-text-tertiary); letter-spacing: 1px; margin-top: 2px; }

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
  root.querySelector('[data-act=trigger]').addEventListener('click', () => { haptic(10); triggerReply(); });
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
}

function openChatMenu() {
  const { close } = openSheet({
    title: '对话操作',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-act="edit-char">
        <div class="sheet-list-body"><div class="sheet-list-title">编辑角色</div></div>
      </div>
      <div class="sheet-list-item" data-act="clear">
        <div class="sheet-list-body"><div class="sheet-list-title">清空消息</div></div>
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
    }
  });
}

export function destroy() {
  state.destroyed = true;
  clearTimeout(longPressTimer);
}
