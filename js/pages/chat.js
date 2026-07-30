import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, escapeAttr, formatTime, formatDateSep,
  haptic, toast, sleep, randInt, pick,
  openSheet, confirmSheet,
} from '../utils.js';
import {
  generateForCharacter,
  DEFAULT_THINKING_HINTS,
  DEFAULT_SKIP_HINTS,
  DEFAULT_SYNC_HINTS,
  DEFAULT_SYNC_CHANCE,
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
  onViewport: null,
};

const PRESET_LABELS = {
  'preset-1': '极简圆角',
  'preset-2': '方角硬朗',
  'preset-3': '大圆角糖果',
  'preset-4': '描边气泡',
  'preset-5': '长信笺',
  'custom': '自定义 CSS',
};
function bubblePresetLabel(k) {
  return PRESET_LABELS[k] || '极简圆角（默认）';
}

function shouldShowTimeSep(prev, curr) {
  if (!prev) return true;
  return (curr.timestamp - prev.timestamp) > 5 * 60 * 1000;
}

function bubbleHTML(msg, character, user, showTimeSep) {
  const timeSep = showTimeSep
    ? `<div class="msg-time-sep">${formatDateSep(msg.timestamp)}　${formatTime(msg.timestamp)}</div>`
    : '';

  if (msg.sender === 'system' || msg.type === 'system' || msg.type === 'sync') {
    const isSync = msg.type === 'sync';
    return `${timeSep}<div class="msg-system ${isSync ? 'msg-sync' : ''}" data-id="${msg.id}">
      ${isSync ? '<span class="sync-mark">◈</span>' : ''}${escapeHtml(msg.content)}
    </div>`;
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

function typingHTML(character, hint) {
  const av = avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  return `
    <div class="msg-row msg-char msg-typing" id="typing-indicator">
      <div class="msg-avatar">${av}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-bubble typing-bubble">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          ${hint ? `<span class="typing-hint">${escapeHtml(hint)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function shuffleHTML(character) {
  const av = avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  return `
    <div class="msg-row msg-char msg-shuffling" id="shuffle-fx">
      <div class="msg-avatar">${av}</div>
      <div class="shuffle-stage">
        <span class="frag"></span>
        <span class="frag"></span>
        <span class="frag"></span>
        <span class="frag"></span>
        <span class="frag"></span>
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
  const anchor = document.getElementById('typing-indicator') || document.getElementById('shuffle-fx');
  const html = bubbleHTML(msg, state.character, state.user, sep);
  if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
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

async function updateConv(patch) {
  await db.conversations.update(state.convId, patch);
  if (state.conv) Object.assign(state.conv, patch);
  applyChatStyles();
}

function applyChatStyles() {
  const page = document.querySelector('.chat-page');
  if (!page || !state.conv) return;
  const c = state.conv;

  const preset = c.bubbleStyle || 'preset-1';
  page.dataset.bubblePreset = preset;

  const styleEl = document.getElementById('chat-user-css');
  if (styleEl) {
    styleEl.textContent = (preset === 'custom' && c.customBubbleCSS) ? c.customBubbleCSS : '';
  }

  const wp = page.querySelector('.chat-wallpaper');
  if (wp) {
    if (c.wallpaper) {
      const safe = String(c.wallpaper).replace(/"/g, '\\"');
      wp.style.backgroundImage = `url("${safe}")`;
      wp.classList.add('has-wallpaper');
    } else {
      wp.style.backgroundImage = '';
      wp.classList.remove('has-wallpaper');
    }
  }
}

async function sendUserMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const dock = document.querySelector('.chat-input-dock');
  if (dock) { dock.classList.remove('sent-pulse'); void dock.offsetWidth; dock.classList.add('sent-pulse'); }

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

function showShuffling() {
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  if (document.getElementById('shuffle-fx')) return;
  box.insertAdjacentHTML('beforeend', shuffleHTML(state.character));
  scrollToBottom(true);
}
function hideShuffling() {
  const el = document.getElementById('shuffle-fx');
  if (el) el.remove();
}

function showTyping() {
  if (state.typing) return;
  state.typing = true;
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  const hint = state.conv && state.conv.typingHint;
  box.insertAdjacentHTML('beforeend', typingHTML(state.character, hint));
  scrollToBottom(true);
}
function hideTyping() {
  state.typing = false;
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

async function schedulePendingReply() {
  const cfg = (state.character && state.character.replyConfig) || {};
  const minD = Math.max(0, cfg.minReplyDelaySec || 0);
  const maxD = Math.max(minD, cfg.maxReplyDelaySec || 0);
  if (maxD === 0) return;

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
  if (remain <= 0) { executeReply(); return; }

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
  hideShuffling();
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

async function maybeInsertSyncMessage() {
  const cfg = (state.character && state.character.replyConfig) || {};
  const chance = typeof cfg.syncChance === 'number' ? cfg.syncChance : DEFAULT_SYNC_CHANCE;
  if (chance <= 0 || Math.random() >= chance) return false;

  const list = (cfg.syncHints && cfg.syncHints.length) ? cfg.syncHints : DEFAULT_SYNC_HINTS;
  const syncMsg = {
    conversationId: state.convId,
    sender: 'system',
    content: pick(list),
    type: 'sync',
    status: 'sent',
    quotedMessageId: null,
    timestamp: Date.now(),
    isRead: true,
  };
  const id = await db.messages.add(syncMsg);
  syncMsg.id = id;
  appendMessage(syncMsg);
  haptic(20);
  return true;
}

async function executeReply() {
  cancelTimers();
  if (state.destroyed) return;
  if (!state.character) { toast('未绑定角色'); return; }

  await db.conversations.update(state.convId, { pendingReplyAt: null });
  if (state.conv) state.conv.pendingReplyAt = null;

  const cfg = state.character.replyConfig || {};

  await maybeInsertSyncMessage();
  if (state.destroyed) return;

  const skipChance = Math.min(1, Math.max(0, cfg.skipReplyChance || 0));
  if (skipChance > 0 && Math.random() < skipChance) {
    const skipList = (cfg.skipHints && cfg.skipHints.length) ? cfg.skipHints : DEFAULT_SKIP_HINTS;
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

  showShuffling();
  await sleep(700);
  if (state.destroyed) return;
  hideShuffling();

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

async function manualTrigger() {
  const btn = document.querySelector('[data-act=trigger]');
  if (btn) {
    btn.disabled = true;
    btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
  }
  try { await executeReply(); }
  finally { if (btn) btn.disabled = false; }
}

function updateSendBtn() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;
  const hasContent = !!input.value.trim();
  btn.disabled = !hasContent;
  btn.classList.toggle('active', hasContent);
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function bindViewportFollow() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const update = () => {
    const d = document.querySelector('.chat-input-dock');
    if (!d) return;
    const keyboardOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    d.style.transform = `translateY(-${keyboardOffset}px)`;
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  state.onViewport = () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
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
  const wpText = state.conv && state.conv.wallpaper ? '已设置' : '未设置';
  const bubbleText = bubblePresetLabel(state.conv && state.conv.bubbleStyle);
  const typingText = (state.conv && state.conv.typingHint)
    ? escapeHtml(state.conv.typingHint)
    : '默认（仅三点动画）';

  const { close } = openSheet({
    title: '对话操作',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-act="edit-char">
        <div class="sheet-list-body"><div class="sheet-list-title">编辑角色</div></div>
      </div>
      <div class="sheet-list-item" data-act="bubble-style">
        <div class="sheet-list-body">
          <div class="sheet-list-title">气泡样式</div>
          <div class="sheet-list-sub">${bubbleText}</div>
        </div>
      </div>
      <div class="sheet-list-item" data-act="wallpaper">
        <div class="sheet-list-body">
          <div class="sheet-list-title">聊天壁纸</div>
          <div class="sheet-list-sub">${wpText}</div>
        </div>
      </div>
      <div class="sheet-list-item" data-act="typing-hint">
        <div class="sheet-list-body">
          <div class="sheet-list-title">打字文案</div>
          <div class="sheet-list-sub">${typingText}</div>
        </div>
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
    } else if (act === 'bubble-style') {
      close();
      await sleep(280);
      openBubbleStyleSheet();
    } else if (act === 'wallpaper') {
      close();
      await sleep(280);
      openWallpaperSheet();
    } else if (act === 'typing-hint') {
      close();
      await sleep(280);
      openTypingHintSheet();
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

async function openBubbleStyleSheet() {
  const current = (state.conv && state.conv.bubbleStyle) || 'preset-1';
  const presets = ['preset-1', 'preset-2', 'preset-3', 'preset-4', 'preset-5'];
  const listHTML = presets.map((k) => `
    <div class="sheet-list-item ${k === current ? 'selected' : ''}" data-preset="${k}">
      <div class="sheet-list-body">
        <div class="sheet-list-title">${PRESET_LABELS[k]}</div>
      </div>
      <div class="sheet-list-check">${k === current ? '<span style="font-size:11px;">已选</span>' : ''}</div>
    </div>
  `).join('');

  const { close } = openSheet({
    title: '气泡样式',
    body: `<div class="sheet-list">
      ${listHTML}
      <div class="sheet-list-item ${current === 'custom' ? 'selected' : ''}" data-preset="custom">
        <div class="sheet-list-body">
          <div class="sheet-list-title">${PRESET_LABELS.custom}</div>
          <div class="sheet-list-sub">直接编辑本对话样式</div>
        </div>
        <div class="sheet-list-check">${current === 'custom' ? '<span style="font-size:11px;">已选</span>' : ''}</div>
      </div>
    </div>`,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.sheet-list-item');
    if (!item) return;
    const preset = item.getAttribute('data-preset');
    if (preset === 'custom') {
      close();
      await sleep(280);
      openCustomCSSSheet();
    } else {
      await updateConv({ bubbleStyle: preset });
      close();
      toast('已应用');
    }
  });
}

function openCustomCSSSheet() {
  const current = (state.conv && state.conv.customBubbleCSS) || '';
  const { close } = openSheet({
    title: '自定义 CSS',
    body: `
      <div class="field-hint" style="margin-bottom:10px; line-height:1.7;">
        针对本对话生效。可用选择器示例：<br>
        <code>.msg-bubble</code> 所有气泡<br>
        <code>.msg-row.msg-user .msg-bubble</code> 用户气泡<br>
        <code>.msg-row.msg-char .msg-bubble</code> 角色气泡<br>
        <code>.msg-time-sep</code> 时间分隔
      </div>
      <textarea id="custom-css-input" class="textarea" style="min-height:200px; font-family: ui-monospace, 'SF Mono', Consolas, monospace; font-size:12.5px; letter-spacing:0;" placeholder=".msg-bubble { background: #1a1a2e; border-radius: 12px; }">${escapeHtml(current)}</textarea>
      <div class="sheet-actions">
        <button class="btn btn-secondary" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="save">保存并应用</button>
      </div>
    `,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel') { close(); }
    else if (act === 'save') {
      const val = document.getElementById('custom-css-input').value;
      await updateConv({ bubbleStyle: 'custom', customBubbleCSS: val });
      close();
      toast('已应用');
    }
  });
}

function fileToWallpaperDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read fail'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img fail'));
      img.onload = () => {
        const maxW = 1200;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); }
        catch (err) { reject(err); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openWallpaperSheet() {
  const cur = state.conv && state.conv.wallpaper;
  const hasWP = !!cur;
  const isDataURL = hasWP && String(cur).startsWith('data:');
  const currentURL = hasWP && !isDataURL ? cur : '';

  const { close } = openSheet({
    title: '聊天壁纸',
    body: `
      <div class="field">
        <div class="field-label">图片 URL</div>
        <input id="wp-url" class="input" type="text" placeholder="https://..." value="${escapeAttr(currentURL)}">
      </div>
      <div class="field">
        <div class="field-label">或上传本地图片</div>
        <input id="wp-file" type="file" accept="image/*" style="font-size:13px; color: var(--color-text-secondary);">
        <div class="field-hint">会自动压缩到最大宽 1200</div>
      </div>
      ${hasWP ? '<div class="field-hint" style="margin-bottom:12px;">当前已有壁纸' + (isDataURL ? '（本地图片）' : '（URL）') + '</div>' : ''}
      <div class="sheet-actions">
        ${hasWP ? '<button class="btn btn-secondary" data-act="remove">移除</button>' : ''}
        <button class="btn btn-secondary" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="save">应用</button>
      </div>
    `,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel') close();
    else if (act === 'remove') {
      await updateConv({ wallpaper: null });
      close();
      toast('已移除壁纸');
    } else if (act === 'save') {
      const url = document.getElementById('wp-url').value.trim();
      const fileInput = document.getElementById('wp-file');
      const file = fileInput && fileInput.files && fileInput.files[0];
      let val = null;
      btn.disabled = true;
      if (file) {
        try { val = await fileToWallpaperDataURL(file); }
        catch (err) { toast('图片读取失败'); btn.disabled = false; return; }
      } else if (url) {
        val = url;
      }
      if (!val) { toast('请输入 URL 或选择文件'); btn.disabled = false; return; }
      await updateConv({ wallpaper: val });
      close();
      toast('壁纸已应用');
    }
  });
}

function openTypingHintSheet() {
  const current = (state.conv && state.conv.typingHint) || '';
  const { close } = openSheet({
    title: '打字文案',
    body: `
      <div class="field">
        <div class="field-label">显示在三点动画右侧（留空则只显示三点）</div>
        <input id="th-input" class="input" type="text" placeholder="正在编辑" value="${escapeAttr(current)}" maxlength="20">
        <div class="field-hint">建议 8 字以内</div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="save">保存</button>
      </div>
    `,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel') close();
    else if (act === 'save') {
      const val = document.getElementById('th-input').value.trim();
      await updateConv({ typingHint: val || null });
      close();
      toast('已保存');
    }
  });
}

export async function render(root, params = {}) {
  state = {
    convId: Number(params.id),
    conv: null, character: null, user: null,
    messages: [], typing: false, destroyed: false,
    replyTimer: null, thinkingTimer: null, thinkingRotate: null,
    onVisibility: null, onViewport: null,
  };
  if (!state.convId) { navigate('/cards'); return; }

  root.innerHTML = `
    <div class="page chat-page" data-bubble-preset="preset-1">
      <div class="chat-wallpaper"></div>

      <header class="chat-header">
        <button class="chat-nav-btn" data-act="back" aria-label="返回">${ICON.back}</button>
        <div class="chat-header-center">
          <div class="chat-header-avatar" id="chat-header-avatar"></div>
          <div class="chat-header-text">
            <div class="chat-title" id="chat-title">加载中</div>
            <div class="chat-subtitle" id="chat-subtitle"></div>
          </div>
        </div>
        <button class="chat-nav-btn" data-act="menu" aria-label="更多">${ICON.more}</button>
      </header>

      <div class="msg-scroll" id="msg-scroll"></div>

      <div class="chat-input-dock">
        <button class="dock-btn spark" data-act="trigger" title="立即触发回复">${ICON.spark}</button>
        <textarea id="chat-input" class="dock-input" rows="1" placeholder="说点什么..." maxlength="2000"></textarea>
        <button class="dock-btn send" id="send-btn" data-act="send" disabled title="发送">${ICON.send}</button>
      </div>

      <style>
        .chat-page {
          display: flex; flex-direction: column;
          height: 100vh; height: 100dvh;
          overflow: hidden;
          position: relative;
        }

        /* ============ 壁纸层 ============ */
        .chat-wallpaper {
          position: absolute; inset: 0;
          z-index: 0;
          pointer-events: none;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .chat-wallpaper.has-wallpaper::after {
          content: '';
          position: absolute; inset: 0;
          background: var(--color-bg-primary);
          opacity: 0.5;
        }

        /* ============ 精简浮动顶栏 ============ */
        .chat-header {
          position: relative;
          z-index: 10;
          display: flex; align-items: center;
          padding: 12px 8px 8px;
          padding-top: calc(env(safe-area-inset-top) + 10px);
          gap: 4px;
          background: transparent;
        }
        .chat-header::after {
          content: '';
          position: absolute; left: 20%; right: 20%; bottom: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--color-border), transparent);
          opacity: 0.5;
        }
        .chat-nav-btn {
          width: 36px; height: 36px;
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: transparent;
          transition: transform 0.15s, background 0.2s, color 0.2s;
        }
        .chat-nav-btn:active {
          transform: scale(0.88);
          background: var(--color-bg-secondary);
          color: var(--color-text-primary);
        }
        .chat-header-center {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          gap: 10px;
          min-width: 0;
        }
        .chat-header-avatar .avatar {
          width: 34px; height: 34px; font-size: 13px;
        }
        .chat-header-text {
          display: flex; flex-direction: column;
          align-items: flex-start;
          min-width: 0;
          max-width: 62%;
        }
        .chat-title {
          font-size: 14px;
          letter-spacing: 2px;
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-subtitle {
          font-size: 10px;
          color: var(--color-text-tertiary);
          letter-spacing: 1px;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          transition: color 0.4s;
        }
        .chat-subtitle.thinking {
          color: var(--color-text-secondary);
          animation: breath 2.4s ease-in-out infinite;
        }

        /* ============ 消息区 ============ */
        .msg-scroll {
          position: relative;
          z-index: 1;
          flex: 1;
          overflow-y: auto; overflow-x: hidden;
          padding: 8px 14px 108px;
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
          transition: background 0.25s, border-color 0.25s, color 0.25s;
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

        .msg-system {
          text-align: center;
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: 2px;
          padding: 10px 24px;
          margin: 4px 0;
          animation: fadeIn 0.45s ease;
        }
        .msg-sync {
          font-size: 12px;
          color: var(--color-text-secondary);
          letter-spacing: 3px;
          padding: 16px 24px;
          margin: 10px 0;
          animation: syncGlow 2.4s ease-out;
        }
        .sync-mark {
          display: inline-block;
          margin-right: 8px;
          color: var(--color-accent);
          animation: syncSpin 6s linear infinite;
        }
        @keyframes syncGlow {
          0% { opacity: 0; transform: scale(0.92); letter-spacing: 8px; }
          40% { opacity: 1; letter-spacing: 3px; }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes syncSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* ============ 打字指示器 ============ */
        .typing-bubble {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 12px 14px;
        }
        .typing-bubble .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--color-text-tertiary);
          animation: typingBounce 1.2s infinite ease-in-out;
        }
        .typing-bubble .dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-bubble .dot:nth-child(3) { animation-delay: 0.3s; }
        .typing-hint {
          margin-left: 8px;
          font-size: 12px;
          color: var(--color-text-secondary);
          letter-spacing: 1px;
          opacity: 0.85;
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-4px); opacity: 1; }
        }

        /* ============ 洗牌动画 ============ */
        .msg-shuffling { align-items: center; }
        .shuffle-stage {
          position: relative;
          width: 90px; height: 44px;
          margin-left: 4px;
        }
        .shuffle-stage .frag {
          position: absolute;
          left: 30px; top: 12px;
          width: 24px; height: 32px;
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: 5px;
          opacity: 0;
          box-shadow: 0 2px 6px var(--color-shadow);
          animation: shuffleFrag 0.75s ease-out forwards;
        }
        .shuffle-stage .frag:nth-child(1) { animation-delay: 0s; --tx: -22px; --ty: -18px; --rot: -14deg; }
        .shuffle-stage .frag:nth-child(2) { animation-delay: 0.06s; --tx: 6px; --ty: -22px; --rot: 4deg; }
        .shuffle-stage .frag:nth-child(3) { animation-delay: 0.12s; --tx: 26px; --ty: -14px; --rot: 12deg; }
        .shuffle-stage .frag:nth-child(4) { animation-delay: 0.18s; --tx: -8px; --ty: -6px; --rot: -6deg; }
        .shuffle-stage .frag:nth-child(5) { animation-delay: 0.24s; --tx: 14px; --ty: 4px; --rot: 8deg; }
        @keyframes shuffleFrag {
          0% { opacity: 0; transform: translate(0, 10px) rotate(0deg) scale(0.7); }
          45% { opacity: 0.95; transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(1); }
          100% { opacity: 0; transform: translate(calc(var(--tx) * 1.2), calc(var(--ty) - 12px)) rotate(var(--rot)) scale(0.85); }
        }

        /* ============ 悬浮胶囊输入框 ============ */
        .chat-input-dock {
          position: fixed;
          left: 12px;
          right: 12px;
          bottom: calc(env(safe-area-inset-bottom) + 12px);
          max-width: 456px;
          margin: 0 auto;
          display: flex;
          align-items: flex-end;
          gap: 6px;
          padding: 6px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 28px;
          box-shadow:
            0 4px 12px var(--color-shadow),
            0 12px 40px var(--color-shadow);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
          z-index: 40;
          animation: dockRise 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          transition:
            transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.3s ease,
            border-color 0.3s ease;
        }
        .chat-input-dock:focus-within {
          border-color: var(--color-accent);
          box-shadow:
            0 6px 16px var(--color-shadow),
            0 18px 50px var(--color-shadow),
            0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent);
        }
        @keyframes dockRise {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-input-dock.sent-pulse { animation: dockPulse 0.42s ease-out; }
        @keyframes dockPulse {
          0% { transform: scale(1); }
          40% { transform: scale(1.015); }
          100% { transform: scale(1); }
        }
        .chat-input-dock::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, transparent 30%, color-mix(in srgb, var(--color-accent) 30%, transparent) 50%, transparent 70%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 0.4s ease;
          pointer-events: none;
        }
        .chat-input-dock:focus-within::before { opacity: 1; animation: dockShimmer 3s linear infinite; }
        @keyframes dockShimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }

        .dock-input {
          flex: 1;
          min-height: 40px; max-height: 120px;
          padding: 10px 12px;
          border: none; outline: none;
          background: transparent;
          color: var(--color-text-primary);
          font-size: 14px; line-height: 1.4;
          font-family: inherit;
          resize: none; overflow-y: auto;
        }
        .dock-input::placeholder { color: var(--color-text-tertiary); }

        .dock-btn {
          width: 40px; height: 40px;
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: transparent;
          transition:
            transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.25s ease, color 0.25s ease, opacity 0.25s ease;
        }
        .dock-btn:active { transform: scale(0.86); }
        .dock-btn:disabled { opacity: 0.32; }
        .dock-btn.send.active {
          background: var(--color-accent);
          color: var(--color-bg-primary);
          transform: scale(1);
        }
        .dock-btn.send.active:active { transform: scale(0.9) rotate(-10deg); }
        .dock-btn.spark.spin { animation: sparkSpin 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
        @keyframes sparkSpin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.18); color: var(--color-accent); }
          100% { transform: rotate(360deg) scale(1); }
        }

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

        /* ============ 气泡样式预设 ============ */
        /* preset-1 极简圆角 = 默认，无覆盖 */

        /* preset-2 方角硬朗 */
        .chat-page[data-bubble-preset="preset-2"] .msg-bubble {
          border-radius: 4px;
          padding: 9px 13px;
          font-size: 14px;
          border: 1px solid var(--color-border);
          border-top-left-radius: 4px;
        }
        .chat-page[data-bubble-preset="preset-2"] .msg-row.msg-user .msg-bubble {
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
        }

        /* preset-3 大圆角糖果 */
        .chat-page[data-bubble-preset="preset-3"] .msg-bubble {
          border-radius: 22px;
          padding: 12px 18px;
          font-size: 14.5px;
          border-top-left-radius: 10px;
        }
        .chat-page[data-bubble-preset="preset-3"] .msg-row.msg-user .msg-bubble {
          border-top-left-radius: 22px;
          border-top-right-radius: 10px;
        }

        /* preset-4 描边气泡 */
        .chat-page[data-bubble-preset="preset-4"] .msg-bubble {
          background: transparent;
          border: 1.5px solid var(--color-border);
          color: var(--color-text-primary);
          box-shadow: none;
        }
        .chat-page[data-bubble-preset="preset-4"] .msg-row.msg-user .msg-bubble {
          background: transparent;
          border-color: var(--color-accent);
          color: var(--color-text-primary);
        }

        /* preset-5 长信笺 */
        .chat-page[data-bubble-preset="preset-5"] .msg-bubble-wrap {
          max-width: 65%;
        }
        .chat-page[data-bubble-preset="preset-5"] .msg-bubble {
          border-radius: 10px;
          padding: 14px 16px;
          line-height: 1.85;
          border-top-left-radius: 4px;
        }
        .chat-page[data-bubble-preset="preset-5"] .msg-row.msg-user .msg-bubble {
          border-top-left-radius: 10px;
          border-top-right-radius: 4px;
        }
      </style>
      <style id="chat-user-css"></style>
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
  document.getElementById('chat-header-avatar').innerHTML =
    avatarHTML(state.character && state.character.avatar, (state.character && state.character.name) || '?', 34);

  applyChatStyles();
  renderMessages();

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

  bindViewportFollow();

  if (state.conv && state.conv.pendingReplyAt) scheduleTimers();

  state.onVisibility = async () => {
    if (state.destroyed) return;
    if (document.visibilityState !== 'visible') return;
    const fresh = await db.conversations.get(state.convId);
    if (fresh) {
      state.conv = fresh;
      applyChatStyles();
      if (fresh.pendingReplyAt) scheduleTimers();
    }
  };
  document.addEventListener('visibilitychange', state.onVisibility);

  if (await keepAlive.loadEnabled()) keepAlive.start();
}

export function destroy() {
  state.destroyed = true;
  cancelTimers();
  clearTimeout(longPressTimer);
  if (state.onVisibility) {
    document.removeEventListener('visibilitychange', state.onVisibility);
    state.onVisibility = null;
  }
  if (state.onViewport) { state.onViewport(); state.onViewport = null; }
}
