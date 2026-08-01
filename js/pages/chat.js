import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, escapeAttr, formatTime, formatDateSep,
  haptic, toast, sleep, randInt, pick,
  openSheet, confirmSheet,
} from '../utils.js';
import {
  generateForCharacter,
  parseChoiceFragment,
  choiceToContent,
  parseChoiceContent,
  DEFAULT_THINKING_HINTS,
  DEFAULT_SKIP_HINTS,
  DEFAULT_SYNC_HINTS,
  DEFAULT_SYNC_CHANCE,
} from '../cardEngine.js';
import * as keepAlive from '../lib/keepAlive.js';
import * as sound from '../lib/sound.js';
import { CallManager } from '../lib/callManager.js';
import { renderMusicCardHTML } from '../lib/musicBarRenderer.js';
// 在其他 import 语句后添加：
import { getShufflingHTML, getShufflingHint } from '../lib/shufflingRenderer.js';



const DEFAULT_QUOTE_CHANCE = 0.4;
const QUOTE_PREVIEW_MAX = 40;
const DEFAULT_MUSIC = { signature: '一支未命名的曲子', distance: '相距 1024 光年', style: 'orbit', playing: false };
const DEFAULT_CALL_MIN_SEC = 45;
const DEFAULT_CALL_MAX_SEC = 180;
const CALL_RING_TIMEOUT = 15000;


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
  pendingQuoteId: null,
  panelExpanded: false,
  panelTab: 'status',
  statusCardIndex: 0,

  draftMessages: [],

  call: null,
  callTimer: null,
  callRingTimer: null,
  callEndTimer: null,
  callStartedAt: null,
  callDurationSec: 0,
  callExpanded: false,
};

const PRESET_LABELS = {
  'preset-1': '极简圆角',
  'preset-2': '方角硬朗',
  'preset-3': '大圆角糖果',
  'preset-4': '描边气泡',
  'preset-5': '长信笺',
  'custom': '自定义 CSS',
};
function bubblePresetLabel(k) { return PRESET_LABELS[k] || '极简圆角（默认）'; }

const SOUND_LABELS = {
  inherit: '跟随全局',
  silent: '静音',
  bell: '清脆铃',
  chime: '磬音',
  custom: '自定义',
};

/* ---------- 小图标（SVG 内联） ---------- */
const SVG_CHEV = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const SVG_PALETTE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 3 3 0 0 0 3-3 2 2 0 0 1 2-2h2a3 3 0 0 0 3-3 10 10 0 0 0-10-12Z"/></svg>`;
const SVG_MUSIC = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const SVG_NOTE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>`;
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PHONE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v2.2a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.45 19.45 0 0 1-6-6A19.8 19.8 0 0 1 2.12 3.38 2 2 0 0 1 4.11 1.2h2.2a2 2 0 0 1 2 1.72c.13.96.35 1.9.66 2.8a2 2 0 0 1-.45 2.11L7.6 8.75a16 16 0 0 0 7.65 7.65l.92-.92a2 2 0 0 1 2.11-.45c.9.31 1.84.53 2.8.66A2 2 0 0 1 22 16.92Z"/></svg>`;
const SVG_PHONE_OFF = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 5.1 10 2.6A2 2 0 0 0 8.07 1.2H5.84A2 2 0 0 0 3.86 3.5a19.7 19.7 0 0 0 5.23 9.65"/><path d="M14.8 18.45a19.6 19.6 0 0 0 5.7 1.66 2 2 0 0 0 2.3-1.98v-2.2a2 2 0 0 0-1.72-1.98l-2.55-.37a2 2 0 0 0-1.78.58l-.92.92"/><path d="m2 2 20 20"/></svg>`;
const SVG_MINIMIZE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

/* ---------- 工具 ---------- */
function shouldShowTimeSep(prev, curr) {
  if (!prev) return true;
  return (curr.timestamp - prev.timestamp) > 5 * 60 * 1000;
}
function summarize(text, max = QUOTE_PREVIEW_MAX) {
  const single = String(text || '').replace(/\s+/g, ' ').trim();
  if (single.length <= max) return single;
  return single.slice(0, max) + '…';
}
function authorNameOf(msg) {
  if (!msg) return '';
  if (msg.sender === 'user') return (state.user && state.user.name) || '我';
  if (msg.sender === 'character') return (state.character && state.character.name) || '?';
  return '';
}
function isQuotableMsg(msg) {
  if (!msg) return false;
  if (msg.sender !== 'user' && msg.sender !== 'character') return false;
  if (msg.type === 'system' || msg.type === 'sync') return false;
  return true;
}
function formatDuration(sec) {
  const n = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function choiceSummary(content) {
  const c = parseChoiceContent(content);
  if (!c) return summarize(content);
  return c.prompt;
}
function msgPreviewContent(msg) {
  if (!msg) return '';
  if (msg.type === 'choice') return choiceSummary(msg.content);
  return msg.content;
}

function getRandomRotationInterval() {
  return (2 + Math.random() * 4) * 60 * 60 * 1000;
}

async function checkAndRotateCharacterStatus(character) {
  if (!character) return character;
  if (!character.statusPool || !Array.isArray(character.statusPool) || !character.statusPool.length) return character;

  const now = Date.now();
  const nextTime = character.nextStatusRotationTime || 0;
  if (now < nextTime) return character;

  const pool = character.statusPool.filter(Boolean);
  if (!pool.length) return character;

  let nextStatus = character.status || '';

  if (pool.length === 1) {
    nextStatus = pool[0];
  } else {
    const candidates = pool.filter((s) => s !== character.status);
    nextStatus = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : pool[Math.floor(Math.random() * pool.length)];
  }

  const nextRotationTime = now + getRandomRotationInterval();

  await db.characters.update(character.id, {
    status: nextStatus,
    nextStatusRotationTime: nextRotationTime,
  });

  character.status = nextStatus;
  character.nextStatusRotationTime = nextRotationTime;
  return character;
}

function parseManualChoiceText(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith('??')) return null;

  const body = raw.slice(2).trim();
  if (!body) return null;

  const parts = body
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  const prompt = parts.shift();
  const options = parts;

  if (!prompt || options.length < 2) return null;

  return {
    prompt,
    options,
    answered: false,
    answer: '',
    answeredBy: '',
  };
}



/* ---------- 选择题 ---------- */
function findLatestUnansweredUserChoice() {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (!m || m.sender !== 'user' || m.type !== 'choice') continue;
    const c = parseChoiceContent(m.content);
    if (c && !c.answered) return { msg: m, choice: c };
  }
  return null;
}

async function markChoiceAnswered(msgId, answer, answeredBy) {
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg || msg.type !== 'choice') return;
  const c = parseChoiceContent(msg.content);
  if (!c) return;
  const next = {
    ...c,
    answered: true,
    answer: String(answer || ''),
    answeredBy: String(answeredBy || ''),
  };
  const nextContent = choiceToContent(next);
  await db.messages.update(msgId, { content: nextContent });
  msg.content = nextContent;
}
function choiceBubbleHTML(msg) {
  const choice = parseChoiceContent(msg.content);
  if (!choice) {
    return `<div class="msg-body">${escapeHtml(msg.content)}</div>`;
  }

  const canAnswer = msg.sender === 'character' && !choice.answered;
  const opts = choice.options || [];

  return `
    <div class="choice-card">
      <div class="choice-card-title">${escapeHtml(choice.prompt)}</div>

      <div class="choice-card-grid">
        ${opts.map((opt, idx) => {
          const isSelected = choice.answered && choice.answer === opt;
          return `
            <button
              class="choice-card-option ${isSelected ? 'selected' : ''}"
              data-choice-msg="${msg.id}"
              data-choice-idx="${idx}"
              ${!canAnswer ? 'disabled' : ''}
              type="button"
            >
              ${escapeHtml(opt)}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}



async function answerCharacterChoice(msgId, idx) {
  const msg = state.messages.find((m) => m.id === msgId);
  if (!msg || msg.type !== 'choice' || msg.sender !== 'character') return;

  const choice = parseChoiceContent(msg.content);
  if (!choice || choice.answered) return;

  const answer = choice.options[idx];
  if (!answer) return;

  await markChoiceAnswered(msgId, answer, 'user');
  renderMessages();

  const userMsg = {
    conversationId: state.convId,
    sender: 'user',
    content: answer,
    type: 'text',
    status: 'sent',
    quotedMessageId: null,
    timestamp: Date.now(),
    isRead: false,
  };
  const id = await db.messages.add(userMsg);
  userMsg.id = id;
  appendMessage(userMsg);
  playUserSound();
  await persistConvSummary();
  await schedulePendingReply();
}

/* ---------- 引用相关 HTML ---------- */
function quoteCardHTML(quotedId) {
  if (!quotedId) return '';
  const q = state.messages.find((m) => m.id === quotedId);
  if (!q) return `<div class="quote-card missing">[原消息已删除]</div>`;
  if (q.status === 'recalled') return `<div class="quote-card missing">[原消息已撤回]</div>`;
  const author = authorNameOf(q);
  const preview = summarize(msgPreviewContent(q));
  return `
    <div class="quote-card" data-quote-jump="${q.id}">
      <div class="quote-card-author">${escapeHtml(author)}</div>
      <div class="quote-card-content">${escapeHtml(preview)}</div>
    </div>
  `;
}
function quoteBarHTML(quoted) {
  if (!quoted) return '';
  const author = authorNameOf(quoted);
  const preview = summarize(msgPreviewContent(quoted));
  return `
    <div class="quote-bar" id="quote-bar">
      <div class="quote-bar-line"></div>
      <div class="quote-bar-body">
        <div class="quote-bar-author">回复 ${escapeHtml(author)}</div>
        <div class="quote-bar-content">${escapeHtml(preview)}</div>
      </div>
      <button class="quote-bar-close" data-act="clear-quote" type="button" aria-label="取消引用">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
      </button>
    </div>
  `;
}

/* ---------- 消息气泡 HTML ---------- */

function bubbleHTML(msg, character, user, showTimeSep) {
  const timeSep = showTimeSep
    ? `<div class="msg-time-sep">${formatDateSep(msg.timestamp)}　${formatTime(msg.timestamp)}</div>`
    : '';

  // 1. 系统消息与共时同步标记（不包含通话）
  if (msg.sender === 'system' || msg.type === 'system' || msg.type === 'sync') {
    const isSync = msg.type === 'sync';
    return `${timeSep}<div class="msg-system ${isSync ? 'msg-sync' : ''}" data-id="${msg.id}">
      ${isSync ? '<span class="sync-mark">◈</span>' : ''}${escapeHtml(msg.content)}
    </div>`;
  }

  // 2. 新增的 type === 'call' 通话气泡渲染
  if (msg.type === 'call') {
    const isUser = msg.sender === 'user';
    const av = isUser
      ? avatarHTML(user && user.avatar, (user && user.name) || '我', 32)
      : avatarHTML(character && character.avatar, (character && character.name) || '?', 32);

    let callData = { status: 'finished', duration: 0 };
    try {
      callData = JSON.parse(msg.content);
    } catch (e) {}

    // 根据不同通话状态解析展示文字
    let callLabel = '';
    if (callData.status === 'finished') {
      callLabel = `语音通话 ${formatDuration(callData.duration)}`;
    } else if (callData.status === 'declined') {
      callLabel = isUser ? '对方已拒绝' : '已拒绝';
    } else if (callData.status === 'busy') {
      callLabel = isUser ? '对方忙' : '对方忙';
    } else if (callData.status === 'missed') {
      callLabel = isUser ? '对方无应答' : '未接听';
    } else {
      callLabel = '通话已结束';
    }

    // 拼装微信风格通话气泡，内含电话图标
    const body = `
      <div class="msg-body msg-call-body">
        <span class="call-bubble-icon">${isUser ? SVG_PHONE_OFF : SVG_PHONE}</span>
        <span class="call-bubble-text">${escapeHtml(callLabel)}</span>
      </div>
    `;

    return `
      ${timeSep}
      <div class="msg-row ${isUser ? 'msg-user' : 'msg-char'} msg-call-row" data-id="${msg.id}">
        ${!isUser ? `<div class="msg-avatar">${av}</div>` : ''}
        <div class="msg-bubble-wrap">
          <div class="msg-bubble">${body}</div>
        </div>
        ${isUser ? `<div class="msg-avatar">${av}</div>` : ''}
      </div>
    `;
  }

  const isUser = msg.sender === 'user';
  const av = isUser
    ? avatarHTML(user && user.avatar, (user && user.name) || '我', 32)
    : avatarHTML(character && character.avatar, (character && character.name) || '?', 32);
  const readMark = isUser
    ? `<span class="msg-read">${msg.isRead ? '已读' : '送达'}</span>`
    : '';
  const quote = quoteCardHTML(msg.quotedMessageId);
  const body = msg.type === 'choice'
    ? choiceBubbleHTML(msg)
    : `<div class="msg-body">${escapeHtml(msg.content)}</div>`;

  return `
    ${timeSep}
    <div class="msg-row ${isUser ? 'msg-user' : 'msg-char'} ${msg.type === 'choice' ? 'msg-choice' : ''}" data-id="${msg.id}">
      ${!isUser ? `<div class="msg-avatar">${av}</div>` : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-bubble">${quote}${body}</div>
        ${isUser ? `<div class="msg-meta">${readMark}</div>` : ''}
      </div>
      ${isUser ? `<div class="msg-avatar">${av}</div>` : ''}
    </div>
  `;
}


function typingHTML(character, hint) {
  const av = avatarHTML(character && character.avatar, (character && character.name) || '?', 52);
  return `
    <div class="center-typing-card" id="center-typing-card">
      <div class="center-typing-avatar">${av}</div>
      <div class="center-typing-name">${escapeHtml((character && character.name) || '?')}</div>
      <div class="center-typing-loading">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
      ${hint ? `<div class="center-typing-hint">${escapeHtml(hint)}</div>` : '<div class="center-typing-hint">正在输入...</div>'}
    </div>
  `;
}

function shuffleHTML(character) {
  const av = avatarHTML(character && character.avatar, (character && character.name) || '?', 52);
  return `
    <div class="center-typing-card center-typing-shuffle" id="shuffle-fx">
      <div class="center-typing-avatar">${av}</div>
      <div class="center-typing-name">${escapeHtml((character && character.name) || '?')}</div>
      <div class="center-typing-loading">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
      <div class="center-typing-hint">正在整理字卡...</div>
    </div>
  `;
}


/* ---------- 数据加载 ---------- */
async function loadAll(convId) {
  const conv = await db.conversations.get(convId);
  if (!conv) throw new Error('对话不存在');
  let character = await db.characters.get(conv.characterId);
if (character) {
  character = await checkAndRotateCharacterStatus(character);
}
  let user = (await db.user.toArray())[0];
  if (!user) {
    const uid = await db.user.add({ name: '我', avatar: '', status: '', signature: '' });
    user = await db.user.get(uid);
  }
  const messages = await db.messages.where('conversationId').equals(convId).sortBy('timestamp');
  return { conv, character, user, messages };
}

/* ---------- 消息渲染 ---------- */
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
  updateMessageCount();
}

function scrollToBottom(smooth = true) {
  const box = document.getElementById('msg-scroll');
  if (!box) return;
  requestAnimationFrame(() => {
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  });
}
function scrollToMessage(id) {
  const row = document.querySelector(`.msg-scroll .msg-row[data-id="${id}"]`);
  if (!row) { toast('原消息不在当前列表'); return; }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('msg-highlight');
  void row.offsetWidth;
  row.classList.add('msg-highlight');
  setTimeout(() => row.classList.remove('msg-highlight'), 1600);
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
  updateMessageCount();
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

  const callBg = document.querySelector('.call-full-bg');
  if (callBg) {
    if (c.wallpaper) {
      const safe = String(c.wallpaper).replace(/"/g, '\\"');
      callBg.style.backgroundImage = `url("${safe}")`;
      callBg.classList.add('has-wallpaper');
    } else {
      callBg.style.backgroundImage = '';
      callBg.classList.remove('has-wallpaper');
    }
  }
}

function playCharSound() {
  sound.play('character',
    state.conv && state.conv.soundOption,
    state.conv && state.conv.customSoundUrl);
}
function playUserSound() {
  sound.play('user',
    state.conv && state.conv.soundOption,
    state.conv && state.conv.customSoundUrl);
}

/* ---------- 引用管理 ---------- */
async function setPendingQuote(msgId) {
  const q = state.messages.find((m) => m.id === msgId);
  if (!q || !isQuotableMsg(q)) { toast('该消息无法引用'); return; }
  state.pendingQuoteId = msgId;
  await db.conversations.update(state.convId, { pendingQuoteId: msgId });
  if (state.conv) state.conv.pendingQuoteId = msgId;
  renderQuoteBar();
  const input = document.getElementById('chat-input');
  if (input) input.focus();
}
async function clearPendingQuote() {
  state.pendingQuoteId = null;
  await db.conversations.update(state.convId, { pendingQuoteId: null });
  if (state.conv) state.conv.pendingQuoteId = null;
  renderQuoteBar();
}
function renderQuoteBar() {
  const dock = document.querySelector('.chat-input-dock');
  if (!dock) return;
  const existing = document.getElementById('quote-bar');
  if (existing) existing.remove();
  if (!state.pendingQuoteId) return;
  const q = state.messages.find((m) => m.id === state.pendingQuoteId);
  if (!q) {
    state.pendingQuoteId = null;
    db.conversations.update(state.convId, { pendingQuoteId: null });
    if (state.conv) state.conv.pendingQuoteId = null;
    return;
  }
  dock.insertAdjacentHTML('afterbegin', quoteBarHTML(q));
}
function pickAutoQuoteTarget() {
  const pool = state.messages.slice(-20).filter(isQuotableMsg);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/* ---------- 发送 & 回复 ---------- */
async function sendUserMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const dock = document.querySelector('.chat-input-dock');
  if (dock) { dock.classList.remove('sent-pulse'); void dock.offsetWidth; dock.classList.add('sent-pulse'); }

  const quotedId = state.pendingQuoteId || null;

  // 优先使用 cardEngine 内置解析；如果失败，则使用本文件的 ??问题|选项1|选项2 兜底解析
  const choice = parseChoiceFragment(text) || parseManualChoiceText(text);

   const msg = {
    conversationId: state.convId,
    sender: 'user',
    content: choice ? choiceToContent(choice) : text,
    type: choice ? 'choice' : 'text',
    status: 'sent',
    quotedMessageId: quotedId,
    timestamp: Date.now(),
    isRead: false,
  };

  const id = await db.messages.add(msg);
  msg.id = id;

  if (quotedId) await clearPendingQuote();

  appendMessage(msg);
  playUserSound();
  input.value = '';
  autoGrow(input);
  updateSendBtn();

  await persistConvSummary();
  await schedulePendingReply();
}

function openChoiceCreatorSheet() {

  let options = ['', '']; // 默认两个空选项

  const renderBody = () => {
    return `
      <div id="choice-creator-wrap">
        <div class="field">
          <label class="field-label">问题 / 引导语</label>
          <input class="input" id="c-prompt" placeholder="写下你要提问的问题..." value="">
        </div>
        <div class="field">
          <label class="field-label">备选选项 (最少2个，最多5个)</label>
          <div id="c-options-list" style="display:flex; flex-direction:column; gap:8px;">
            ${options.map((opt, index) => `
              <div class="c-opt-row" style="display:flex; gap:8px; align-items:center;">
                <input class="input c-opt-input" data-idx="${index}" placeholder="选项 ${index + 1}" value="${escapeAttr(opt)}">
                ${options.length > 2 ? `
                  <button class="btn-opt-del" data-idx="${index}" style="color:#dc2626; border:none; background:none; cursor:pointer; padding: 4px 8px;">
                    ${ICON.trash}
                  </button>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ${options.length < 5 ? `
          <button class="btn btn-secondary btn-block" id="c-add-opt-btn" style="margin-top:8px; min-height:36px; padding:6px 12px; font-size:12px;">+ 添加选项</button>
        ` : ''}
      </div>
    `;
  };

  const { close } = openSheet({
    title: '发起选择题给角色',
    body: renderBody(),
    actions: `
      <button class="btn btn-ghost" data-act="cancel-choice">取消</button>
      <button class="btn btn-primary" data-act="send-choice">发送</button>
    `,
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  if (!root) return;

  const bindEvents = () => {
    const addBtn = root.querySelector('#c-add-opt-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        if (options.length >= 5) return;
        options.push('');
        updateUI();
      };
    }

    root.querySelectorAll('.btn-opt-del').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-idx'));
        options.splice(idx, 1);
        if (options.length < 2) options = ['', ''];
        updateUI();
      };
    });
  };

  const updateUI = () => {
    const promptInput = root.querySelector('#c-prompt');
    const savedPrompt = promptInput ? promptInput.value : '';

    root.querySelectorAll('.c-opt-input').forEach((inp) => {
      const idx = Number(inp.getAttribute('data-idx'));
      options[idx] = inp.value;
    });

    const bodyEl = root.querySelector('.sheet-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = renderBody();

    const newPrompt = root.querySelector('#c-prompt');
    if (newPrompt) newPrompt.value = savedPrompt;

    bindEvents();
  };

  root.querySelector('[data-act=cancel-choice]').addEventListener('click', () => close());

  root.querySelector('[data-act=send-choice]').addEventListener('click', async () => {
    const prompt = root.querySelector('#c-prompt').value.trim();
    if (!prompt) {
      toast('请输入问题内容');
      return;
    }

    const finalOptions = [];
    root.querySelectorAll('.c-opt-input').forEach((inp) => {
      const val = inp.value.trim();
      if (val) finalOptions.push(val);
    });

    if (finalOptions.length < 2) {
      toast('请至少填写两个有效选项');
      return;
    }

    const choicePayload = {
  prompt,
  options: finalOptions,
  answered: false,
  answer: '',
  answeredBy: '',
};

close();

const userMsg = {
  conversationId: state.convId,
  sender: 'user',
  content: choiceToContent(choicePayload),
  type: 'choice',
  status: 'sent',
  quotedMessageId: null,
  timestamp: Date.now(),
  isRead: false,
};


    const id = await db.messages.add(userMsg);
    userMsg.id = id;

    await db.conversations.update(state.convId, {
      lastMessage: `[选择题] ${prompt}`,
      lastMessageTime: Date.now(),
    });

    state.messages = await db.messages.where('conversationId').equals(state.convId).sortBy('timestamp');
    renderMessages();

    await schedulePendingReply();
  });

  bindEvents();
}

// 12面星骰文字与占卜释义
const DICE_FACES = [
  { word: "亘古", desc: "深夜独有的时间停滞感。意味着问题超出了当下的维度，需要回溯前世或家族业力才能看清。" },
  { word: "混沌", desc: "宇宙诞生前的状态。代表答案尚在孕育，是接收到的第一波未解码的原始能量。" },
  { word: "沉没", desc: "并非消极，而是指意识的深度下潜。代表你需要潜入潜意识深潭去捞取那个被你遗忘的真相。" },
  { word: "共时", desc: "宇宙的奥秘在说话。代表你与高我建立了稳定的通讯频道，当下的时间线是准确的。" },
  { word: "脉动", desc: "代表能量层面的链接，两人之间存在极深的、无声的能量纠缠。" },
  { word: "呓语", desc: "深夜半梦半醒间的灵性讯息。代表你正被灵性护法轻声呼唤。" },
  { word: "命茧", desc: "宿命的包裹感。暗示你正处于灵魂的封存期，孤独是为了孵化下一个阶段的蜕变。" },
  { word: "通透", desc: "孤独的至高境界。代表隐藏的真实已经暴露，你拥有看穿一切幻象的灵视能力。" },
  { word: "归途", desc: "深度的链接指向回家的路。这是一种宿命的牵引，表示灵魂终将回到这条线上。" },
  { word: "悬停", desc: "深夜燃烧后的残留。代表还有未了的意愿在灰烬中闪烁。" },
  { word: "静默", desc: "当所有牌都杂乱无章时，静默意味着关闭门户，此时适合冥想而非解读。" },
  { word: "轮转", desc: "宿命的闭环。说明当下的痛苦是循环的一部分，你拥有打破它或接纳它的最终选择权。" }
];

async function openSynchronicityDiceSheet() {
  const body = `
    <div class="dice-container">
      <div class="d12-dice-wrapper rolling" id="d12-dice">
        <div class="d12-ring"></div>
        <div class="d12-ring-inner"></div>
        <div class="d12-geometric-shape"></div>
        <div class="d12-center-word" id="d12-word">✦</div>
      </div>
      <div id="dice-result-panel" style="display:none; width: 100%;"></div>
    </div>
  `;

  const { close } = openSheet({
    title: '共时星骰',
    body,
    actions: `<div id="dice-actions" style="display:flex; gap:10px; width:100%;"><button class="btn btn-ghost btn-block" disabled>正在祈导星轨...</button></div>`
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  if (!root) return;

  const diceEl = root.querySelector('#d12-dice');
  const wordEl = root.querySelector('#d12-word');
  const resultPanel = root.querySelector('#dice-result-panel');
  const actionsEl = root.querySelector('#dice-actions');

  setTimeout(async () => {
    if (!diceEl || !wordEl || !resultPanel || !actionsEl) return;

    haptic(15);
    diceEl.classList.remove('rolling');

    const rolled = pick(DICE_FACES);

    wordEl.textContent = rolled.word;

    let quoteText = "";
    if (state.character) {
      const { messages } = await generateForCharacter(state.character.id);
      if (messages && messages.length) {
        quoteText = messages[0].content;
      }
    }

    resultPanel.innerHTML = `
      <div class="dice-result-card">
        <div class="dice-result-word">✦ ${escapeHtml(rolled.word)} ✦</div>
        <div class="dice-result-desc">${escapeHtml(rolled.desc)}</div>
        ${quoteText ? `<div class="dice-result-quote">“ ${escapeHtml(quoteText)} ”</div>` : ''}
      </div>
    `;

    resultPanel.style.display = 'block';

    actionsEl.innerHTML = `
      <button class="btn btn-secondary" id="btn-dice-keep">默默珍藏</button>
      <button class="btn btn-primary" id="btn-dice-send">一键发送</button>
    `;

    const keepBtn = root.querySelector('#btn-dice-keep');
    const sendBtn = root.querySelector('#btn-dice-send');

    if (keepBtn) {
      keepBtn.onclick = () => close();
    }

    if (sendBtn) {
      sendBtn.onclick = async () => {
        close();

        const prompt = `◈ 掷得了星骰「${rolled.word}」${quoteText ? `，谶语为：“${quoteText}”` : ''}`;

        const input = document.getElementById('chat-input');
        if (input) {
          input.value = prompt;
          autoGrow(input);
          updateSendBtn();

          const realSendBtn = document.getElementById('send-btn');
          if (realSendBtn) {
            realSendBtn.click();
          } else {
            await sendUserMessage();
          }
        }
      };
    }
  }, 2200);
}


function bindDraftEvents(root, renderDraftList) {
  const list = root.querySelector('[data-draft-list]');
  if (!list) return;

  list.querySelectorAll('.draft-item-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;
      state.draftMessages.splice(idx, 1);
      list.outerHTML = renderDraftList();
      bindDraftEvents(root, renderDraftList);
    });
  });
}

function renderDraftListHTML() {
  const drafts = Array.isArray(state.draftMessages) ? state.draftMessages : [];

  if (!drafts.length) {
    return `<div class="draft-empty">暂无草稿内容，在下方输入后点击添加</div>`;
  }

  return `
    <div class="draft-items-list" data-draft-list>
      ${drafts.map((msg, index) => `
        <div class="draft-item">
          <span class="draft-item-text">${escapeHtml(msg)}</span>
          <button class="draft-item-delete" data-idx="${index}" aria-label="删除草稿">${ICON.trash}</button>
        </div>
      `).join('')}
    </div>
  `;
}

function openDraftSheet() {
  const renderDraftListOnly = () => {
    if (!state.draftMessages.length) {
      return `<div style="text-align:center;color:var(--color-text-tertiary);padding:20px;font-size:12px;">暂无草稿内容，在下方输入后点击添加</div>`;
    }
    return state.draftMessages.map((msg, index) => `
      <div class="draft-item" style="display:flex; justify-content:space-between; align-items:center; background:var(--color-bg-secondary); padding:8px 12px; border-radius:8px; margin-bottom:6px; font-size:13px;">
        <span style="word-break:break-all; flex:1; padding-right:8px;">${escapeHtml(msg)}</span>
        <button class="draft-item-delete" data-idx="${index}" style="color:#dc2626; border:none; background:none; cursor:pointer;">${ICON.trash}</button>
      </div>
    `).join('');
  };

  const body = `
    <div id="draft-container">
      <div id="draft-list-subwrap" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
        ${renderDraftListOnly()}
      </div>
      <div class="field" style="margin-top:10px;">
        <textarea class="textarea" id="draft-input" placeholder="输入你想发送的消息碎片..." rows="2" style="min-height:70px;"></textarea>
      </div>
    </div>
  `;

  const { close } = openSheet({
    title: `多消息暂存箱 (${state.draftMessages.length})`,
    body,
    actions: `
      <button class="btn btn-ghost" data-act="add-draft">添加</button>
      <button class="btn btn-primary" data-act="send-all-draft">一次性发送</button>
    `,
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  const listSubwrap = root.querySelector('#draft-list-subwrap');
  const input = root.querySelector('#draft-input');

  const rebindDeleteEvents = () => {
    root.querySelectorAll('.draft-item-delete').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-idx'));
        state.draftMessages.splice(idx, 1);
        listSubwrap.innerHTML = renderDraftListOnly();
        rebindDeleteEvents();
      };
    });
  };

  // 绑定“添加”按钮
  root.querySelector('[data-act=add-draft]').addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;
    state.draftMessages.push(val);
    input.value = ''; // 仅清空文本，不销毁 DOM 节点
    listSubwrap.innerHTML = renderDraftListOnly();
    rebindDeleteEvents();
  });

  // 绑定“发送”按钮
  root.querySelector('[data-act=send-all-draft]').addEventListener('click', async () => {
    if (!state.draftMessages.length) {
      toast('暂存箱是空的');
      return;
    }
    const msgs = [...state.draftMessages];
    state.draftMessages = [];
    close();

    for (const content of msgs) {
      await db.messages.add({
        conversationId: state.convId,
        timestamp: Date.now(),
        sender: 'user',
        content: content,
        type: 'text',
        status: 'sent'
      });
      await sleep(50);
    }
    
    await db.conversations.update(state.convId, {
      lastMessage: msgs[msgs.length - 1],
      lastMessageTime: Date.now()
    });

    state.messages = await db.messages.where('conversationId').equals(state.convId).sortBy('timestamp');
    renderMessages();
    await schedulePendingReply();
  });

  rebindDeleteEvents();
}



function showTyping(customHint) {
  if (state.typing) return;
  state.typing = true;

  hideShuffling();

  const page = document.querySelector('.chat-page');
  if (!page) return;

  const text = customHint || (state.conv && state.conv.typingHint) || "正在输入...";

  page.insertAdjacentHTML('beforeend', `
    <div class="center-typing-card" id="center-typing-card">
      <div class="center-typing-avatar">
        ${avatarHTML(state.character && state.character.avatar, state.character && state.character.name, 50)}
      </div>
      <div class="center-typing-name">${escapeHtml(state.character && state.character.name)}</div>
      <div class="center-typing-loading">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
      <div class="center-typing-hint">${escapeHtml(text)}</div>
    </div>
  `);
}

function hideTyping() {
  state.typing = false;
  const t = document.getElementById('center-typing-card');
  if (t) t.remove();
}


async function showShuffling() {
  hideTyping();
  const page = document.querySelector('.chat-page');
  if (!page) return;
  if (document.getElementById('center-shuffling-card')) return;

  // 1. 从 IndexedDB 数据库中读取动画配置 (默认为 shuffle)
  const settingRow = await db.settings.get('shufflingStyle');
  const style = settingRow ? settingRow.value : 'shuffle';

  // 2. 从独立组件中获取对应的 HTML 以及底部文本
  const animHTML = getShufflingHTML(style);
  const hintText = getShufflingHint(style);

  // 3. 渲染并将 style 作为 class 加在最外层以供 CSS 独立适配
  page.insertAdjacentHTML('beforeend', `
    <div class="center-typing-card shuffling-style-${style}" id="center-shuffling-card">
      <div class="center-typing-avatar">
        ${avatarHTML(state.character && state.character.avatar, state.character && state.character.name, 50)}
      </div>
      <div class="center-typing-name">${escapeHtml(state.character && state.character.name)}</div>
      <div class="center-typing-loading">
        ${animHTML}
      </div>
      <div class="center-typing-hint">${escapeHtml(hintText)}</div>
    </div>
  `);
}


function hideShuffling() {
  const t = document.getElementById('center-shuffling-card');
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

  showImmediateStatusIndicator();

  scheduleTimers();
}



function showImmediateStatusIndicator() {
  if (state.destroyed) return;

  hideTyping();
  hideShuffling();

  const cfg = (state.character && state.character.replyConfig) || {};
  const hints = (cfg.thinkingHints && cfg.thinkingHints.length) ? cfg.thinkingHints : DEFAULT_THINKING_HINTS;

  showTyping(hints[0]);
  startThinkingUI(hints);
}


function scheduleTimers() {
  cancelTimers({ keepSubtitle: true });
  if (!state.conv || !state.conv.pendingReplyAt) return;

  const remain = state.conv.pendingReplyAt - Date.now();
  if (remain <= 0) { executeReply(); return; }

  const cfg = (state.character && state.character.replyConfig) || {};
  const hints = (cfg.thinkingHints && cfg.thinkingHints.length) ? cfg.thinkingHints : DEFAULT_THINKING_HINTS;

  const typingDurationMs = 3000;
  const shuffleDurationMs = 1500;

  if (remain > typingDurationMs + shuffleDurationMs) {
    state.thinkingTimer = setTimeout(() => {
      if (state.destroyed) return;
      showShuffling();

      state.thinkingTimer = setTimeout(() => {
        if (state.destroyed) return;
        showTyping("正在输入...");
      }, shuffleDurationMs);

    }, remain - (typingDurationMs + shuffleDurationMs));
  } else if (remain > typingDurationMs) {
    showShuffling();
    state.thinkingTimer = setTimeout(() => {
      if (state.destroyed) return;
      showTyping("正在输入...");
    }, remain - typingDurationMs);
  } else {
    showTyping("正在输入...");
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
    const s = (state.character && (state.character.status || state.character.signature)) || '';
    sub.textContent = s;
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

async function markLatestUserUnreadAsRead() {
  const lastUserMsg = [...state.messages].reverse().find((m) => m.sender === 'user' && !m.isRead);
  if (lastUserMsg) {
    await db.messages.update(lastUserMsg.id, { isRead: true });
    lastUserMsg.isRead = true;
    const el = document.querySelector(`.msg-row[data-id="${lastUserMsg.id}"] .msg-read`);
    if (el) el.textContent = '已读';
  }
}

// 递增字卡碎片的共鸣频次统计
async function incrementFragmentResonance(characterId, text) {
  if (!text) return;

  const cleanText = String(text).trim();
  if (!cleanText) return;

  try {
    // 1. 优先获取当前角色绑定的字卡库
    let decks = [];

    const linkedDeckIds = state.character && Array.isArray(state.character.linkedDeckIds)
      ? state.character.linkedDeckIds
      : [];

    if (linkedDeckIds.length) {
      decks = await db.decks.where('id').anyOf(linkedDeckIds).toArray();
    }

    // 2. 在绑定库中查找包含该碎片的字卡库
    let targetDeck = decks.find((d) => {
      const fragments = Array.isArray(d.fragments) ? d.fragments : [];
      return fragments.includes(cleanText);
    });

    // 3. 如果绑定库中没找到，再查找通用字卡库
    if (!targetDeck) {
      const commonDecks = await db.decks
        .filter((d) => !d.bindCharacterId)
        .toArray();

      targetDeck = commonDecks.find((d) => {
        const fragments = Array.isArray(d.fragments) ? d.fragments : [];
        return fragments.includes(cleanText);
      });
    }

    // 4. 更新统计数据
    if (targetDeck) {
      const stats = targetDeck.fragmentStats || {};

      if (!stats[cleanText]) {
        stats[cleanText] = {
          usageCount: 0,
          createdAt: Date.now(),
        };
      }

      stats[cleanText].usageCount = (stats[cleanText].usageCount || 0) + 1;
      stats[cleanText].updatedAt = Date.now();

      await db.decks.update(targetDeck.id, {
        fragmentStats: stats,
      });
    }
  } catch (err) {
    console.warn('Failed to update fragment resonance count:', err);
  }
}

async function executeReply() {
  cancelTimers();

  if (state.destroyed) return;
  if (!state.character) {
    toast('未绑定角色');
    return;
  }

  await db.conversations.update(state.convId, { pendingReplyAt: null });
  if (state.conv) state.conv.pendingReplyAt = null;

  const cfg = state.character.replyConfig || {};
  const quoteChance = typeof cfg.quoteChance === 'number'
    ? cfg.quoteChance
    : DEFAULT_QUOTE_CHANCE;

  await maybeInsertSyncMessage();
  if (state.destroyed) return;

  const userChoice = findLatestUnansweredUserChoice();

  // 没有待回答的用户选项时，才允许触发“跳过回复”
  if (!userChoice) {
    const skipChance = Math.min(1, Math.max(0, cfg.skipReplyChance || 0));

    if (skipChance > 0 && Math.random() < skipChance) {
      const skipList = (cfg.skipHints && cfg.skipHints.length)
        ? cfg.skipHints
        : DEFAULT_SKIP_HINTS;

      await markLatestUserUnreadAsRead();

      const sysMsg = {
        conversationId: state.convId,
        sender: 'system',
        content: pick(skipList),
        type: 'system',
        status: 'sent',
        quotedMessageId: null,
        timestamp: Date.now(),
        isRead: true,
      };

      const sysId = await db.messages.add(sysMsg);
      sysMsg.id = sysId;

      appendMessage(sysMsg);
      await persistConvSummary();
      return;
    }
  }

  await maybeStartCallByChance();

  showShuffling();
  await sleep(700);
  if (state.destroyed) return;
  hideShuffling();

  showTyping();
  await sleep(randInt(400, 900));
  if (state.destroyed) return;

  await markLatestUserUnreadAsRead();

  /**
   * 分支 A：
   * 如果用户发的是 choice 类型消息，并且还没被角色回答，
   * 角色从用户给出的选项里随机选择一个。
   */
  if (userChoice) {
    const answer = pick(userChoice.choice.options);
    await markChoiceAnswered(userChoice.msg.id, answer, 'character');

    let autoQuoteId = null;
    if (quoteChance > 0 && Math.random() < quoteChance) {
      autoQuoteId = userChoice.msg.id;
    }

    // 可选：融合一条角色字卡内容
    const generated = await generateForCharacter(state.character.id);
    const generatedMessages = generated && generated.messages ? generated.messages : [];

    let extraText = '';
if (generatedMessages.length) {
  const pickedMsg = generatedMessages[0];
  const pickedContent = typeof pickedMsg === 'string'
    ? pickedMsg
    : pickedMsg && pickedMsg.content
      ? pickedMsg.content
      : '';

  if (pickedContent) {
    extraText = `。${pickedContent}`;

    // 新增：统计被融合抽取的那条字卡碎片的共鸣频次
    await incrementFragmentResonance(state.character.id, pickedContent);
  }
}


    const finalAnswer = `◈ 选择了「${answer}」${extraText}`;

    const msg = {
      conversationId: state.convId,
      sender: 'character',
      content: finalAnswer,
      type: 'card',
      status: 'sent',
      quotedMessageId: autoQuoteId,
      timestamp: Date.now(),
      isRead: true,
    };

    const id = await db.messages.add(msg);
    msg.id = id;

    hideTyping();

    // 因为 markChoiceAnswered 修改了旧消息，所以这里重新拉取并完整渲染
    state.messages = await db.messages
      .where('conversationId')
      .equals(state.convId)
      .sortBy('timestamp');

    renderMessages();
    playCharSound();
    await persistConvSummary();
    return;
  }

  /**
   * 分支 B：
   * 普通回复：从角色字卡里生成消息。
   */
  const generated = await generateForCharacter(state.character.id);
  const messages = generated && generated.messages ? generated.messages : [];
  const choices = generated && generated.choices ? generated.choices : [];
  const reason = generated && generated.reason;

  if (state.destroyed) return;

  if ((!messages || !messages.length) && (!choices || !choices.length)) {
    hideTyping();
    toast(reason === 'no_fragments' ? '此角色暂无可用的字卡内容' : '生成失败', 2200);
    return;
  }

  /**
   * 普通字卡消息
   */
  for (let i = 0; i < messages.length; i++) {
    if (state.destroyed) return;

    if (i > 0) {
      hideTyping();
      showTyping();
      await sleep(randInt(600, 1400));
    }

    let autoQuoteId = null;
    if (i === 0 && quoteChance > 0 && Math.random() < quoteChance) {
      autoQuoteId = pickAutoQuoteTarget();
    }

    const msg = {
      conversationId: state.convId,
      sender: 'character',
      content: messages[i],
      type: 'card',
      status: 'sent',
      quotedMessageId: autoQuoteId,
      timestamp: Date.now(),
      isRead: true,
    };

    const id = await db.messages.add(msg);
msg.id = id;

// 新增：增加字卡共鸣频次统计
await incrementFragmentResonance(state.character.id, messages[i]);

hideTyping();
appendMessage(msg);
playCharSound();

  }

  /**
   * 如果 generateForCharacter 返回了 choices，
   * 这里把它们作为角色发出的 choice 消息插入。
   *
   * 注意：
   * 如果你的 choices 已经是 choiceToContent() 后的字符串，可以直接用；
   * 如果是原始对象，这里会自动转成 content。
   */
  for (let i = 0; i < choices.length; i++) {
    if (state.destroyed) return;

    if (messages.length > 0 || i > 0) {
      hideTyping();
      showTyping();
      await sleep(randInt(600, 1400));
    }

    const choice = choices[i];
    const content = typeof choice === 'string'
      ? choice
      : choiceToContent(choice);

    const msg = {
      conversationId: state.convId,
      sender: 'character',
      content,
      type: 'choice',
      status: 'sent',
      quotedMessageId: null,
      timestamp: Date.now(),
      isRead: true,
    };

    const id = await db.messages.add(msg);
    msg.id = id;

    hideTyping();
    appendMessage(msg);
    playCharSound();
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
    row.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, textarea, [data-choice-msg], [data-quote-jump]')) return;
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
  const msg = state.messages.find((m) => m.id === id);
  if (!msg) return;
  const canQuote = isQuotableMsg(msg);
  haptic(15);
  const { close } = openSheet({
    title: '消息',
    body: `<div class="sheet-list">
      ${canQuote ? `<div class="sheet-list-item" data-act="quote">
        <div class="sheet-list-body"><div class="sheet-list-title">引用</div></div>
      </div>` : ''}
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
    const target = state.messages.find((m) => m.id === id);
    if (act === 'quote' && target) {
      close();
      await setPendingQuote(id);
    } else if (act === 'copy' && target) {
      const text = target.type === 'choice' ? choiceSummary(target.content) : target.content;
      try { await navigator.clipboard.writeText(text); toast('已复制'); }
      catch (e) { toast('复制失败'); }
      close();
    } else if (act === 'delete') {
      close();
      const ok = await confirmSheet('确定删除这条消息？', { danger: true, okText: '删除' });
      if (ok) {
        await db.messages.delete(id);
        state.messages = state.messages.filter((m) => m.id !== id);
        if (state.pendingQuoteId === id) await clearPendingQuote();
        renderMessages();
        renderQuoteBar();
        await persistConvSummary();
      }
    }
  });
}

/* ---------- 虚拟通话 ---------- */
function getCallRangeSec() {
  const cfg = (state.character && state.character.replyConfig) || {};
  const rawMin = Number(cfg.callMinSec ?? cfg.minCallDurationSec ?? DEFAULT_CALL_MIN_SEC);
  const rawMax = Number(cfg.callMaxSec ?? cfg.maxCallDurationSec ?? DEFAULT_CALL_MAX_SEC);
  const min = Math.max(10, Math.floor(rawMin || DEFAULT_CALL_MIN_SEC));
  const max = Math.max(min, Math.floor(rawMax || DEFAULT_CALL_MAX_SEC));
  return { min, max };
}

function getCallChance() {
  const cfg = (state.character && state.character.replyConfig) || {};
  return Math.min(1, Math.max(0, Number(cfg.callChance || 0)));
}

async function maybeStartCallByChance() {
  if (CallManager && CallManager.state && CallManager.state !== 'idle') return false;

  const chance = getCallChance();
  if (chance <= 0 || Math.random() >= chance) return false;

  return await startVirtualCall(false);
}


function formatCallDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function syncCallStateFromManager() {
  const managerBusy = CallManager && CallManager.state && CallManager.state !== 'idle';

  if (!managerBusy && !state.call) return;

  if (managerBusy && !state.call) {
    const c = state.character || {};
    state.call = {
      id: Date.now(),
      conversationId: state.convId,
      characterId: c.id,
      characterName: c.name,
      characterAvatar: c.avatar,
      startedAt: Date.now(),
      manual: true,
    };
    state.callStartedAt = Date.now();
    state.callDurationSec = 0;
  }

  if (!managerBusy && state.call) {
    state.call = null;
    state.callStartedAt = null;
    state.callDurationSec = 0;
  }
}

async function startVirtualCall(manual = true) {
  if (CallManager && CallManager.state && CallManager.state !== 'idle') {
    syncCallStateFromManager();
    return false;
  }

  const c = state.character || {};

  state.call = {
    id: Date.now(),
    conversationId: state.convId,
    characterId: c.id,
    characterName: c.name,
    characterAvatar: c.avatar,
    startedAt: Date.now(),
    manual,
  };

  state.callStartedAt = Date.now();
  state.callDurationSec = 0;

  try {
    await CallManager.startCall(
      state.convId,
      c.id,
      c.name,
      c.avatar,
      manual
    );
  } catch (err) {
    console.error('startVirtualCall failed:', err);
    state.call = null;
    state.callStartedAt = null;
    state.callDurationSec = 0;
    toast('通话启动失败');
    return false;
  }

  return true;
}

async function endVirtualCall() {
  try {
    if (CallManager) {
      if (typeof CallManager.endCall === 'function') {
        await CallManager.endCall();
      } else if (typeof CallManager.hangup === 'function') {
        await CallManager.hangup();
      } else if (typeof CallManager.stopCall === 'function') {
        await CallManager.stopCall();
      } else if (typeof CallManager.close === 'function') {
        await CallManager.close();
      }
    }
  } catch (err) {
    console.warn('endVirtualCall failed:', err);
  }

  if (state.callTimer) {
    clearInterval(state.callTimer);
    state.callTimer = null;
  }

  if (state.callRingTimer) {
    clearTimeout(state.callRingTimer);
    state.callRingTimer = null;
  }

  if (state.callEndTimer) {
    clearTimeout(state.callEndTimer);
    state.callEndTimer = null;
  }

  state.call = null;
  state.callStartedAt = null;
  state.callDurationSec = 0;
  state.callExpanded = false;

  const oldFull = document.getElementById('virtual-call-full');
  if (oldFull) oldFull.remove();

  toast('通话已结束');
}

function openCallFull() {
  syncCallStateFromManager();

  if (!state.call && (!CallManager || CallManager.state === 'idle')) {
    toast('当前没有正在进行的通话');
    return;
  }

  const old = document.getElementById('virtual-call-full');
  if (old) old.remove();

  state.callExpanded = true;

  const c = state.character || {};
  const startedAt = state.callStartedAt || (state.call && state.call.startedAt) || Date.now();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="virtual-call-full" id="virtual-call-full">
      <div class="virtual-call-bg"></div>

      <div class="virtual-call-content">
        <button class="virtual-call-minimize" data-act="call-minimize" aria-label="收起通话">
          ${SVG_MINIMIZE}
        </button>

        <div class="virtual-call-avatar">
          ${avatarHTML(c.avatar, c.name, 108)}
        </div>

        <div class="virtual-call-name">${escapeHtml(c.name || '未知角色')}</div>
        <div class="virtual-call-status" id="virtual-call-status">通话中</div>
        <div class="virtual-call-duration" id="virtual-call-duration">00:00</div>

        <div class="virtual-call-wave">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <button class="virtual-call-hangup" data-act="call-hangup" aria-label="挂断">
          ${SVG_PHONE_OFF}
        </button>
      </div>
    </div>
  `);

  const full = document.getElementById('virtual-call-full');
  const durationEl = document.getElementById('virtual-call-duration');

  const updateDuration = () => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    state.callDurationSec = sec;
    if (durationEl) durationEl.textContent = formatCallDuration(sec);
  };

  updateDuration();

  if (state.callTimer) clearInterval(state.callTimer);
  state.callTimer = setInterval(updateDuration, 1000);

  full.querySelector('[data-act=call-minimize]').addEventListener('click', () => {
    haptic(6);
    state.callExpanded = false;
    full.remove();
  });

  full.querySelector('[data-act=call-hangup]').addEventListener('click', async () => {
    haptic(12);
    await endVirtualCall();
  });
}



/* ---------- 面板：状态卡 + 音乐共听 ---------- */
function panelHTML() {
  return `
    <div class="chat-panel" id="chat-panel" data-expanded="false" data-tab="status">
      <div class="chat-panel-inner">
        <div class="chat-panel-tabs">
          <button class="panel-tab active" data-tab="status">状态</button>
          <button class="panel-tab" data-tab="music">共鸣</button>
          <span class="panel-tab-indicator"></span>
        </div>
        <div class="panel-view panel-view-status active" data-view="status">
          <div class="status-track-wrap">
            <div class="status-track" id="status-track">
              <div class="status-card status-card-slot" id="status-card-char"></div>
              <div class="status-card status-card-slot" id="status-card-user"></div>
            </div>
          </div>
          <div class="status-dots">
            <button class="status-dot active" data-dot="0" aria-label="角色卡"></button>
            <button class="status-dot" data-dot="1" aria-label="user 卡"></button>
          </div>
        </div>
        <div class="panel-view panel-view-music" data-view="music">
          <div class="music-card" id="music-card"></div>
        </div>
      </div>
    </div>
  `;
}

function cardBgClass(bg) {
  if (bg === 'transparent') return 'card-glass';
  if (bg && typeof bg === 'string') return 'card-image';
  return 'card-default';
}
function cardBgStyle(bg) {
  if (bg && bg !== 'transparent') {
    const safe = String(bg).replace(/"/g, '\\"');
    return `background-image:url("${safe}");`;
  }
  return '';
}

function renderCharCard() {
  const el = document.getElementById('status-card-char');
  if (!el) return;
  const c = state.character;
  if (!c) { el.innerHTML = '<div class="card-empty">未绑定角色</div>'; return; }
  const bg = state.conv && state.conv.charCardBg;
  el.className = 'status-card status-card-slot ' + cardBgClass(bg);
  el.setAttribute('style', cardBgStyle(bg));
  const idText = String(c.id || 0).padStart(4, '0');
  el.innerHTML = `
    <button class="card-bg-btn" data-card-bg="char" aria-label="切换背景">${SVG_PALETTE}</button>
    <div class="card-header">
      <div class="card-avatar-lg">${avatarHTML(c.avatar, c.name, 60)}</div>
      <div class="card-header-info">
        <div class="card-name">${escapeHtml(c.name || '')}</div>
        <div class="card-role">CHARACTER</div>
      </div>
    </div>
    <div class="card-divider"></div>
    <div class="card-row">
      <div class="card-row-label">签名</div>
      <div class="card-row-val">${escapeHtml(c.signature || '—')}</div>
    </div>
    <div class="card-row">
      <div class="card-row-label">状态</div>
      <div class="card-row-val">${escapeHtml(c.status || '—')}</div>
    </div>
    <div class="card-serial">NO. ${idText}</div>
  `;
}

function renderUserCard() {
  const el = document.getElementById('status-card-user');
  if (!el) return;
  const u = state.user;
  if (!u) return;
  const bg = state.conv && state.conv.userCardBg;
  el.className = 'status-card status-card-slot ' + cardBgClass(bg);
  el.setAttribute('style', cardBgStyle(bg));
  const idText = String(u.id || 1).padStart(4, '0');
  el.innerHTML = `
    <button class="card-bg-btn" data-card-bg="user" aria-label="切换背景">${SVG_PALETTE}</button>
    <div class="card-header">
      <div class="card-avatar-lg">${avatarHTML(u.avatar, u.name, 60)}</div>
      <div class="card-header-info">
        <input class="ghost-input card-name" data-target="user" data-field="name" value="${escapeAttr(u.name || '')}" placeholder="未命名" maxlength="30">
        <div class="card-role">宇宙 · 这端</div>
      </div>
    </div>
    <div class="card-divider"></div>
    <div class="card-row">
      <div class="card-row-label">签名</div>
      <input class="ghost-input card-row-val" data-target="user" data-field="signature" value="${escapeAttr(u.signature || '')}" placeholder="—" maxlength="60">
    </div>
    <div class="card-row">
      <div class="card-row-label">状态</div>
      <input class="ghost-input card-row-val" data-target="user" data-field="status" value="${escapeAttr(u.status || '')}" placeholder="—" maxlength="30">
    </div>
    <div class="card-serial">NO. ${idText}</div>
  `;
}

function renderMusicCard() {
  const el = document.getElementById('music-card');
  if (!el) return;
  const c = state.character;
  const u = state.user;
  const music = (state.conv && state.conv.musicBar) || { ...DEFAULT_MUSIC };
  
  // 计算今天零点以后的共鸣消息数
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = state.messages.filter(m => m.timestamp >= todayStart.getTime() && m.type !== 'system' && m.type !== 'sync').length;
  
  // 注入新模块的渲染结果
  el.innerHTML = renderMusicCardHTML(u, c, music, todayCount);
}

function renderPill() {
  const titleEl = document.getElementById('chat-title');
  const subEl = document.getElementById('chat-subtitle');
  const avEl = document.getElementById('chat-header-avatar');
  const c = state.character;

  if (titleEl) {
    titleEl.textContent = (c && c.name) || '（角色已删除）';
  }

  if (subEl && !subEl.classList.contains('thinking')) {
    const s = c && (c.status || c.signature);
    subEl.textContent = s || '';
  }

  if (avEl) {
    avEl.innerHTML = avatarHTML(c && c.avatar, c && c.name, 30);
  }
}



function updateMessageCount() {
  renderMusicCard();
}

function togglePanel(force) {
  const willOpen = typeof force === 'boolean' ? force : !state.panelExpanded;
  state.panelExpanded = willOpen;
  const panel = document.getElementById('chat-panel');
  const pill = document.querySelector('.chat-pill');
  if (panel) panel.dataset.expanded = String(willOpen);
  if (pill) pill.classList.toggle('open', willOpen);
  haptic(willOpen ? 12 : 6);
}

function switchTab(tab) {
  if (tab !== 'status' && tab !== 'music') return;
  state.panelTab = tab;
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  panel.dataset.tab = tab;
  panel.querySelectorAll('.panel-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  panel.querySelectorAll('.panel-view').forEach(v => {
    v.classList.toggle('active', v.dataset.view === tab);
  });
  haptic(6);
}

function updateStatusSwipe() {
  const track = document.getElementById('status-track');
  if (!track) return;
  track.style.transform = `translateX(-${state.statusCardIndex * 50}%)`;
  document.querySelectorAll('.status-dot').forEach((d, i) => {
    d.classList.toggle('active', i === state.statusCardIndex);
  });
}

function bindStatusSwipe() {
  const track = document.getElementById('status-track');
  if (!track) return;
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, ignoring = false;

  const onStart = (e) => {
    if (e.target.closest('input, textarea, button, [contenteditable]')) { ignoring = true; return; }
    ignoring = false;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY; dx = 0;
    dragging = true; decided = false;
    track.style.transition = 'none';
  };
  const onMove = (e) => {
    if (ignoring || !dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const cx = p.clientX - startX;
    const cy = p.clientY - startY;
    if (!decided) {
      if (Math.abs(cx) < 6 && Math.abs(cy) < 6) return;
      if (Math.abs(cy) > Math.abs(cx)) { dragging = false; track.style.transition = ''; return; }
      decided = true;
    }
    dx = cx;
    const base = -state.statusCardIndex * 50;
    track.style.transform = `translateX(calc(${base}% + ${dx}px))`;
  };
  const onEnd = () => {
    if (!dragging) { ignoring = false; return; }
    dragging = false;
    track.style.transition = '';
    if (decided) {
      const w = track.offsetWidth / 2;
      const threshold = w * 0.22;
      if (dx < -threshold && state.statusCardIndex === 0) state.statusCardIndex = 1;
      else if (dx > threshold && state.statusCardIndex === 1) state.statusCardIndex = 0;
    }
    updateStatusSwipe();
  };
  track.addEventListener('touchstart', onStart, { passive: true });
  track.addEventListener('touchmove', onMove, { passive: true });
  track.addEventListener('touchend', onEnd);
  track.addEventListener('touchcancel', onEnd);
}

async function saveUserField(field, value) {
  if (!state.user || !state.user.id) return;
  const val = (value || '').trim();
  const patch = { [field]: val };
  await db.user.update(state.user.id, patch);
  Object.assign(state.user, patch);
}

async function saveMusicField(field, value) {
  const val = (value || '').trim();
  const current = (state.conv && state.conv.musicBar) || { ...DEFAULT_MUSIC };
  const next = { ...current, [field]: val };
  await db.conversations.update(state.convId, { musicBar: next });
  if (state.conv) state.conv.musicBar = next;
}

function bindPanelEvents() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

   panel.addEventListener('change', async (e) => {
    // 监听音乐舱的外观切换
    if (e.target && e.target.id === 'music-style-select') {
      const style = e.target.value;
      const current = (state.conv && state.conv.musicBar) || { ...DEFAULT_MUSIC };
      const next = { ...current, style };
      await db.conversations.update(state.convId, { musicBar: next });
      if (state.conv) state.conv.musicBar = next;
      renderMusicCard();
      haptic(10);
      return;
    }

    const input = e.target.closest('.ghost-input');
    if (!input) return;
    const target = input.dataset.target;
    const field = input.dataset.field;
    if (target === 'user') await saveUserField(field, input.value);
    else if (target === 'music') await saveMusicField(field, input.value);
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = e.target.closest('.ghost-input');
      if (input) { e.preventDefault(); input.blur(); }
    }
  });

  panel.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  panel.querySelectorAll('.status-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      state.statusCardIndex = Number(btn.dataset.dot) || 0;
      updateStatusSwipe();
      haptic(6);
    });
  });

   panel.addEventListener('click', async (e) => {
    // 监听虚拟播放的开启与关闭
    const playToggle = e.target.closest('#music-play-toggle');
    if (playToggle) {
      e.stopPropagation();
      const current = (state.conv && state.conv.musicBar) || { ...DEFAULT_MUSIC };
      const playing = !current.playing;
      const next = { ...current, playing };
      await db.conversations.update(state.convId, { musicBar: next });
      if (state.conv) state.conv.musicBar = next;
      renderMusicCard();
      haptic(playing ? 12 : 8);
      return;
    }

    const bgBtn = e.target.closest('[data-card-bg]');
    if (bgBtn) {
      e.stopPropagation();
      openCardBgSheet(bgBtn.getAttribute('data-card-bg'));
    }
  });

}

function fileToCardBgDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read fail'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('img fail'));
      img.onload = () => {
        const maxW = 900;
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

async function openCardBgSheet(which) {
  const key = which === 'char' ? 'charCardBg' : 'userCardBg';
  const cur = state.conv && state.conv[key];
  const isImg = cur && cur !== 'transparent';
  const currentURL = isImg && !String(cur).startsWith('data:') ? cur : '';

  const { close } = openSheet({
    title: `${which === 'char' ? '角色卡' : 'User 卡'} 背景`,
    body: `
      <div class="sheet-list">
        <div class="sheet-list-item ${!cur ? 'selected' : ''}" data-bg-opt="default">
          <div class="sheet-list-body"><div class="sheet-list-title">默认（主题色）</div></div>
          <div class="sheet-list-check">${!cur ? '<span style="font-size:11px;">已选</span>' : ''}</div>
        </div>
        <div class="sheet-list-item ${cur === 'transparent' ? 'selected' : ''}" data-bg-opt="transparent">
          <div class="sheet-list-body">
            <div class="sheet-list-title">透明玻璃</div>
            <div class="sheet-list-sub">透出聊天壁纸</div>
          </div>
          <div class="sheet-list-check">${cur === 'transparent' ? '<span style="font-size:11px;">已选</span>' : ''}</div>
        </div>
      </div>
      <div class="field" style="margin-top:16px;">
        <div class="field-label">图片 URL</div>
        <input id="card-bg-url" class="input" type="text" placeholder="https://..." value="${escapeAttr(currentURL)}">
      </div>
      <div class="field">
        <div class="field-label">或上传本地图片</div>
        <input id="card-bg-file" type="file" accept="image/*" style="font-size:13px; color: var(--color-text-secondary);">
        <div class="field-hint">会自动压缩到最大宽 900</div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-secondary" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="save-img">应用图片</button>
      </div>
    `,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const opt = e.target.closest('[data-bg-opt]');
    if (opt) {
      const v = opt.getAttribute('data-bg-opt');
      const nextVal = v === 'default' ? null : v;
      await updateConv({ [key]: nextVal });
      if (which === 'char') renderCharCard(); else renderUserCard();
      close();
      toast('已应用');
      return;
    }
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'cancel') { close(); return; }
    if (act === 'save-img') {
      const url = root.querySelector('#card-bg-url').value.trim();
      const fileInput = root.querySelector('#card-bg-file');
      const file = fileInput && fileInput.files && fileInput.files[0];
      let val = null;
      btn.disabled = true;
      if (file) {
        try { val = await fileToCardBgDataURL(file); }
        catch (err) { toast('图片读取失败'); btn.disabled = false; return; }
      } else if (url) {
        val = url;
      }
      if (!val) { toast('请输入 URL 或选择文件'); btn.disabled = false; return; }
      await updateConv({ [key]: val });
      if (which === 'char') renderCharCard(); else renderUserCard();
      close();
      toast('已应用');
    }
  });
}

/* ---------- 更多菜单 & 其他 sheet ---------- */
async function openChatMenu() {
  const kaOn = await keepAlive.loadEnabled();
  const kaLive = keepAlive.isRunning();
  const wpText = state.conv && state.conv.wallpaper ? '已设置' : '未设置';
  const bubbleText = bubblePresetLabel(state.conv && state.conv.bubbleStyle);
  const typingText = (state.conv && state.conv.typingHint)
    ? escapeHtml(state.conv.typingHint)
    : '默认（仅三点动画）';
  const soundOpt = (state.conv && state.conv.soundOption) || 'inherit';
  const soundText = SOUND_LABELS[soundOpt] || '跟随全局';

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
      <div class="sheet-list-item" data-act="sound">
        <div class="sheet-list-body">
          <div class="sheet-list-title">提示音</div>
          <div class="sheet-list-sub">${soundText}</div>
        </div>
      </div>
      <div class="sheet-list-item" data-act="call-now">
        <div class="sheet-list-body">
          <div class="sheet-list-title">发起虚拟通话</div>
          <div class="sheet-list-sub">显示心跳挂件，可展开全屏通话界面</div>
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
    } else if (act === 'bubble-style') { close(); await sleep(280); openBubbleStyleSheet(); }
    else if (act === 'wallpaper') { close(); await sleep(280); openWallpaperSheet(); }
    else if (act === 'typing-hint') { close(); await sleep(280); openTypingHintSheet(); }
    else if (act === 'sound') { close(); await sleep(280); openSoundSheet(); }
    else if (act === 'call-now') {
  close();

  if (CallManager && CallManager.state && CallManager.state !== 'idle') {
    syncCallStateFromManager();
    openCallFull();
    return;
  }

  const ok = await startVirtualCall(true);
  if (ok) {
    openCallFull();
  }
}

    else if (act === 'clear') {
      close();
      const ok = await confirmSheet('清空所有消息？', { danger: true, okText: '清空' });
      if (ok) {
        await db.messages.where('conversationId').equals(state.convId).delete();
        state.messages = [];
        if (state.pendingQuoteId) await clearPendingQuote();
        renderMessages();
        renderQuoteBar();
        renderMusicCard();
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
    if (preset === 'custom') { close(); await sleep(280); openCustomCSSSheet(); }
    else { await updateConv({ bubbleStyle: preset }); close(); toast('已应用'); }
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
        <code>.msg-body</code> 气泡正文<br>
        <code>.quote-card</code> 气泡内引用卡<br>
        <code>.choice-option</code> 选择题按钮<br>
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
    if (act === 'cancel') close();
    else if (act === 'save') {
      const val = document.getElementById('custom-css-input').value;
      await updateConv({ bubbleStyle: 'custom', customBubbleCSS: val });
      close();
      toast('已应用');
    }
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read fail'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
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
    else if (act === 'remove') { await updateConv({ wallpaper: null }); close(); toast('已移除壁纸'); }
    else if (act === 'save') {
      const url = document.getElementById('wp-url').value.trim();
      const fileInput = document.getElementById('wp-file');
      const file = fileInput && fileInput.files && fileInput.files[0];
      let val = null;
      btn.disabled = true;
      if (file) {
        try { val = await fileToWallpaperDataURL(file); }
        catch (err) { toast('图片读取失败'); btn.disabled = false; return; }
      } else if (url) { val = url; }
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

async function openSoundSheet() {
  await sound.loadConfig();
  const gCfg = sound.getConfig();
  const convOpt = (state.conv && state.conv.soundOption) || 'inherit';
  const convCustomUrl = (state.conv && state.conv.customSoundUrl) || '';
  const customUrlShow = gCfg.customUrl
    ? (gCfg.customUrl.startsWith('data:')
        ? '当前已保存本地音频'
        : '当前 URL: ' + escapeHtml(gCfg.customUrl.slice(0, 40)) + (gCfg.customUrl.length > 40 ? '...' : ''))
    : '未设置';
  const convOpts = ['inherit', 'silent', 'bell', 'chime', 'custom'];

  const { close } = openSheet({
    title: '提示音',
    body: `
      <div class="sound-row">
        <div class="sound-label">静音</div>
        <label class="mini-switch">
          <input type="checkbox" id="snd-muted" ${gCfg.muted ? 'checked' : ''}>
          <span></span>
        </label>
      </div>
      <div class="sound-row">
        <div class="sound-label">音量</div>
        <input type="range" min="0" max="100" value="${Math.round(gCfg.volume * 100)}" id="snd-volume" style="flex:1;">
        <div class="sound-val" id="snd-vol-val">${Math.round(gCfg.volume * 100)}</div>
      </div>

      <div class="sound-section-title">默认音色</div>
      <div class="sheet-list">
        <div class="sheet-list-item ${gCfg.builtin === 'bell' ? 'selected' : ''}" data-builtin="bell">
          <div class="sheet-list-body"><div class="sheet-list-title">清脆铃</div></div>
          <button class="btn btn-ghost btn-mini" data-preview="bell">试听</button>
          <div class="sheet-list-check">${gCfg.builtin === 'bell' ? '<span style="font-size:11px;">已选</span>' : ''}</div>
        </div>
        <div class="sheet-list-item ${gCfg.builtin === 'chime' ? 'selected' : ''}" data-builtin="chime">
          <div class="sheet-list-body"><div class="sheet-list-title">磬音</div></div>
          <button class="btn btn-ghost btn-mini" data-preview="chime">试听</button>
          <div class="sheet-list-check">${gCfg.builtin === 'chime' ? '<span style="font-size:11px;">已选</span>' : ''}</div>
        </div>
      </div>

      <div class="sound-section-title">自定义音（URL 或上传）</div>
      <div class="field">
        <input id="snd-url" class="input" type="text" placeholder="https://.../sound.mp3" value="${escapeAttr(gCfg.customUrl && !gCfg.customUrl.startsWith('data:') ? gCfg.customUrl : '')}">
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
          <input id="snd-file" type="file" accept="audio/*" style="font-size:12px; color:var(--color-text-secondary); flex:1; min-width:120px;">
          <button class="btn btn-secondary btn-mini" data-act="save-custom">保存</button>
          <button class="btn btn-ghost btn-mini" data-preview="custom">试听</button>
          <button class="btn btn-ghost btn-mini" data-act="clear-custom">清空</button>
        </div>
        <div class="field-hint" style="margin-top:6px;">${customUrlShow}</div>
      </div>

      <div class="sound-section-title">本对话</div>
      <div class="sheet-list">
        ${convOpts.map((k) => `
          <div class="sheet-list-item ${convOpt === k ? 'selected' : ''}" data-conv-opt="${k}">
            <div class="sheet-list-body"><div class="sheet-list-title">${SOUND_LABELS[k]}</div></div>
            <div class="sheet-list-check">${convOpt === k ? '<span style="font-size:11px;">已选</span>' : ''}</div>
          </div>
        `).join('')}
      </div>
      ${convOpt === 'custom' ? `
        <div class="field" style="margin-top:12px;">
          <div class="field-label">本对话自定义 URL（留空则用全局自定义）</div>
          <input id="snd-conv-url" class="input" type="text" placeholder="https://..." value="${escapeAttr(convCustomUrl)}">
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn btn-secondary btn-mini" data-act="save-conv-url">保存本对话 URL</button>
          </div>
        </div>
      ` : ''}
    `,
    maxHeight: '82vh',
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  const mutedInput = root.querySelector('#snd-muted');
  mutedInput.addEventListener('change', async () => { await sound.saveConfig({ muted: mutedInput.checked }); });
  const volInput = root.querySelector('#snd-volume');
  const volVal = root.querySelector('#snd-vol-val');
  volInput.addEventListener('input', () => { volVal.textContent = volInput.value; });
  volInput.addEventListener('change', async () => { await sound.saveConfig({ volume: Number(volInput.value) / 100 }); });

  root.addEventListener('click', async (e) => {
    const prevBtn = e.target.closest('[data-preview]');
    if (prevBtn) {
      e.stopPropagation();
      const type = prevBtn.getAttribute('data-preview');
      await sound.unlock();
      if (type === 'custom') {
        const urlInput = root.querySelector('#snd-url');
        const url = (urlInput && urlInput.value.trim()) || gCfg.customUrl;
        if (!url) { toast('未设置自定义音'); return; }
        await sound.preview('custom', url);
      } else {
        await sound.preview(type);
      }
      return;
    }
    const saveCustomBtn = e.target.closest('[data-act=save-custom]');
    if (saveCustomBtn) {
      const url = root.querySelector('#snd-url').value.trim();
      const fileInput = root.querySelector('#snd-file');
      const file = fileInput && fileInput.files && fileInput.files[0];
      let val = null;
      saveCustomBtn.disabled = true;
      if (file) {
        try { val = await fileToDataURL(file); }
        catch (err) { toast('读取失败'); saveCustomBtn.disabled = false; return; }
      } else if (url) { val = url; }
      else { toast('请填 URL 或选择文件'); saveCustomBtn.disabled = false; return; }
      await sound.saveConfig({ customUrl: val });
      toast('已保存');
      close(); await sleep(280); openSoundSheet();
      return;
    }
    const clearBtn = e.target.closest('[data-act=clear-custom]');
    if (clearBtn) {
      await sound.saveConfig({ customUrl: null });
      toast('已清空');
      close(); await sleep(280); openSoundSheet();
      return;
    }
    const saveConvUrlBtn = e.target.closest('[data-act=save-conv-url]');
    if (saveConvUrlBtn) {
      const url = root.querySelector('#snd-conv-url').value.trim();
      await updateConv({ customSoundUrl: url || null });
      toast('已保存');
      return;
    }
    if (e.target.closest('button')) return;

    const builtinItem = e.target.closest('[data-builtin]');
    if (builtinItem) {
      const k = builtinItem.getAttribute('data-builtin');
      await sound.saveConfig({ builtin: k });
      close(); await sleep(280); openSoundSheet();
      return;
    }
    const convOptItem = e.target.closest('[data-conv-opt]');
    if (convOptItem) {
      const k = convOptItem.getAttribute('data-conv-opt');
      await updateConv({ soundOption: k });
      close(); await sleep(280); openSoundSheet();
      return;
    }
  });
}
/* ============================================================
   checkPendingReplyOnVisible
   ============================================================ */
async function checkPendingReplyOnVisible() {
  if (!state.convId) return;
  const conv = await db.conversations.get(state.convId);
  if (!conv) return;
  state.conv = conv;
  if (conv.pendingQuoteId) {
    state.pendingQuoteId = conv.pendingQuoteId;
  }
  if (conv.pendingReplyAt) {
    const remain = conv.pendingReplyAt - Date.now();
    if (remain <= 0) {
      executeReply();
    } else {
      scheduleTimers();
    }
  } else {
    cancelTimers({ keepSubtitle: false });
  }
}

/* ============================================================
   render / destroy
   ============================================================ */

export async function render(root, params = {}) {
  state = {
  convId: Number(params.id),
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
  pendingQuoteId: null,
  panelExpanded: false,
  panelTab: 'status',
  statusCardIndex: 0,

  draftMessages: [],

  call: null,
  callTimer: null,
  callRingTimer: null,
  callEndTimer: null,
  callStartedAt: null,
  callDurationSec: 0,
  callExpanded: false,
};

  if (!state.convId) { navigate('/cards'); return; }

  root.innerHTML = `
    <div class="page chat-page" data-bubble-preset="preset-1">
      <div class="chat-wallpaper"></div>

      <div class="chat-topbar">
  <button class="chat-nav-btn" data-act="back" aria-label="返回">${ICON.back}</button>
  <button class="chat-pill" data-act="toggle-panel" type="button">
    <span class="pill-avatar" id="chat-header-avatar"></span>
    <span class="pill-text">
      <span class="chat-title" id="chat-title">加载中</span>
      <span class="chat-subtitle" id="chat-subtitle"></span>
    </span>
    <span class="pill-chev">${SVG_CHEV}</span>
  </button>
  <button class="chat-nav-btn" data-act="call-phone" aria-label="拨打电话">${SVG_PHONE}</button>
  <button class="chat-nav-btn" data-act="menu" aria-label="更多">${ICON.more}</button>
</div>


      ${panelHTML()}

      <div class="msg-scroll" id="msg-scroll"></div>

     
    <div class="chat-input-dock">
  <button class="dock-btn draft" data-act="open-draft" title="草稿箱" aria-label="草稿箱">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  </button>

  <button class="dock-btn choice-trigger" data-act="open-choice-creator" title="发起选择题" aria-label="发起选择题">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </button>

  <button class="dock-btn dice-trigger" data-act="open-star-dice" title="共时星骰" aria-label="共时星骰">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
      <line x1="12" y1="22" x2="12" y2="15.5"/>
      <line x1="22" y1="8.5" x2="12" y2="12"/>
      <line x1="2" y1="8.5" x2="12" y2="12"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
  </button>

  <button class="dock-btn spark" data-act="trigger" title="立即触发回复">${ICON.spark}</button>
  <textarea id="chat-input" class="dock-input" rows="1" placeholder="说点什么..." maxlength="2000"></textarea>
  <button class="dock-btn send" id="send-btn" data-act="send" disabled title="发送">${ICON.send}</button>
</div>




      <style>
        .chat-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          position: relative;
        }
        .chat-wallpaper {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        .chat-wallpaper.has-wallpaper::after {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--color-bg-primary);
          opacity: 0.5;
        }

        /* ---------- 浮动顶栏 ---------- */
        .chat-topbar {
          position: relative;
          z-index: 11;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: calc(env(safe-area-inset-top) + 10px) 10px 8px;
          background: transparent;
        }
        .chat-nav-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          background: color-mix(in srgb, var(--color-bg-secondary) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          flex-shrink: 0;
          transition: transform 0.15s, background 0.2s, color 0.2s;
        }
        .chat-nav-btn:active {
          transform: scale(0.9);
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }
        .chat-pill {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 14px 5px 5px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg-secondary) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          color: var(--color-text-primary);
          transition: transform 0.15s, background 0.2s;
        }
        .chat-pill:active { transform: scale(0.98); }
        .chat-pill .pill-avatar { flex-shrink: 0; display: inline-flex; }
        .chat-pill .pill-avatar .avatar {
          width: 30px;
          height: 30px;
          font-size: 12px;
        }
        .chat-pill .pill-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
        }
        .chat-pill .chat-title {
          font-size: 13px;
          letter-spacing: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .chat-pill .chat-subtitle {
          font-size: 10px;
          color: var(--color-text-tertiary);
          letter-spacing: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          transition: color 0.4s;
        }
        .chat-pill .chat-subtitle:empty { display: none; }
        .chat-pill .chat-subtitle.thinking {
          color: var(--color-accent);
          animation: breath 2.4s ease-in-out infinite;
        }
        .chat-pill .pill-chev {
          display: inline-flex;
          color: var(--color-text-tertiary);
          transition: transform 0.32s cubic-bezier(.2,.7,.2,1), color 0.2s;
          flex-shrink: 0;
        }
        .chat-pill.open .pill-chev {
          transform: rotate(180deg);
          color: var(--color-accent);
        }

        /* ---------- 折叠面板 ---------- */
        .chat-panel {
          position: relative;
          z-index: 9;
          max-height: 0;
          overflow: hidden;
          padding: 0 12px;
          transition: max-height 0.4s cubic-bezier(.2,.7,.2,1);
        }
        .chat-panel[data-expanded="true"] {
          max-height: 520px;
        }
        .chat-panel-inner {
          padding-top: 6px;
        }
        .chat-panel-tabs {
          position: relative;
          display: flex;
          margin: 4px 0 12px;
          border-bottom: 1px solid var(--color-border);
        }
        .panel-tab {
          flex: 1;
          padding: 8px 0;
          background: transparent;
          color: var(--color-text-tertiary);
          font-size: 12px;
          letter-spacing: 4px;
          transition: color 0.2s;
        }
        .panel-tab.active { color: var(--color-text-primary); }
        .panel-tab-indicator {
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 50%;
          height: 2px;
          background: var(--color-accent);
          transition: transform 0.32s cubic-bezier(.2,.7,.2,1);
        }
        .chat-panel[data-tab="music"] .panel-tab-indicator { transform: translateX(100%); }
        .panel-view { display: none; }
        .panel-view.active { display: block; animation: fadeIn 0.32s ease; }

        /* ---------- 状态卡片 ---------- */
        .status-track-wrap {
          overflow: hidden;
          border-radius: 16px;
        }
        .status-track {
          display: flex;
          width: 200%;
          transition: transform 0.34s cubic-bezier(.2,.7,.2,1);
          touch-action: pan-y;
          will-change: transform;
        }
        .status-card-slot {
          width: 50%;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .status-card {
          padding: 16px 18px 26px;
          margin: 0 4px;
          border-radius: 16px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          position: relative;
          overflow: hidden;
          background-size: cover;
          background-position: center;
          min-height: 200px;
          box-shadow: 0 4px 14px var(--color-shadow);
        }
        .status-card.card-image::before {
          content: '';
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--color-bg-primary) 62%, transparent);
          z-index: 0;
        }
        .status-card.card-glass {
          background: color-mix(in srgb, var(--color-bg-secondary) 35%, transparent) !important;
          backdrop-filter: blur(24px) saturate(1.3);
          -webkit-backdrop-filter: blur(24px) saturate(1.3);
          border-color: color-mix(in srgb, var(--color-border) 55%, transparent);
        }
        .status-card > * { position: relative; z-index: 1; }
        .card-empty {
          padding: 30px 10px;
          text-align: center;
          font-size: 12px;
          letter-spacing: 3px;
          color: var(--color-text-tertiary);
        }
        .card-bg-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 3;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--color-bg-primary) 45%, transparent);
          color: var(--color-text-secondary);
          border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
          transition: background 0.2s, color 0.2s, transform 0.15s;
        }
        .card-bg-btn:active {
          transform: scale(0.9);
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 10px;
        }
        .card-avatar-lg .avatar {
          width: 58px;
          height: 58px;
          font-size: 20px;
          border-radius: 12px;
          box-shadow: 0 2px 6px var(--color-shadow);
        }
        .card-header-info { flex: 1; min-width: 0; }
        .card-name {
          font-size: 16px;
          letter-spacing: 2px;
          color: var(--color-text-primary);
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        input.ghost-input.card-name {
          font-size: 16px;
          letter-spacing: 2px;
          margin-bottom: 4px;
          padding: 2px 6px;
        }
        .card-role {
          font-family: ui-monospace, 'SF Mono', Consolas, monospace;
          font-size: 10px;
          letter-spacing: 3px;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
        }
        .card-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--color-border), transparent);
          margin: 6px 0 10px;
        }
        .card-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
          min-height: 28px;
        }
        .card-row-label {
          font-size: 11px;
          letter-spacing: 3px;
          color: var(--color-text-tertiary);
          min-width: 34px;
          flex-shrink: 0;
        }
        .card-row-val {
          font-size: 13px;
          color: var(--color-text-primary);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        input.ghost-input.card-row-val {
          font-size: 13px;
        }
        .card-serial {
          position: absolute;
          bottom: 8px;
          right: 14px;
          font-family: ui-monospace, 'SF Mono', Consolas, monospace;
          font-size: 10px;
          letter-spacing: 2px;
          color: var(--color-text-tertiary);
          opacity: 0.55;
          z-index: 2;
        }

        /* ghost-input 通用 */
        .ghost-input {
          background: transparent;
          border: 1px solid transparent;
          outline: none;
          color: inherit;
          font: inherit;
          padding: 2px 6px;
          border-radius: 6px;
          width: 100%;
          transition: background 0.15s, border-color 0.15s;
          box-sizing: border-box;
        }
        .ghost-input:hover {
          background: color-mix(in srgb, var(--color-text-primary) 5%, transparent);
        }
        .ghost-input:focus {
          background: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
          border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
        }
        .ghost-input::placeholder {
          color: var(--color-text-tertiary);
          opacity: 0.6;
        }

        .status-dots {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin: 12px 0 4px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 3px;
          background: var(--color-text-tertiary);
          opacity: 0.35;
          padding: 0;
          transition: opacity 0.25s, background 0.25s, width 0.25s;
        }
        .status-dot.active {
          background: var(--color-accent);
          opacity: 1;
          width: 18px;
        }
        /* ---------- 消息滚动区 ---------- */
        .msg-scroll {
          position: relative;
          z-index: 1;
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px 14px 108px;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        .msg-time-sep {
          text-align: center;
          font-size: 10px;
          color: var(--color-text-tertiary);
          letter-spacing: 2px;
          padding: 14px 0 6px;
        }
        .msg-row {
          display: flex;
          gap: 8px;
          margin-bottom: 6px;
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
        .msg-body {
          white-space: pre-wrap;
          word-break: break-word;
        }
        .msg-meta {
          font-size: 10px;
          color: var(--color-text-tertiary);
          margin-top: 3px;
          padding: 0 4px;
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

        .quote-card {
          padding: 6px 10px;
          margin-bottom: 6px;
          border-left: 2px solid color-mix(in srgb, currentColor 45%, transparent);
          background: color-mix(in srgb, currentColor 7%, transparent);
          border-radius: 3px 8px 8px 3px;
          font-size: 12px;
          line-height: 1.4;
          cursor: pointer;
          transition: background 0.15s;
          max-width: 100%;
          overflow: hidden;
        }
        .quote-card:active { background: color-mix(in srgb, currentColor 14%, transparent); }
        .quote-card.missing { opacity: 0.55; cursor: default; font-style: italic; }
        .quote-card-author {
          font-size: 10.5px;
          opacity: 0.75;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quote-card-content {
          opacity: 0.9;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .choice-prompt {
          margin-bottom: 8px;
        }
        .choice-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .choice-option {
          min-height: 40px;
          padding: 10px 12px;
          text-align: left;
          border-radius: 14px;
          border: 1px solid var(--color-border);
          background: color-mix(in srgb, var(--color-bg-primary) 35%, transparent);
          color: var(--color-text-primary);
          font-size: 13px;
          line-height: 1.4;
          transition: transform 0.15s, background 0.2s, border-color 0.2s;
        }
        .choice-option:active {
          transform: scale(0.985);
          background: var(--color-bg-tertiary);
          border-color: var(--color-accent);
        }

        .quote-bar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 6px);
          display: flex;
          align-items: stretch;
          gap: 10px;
          padding: 10px 12px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 18px;
          box-shadow: 0 4px 12px var(--color-shadow);
          animation: quoteBarIn 0.28s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes quoteBarIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .quote-bar-line {
          width: 3px;
          border-radius: 2px;
          background: var(--color-accent);
          flex-shrink: 0;
        }
        .quote-bar-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
          justify-content: center;
        }
        .quote-bar-author {
          font-size: 11px;
          color: var(--color-accent);
          letter-spacing: 1px;
        }
        .quote-bar-content {
          font-size: 12px;
          color: var(--color-text-secondary);
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .quote-bar-close {
          width: 28px;
          height: 28px;
          align-self: center;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-tertiary);
          flex-shrink: 0;
          transition: color 0.15s, background 0.15s;
        }
        .quote-bar-close:active {
          color: var(--color-text-primary);
          background: var(--color-bg-tertiary);
        }

        @keyframes msgHighlightPulse {
          0% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 3px transparent; }
        }
        .msg-row.msg-highlight .msg-bubble {
          animation: msgHighlightPulse 1.6s ease-out;
          border-radius: 18px;
        }

        .typing-bubble {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 12px 14px;
        }
        .typing-bubble .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
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

        .msg-shuffling { align-items: center; }
        .shuffle-stage {
          position: relative;
          width: 90px;
          height: 44px;
          margin-left: 4px;
        }
        .shuffle-stage .frag {
          position: absolute;
          left: 30px;
          top: 12px;
          width: 24px;
          height: 32px;
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
          box-shadow: 0 4px 12px var(--color-shadow), 0 12px 40px var(--color-shadow);
          backdrop-filter: blur(20px) saturate(1.2);
          -webkit-backdrop-filter: blur(20px) saturate(1.2);
          z-index: 40;
          animation: dockRise 0.5s cubic-bezier(0.22, 1, 0.36, 1);
          transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.3s ease,
                      border-color 0.3s ease;
        }
        .chat-input-dock:focus-within {
          border-color: var(--color-accent);
          box-shadow: 0 6px 16px var(--color-shadow),
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
        .dock-input {
          flex: 1;
          min-height: 40px;
          max-height: 120px;
          padding: 10px 12px;
          border: none;
          outline: none;
          background: transparent;
          color: var(--color-text-primary);
          font-size: 14px;
          line-height: 1.4;
          font-family: inherit;
          resize: none;
          overflow-y: auto;
        }
        .dock-input::placeholder { color: var(--color-text-tertiary); }
        .dock-btn {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          background: transparent;
          transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                      background 0.25s ease,
                      color 0.25s ease,
                      opacity 0.25s ease;
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
          font-size: 12px;
          letter-spacing: 2px;
          padding: 3px 10px;
          border-radius: 999px;
          background: var(--color-bg-tertiary);
          color: var(--color-text-tertiary);
        }
        .ka-toggle.on { background: var(--color-accent); color: var(--color-bg-primary); }

        /* 气泡样式预设 */
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
        .chat-page[data-bubble-preset="preset-5"] .msg-bubble-wrap { max-width: 65%; }
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
.dice-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 22px 0 8px;
}

.d12-dice-wrapper {
  position: relative;
  width: 132px;
  height: 132px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-accent);
}

.d12-dice-wrapper.rolling {
  animation: d12Roll 1.1s linear infinite;
}

.d12-ring,
.d12-ring-inner,
.d12-geometric-shape {
  position: absolute;
  inset: 0;
  border-radius: 28%;
  border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.d12-ring {
  transform: rotate(0deg);
}

.d12-ring-inner {
  inset: 16px;
  transform: rotate(45deg);
  opacity: 0.7;
}

.d12-geometric-shape {
  inset: 30px;
  border-radius: 18%;
  transform: rotate(22deg);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.d12-center-word {
  position: relative;
  z-index: 2;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-shadow: 0 0 14px color-mix(in srgb, var(--color-accent) 45%, transparent);
}

@keyframes d12Roll {
  0% {
    transform: rotate(0deg) scale(1);
    filter: blur(0);
  }
  35% {
    transform: rotate(135deg) scale(1.08);
    filter: blur(0.4px);
  }
  70% {
    transform: rotate(260deg) scale(0.96);
    filter: blur(0.2px);
  }
  100% {
    transform: rotate(360deg) scale(1);
    filter: blur(0);
  }
}

.dice-result-card {
  width: 100%;
  padding: 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
  box-shadow: 0 8px 30px var(--color-shadow);
}

.dice-result-word {
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: 10px;
  letter-spacing: 0.08em;
}

.dice-result-desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.dice-result-quote {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.center-typing-card {
  position: fixed;
  left: 50%;
  top: 48%;
  transform: translate(-50%, -50%);
  z-index: 55;
  min-width: 180px;
  max-width: 260px;
  padding: 18px 18px 16px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-accent) 24%, var(--color-border));
  box-shadow: 0 12px 38px var(--color-shadow);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: centerTypingIn 0.26s ease-out;
  pointer-events: none;
}

@keyframes centerTypingIn {
  from {
    opacity: 0;
    transform: translate(-50%, -46%) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.center-typing-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
}

.center-typing-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.center-typing-loading {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-height: 14px;
  color: var(--color-text-secondary);
}

.center-typing-loading .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: centerTypingDot 1s ease-in-out infinite;
}

.center-typing-loading .dot:nth-child(2) {
  animation-delay: 0.15s;
}

.center-typing-loading .dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes centerTypingDot {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.center-typing-hint {
  text-align: center;
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-text-secondary);
}

        /* call layer */
        .call-layer {
          position: absolute;
          inset: 0;
          z-index: 60;
          pointer-events: none;
        }
        .call-heart {
          position: fixed;
          top: calc(env(safe-area-inset-top) + 62px);
          right: 18px;
          width: 58px;
          height: 58px;
          border-radius: 50%;
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          z-index: 61;
          background: color-mix(in srgb, var(--color-bg-secondary) 65%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
          box-shadow: 0 8px 20px var(--color-shadow);
          overflow: hidden;
        }
        .call-heart-ring {
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--color-accent) 65%, transparent);
          animation: heartBeat 1.2s ease-in-out infinite;
        }
        .call-heart-core {
          position: relative;
          z-index: 1;
          color: var(--color-accent);
          animation: heartCore 1.2s ease-in-out infinite;
        }
        .call-heart.ringing .call-heart-ring,
        .call-heart.connected .call-heart-ring {
          animation-duration: 0.95s;
        }
        .call-heart.connected .call-heart-core {
          color: var(--color-text-primary);
        }
        @keyframes heartBeat {
          0%, 100% { transform: scale(0.96); opacity: 0.55; }
          35% { transform: scale(1.08); opacity: 1; }
          70% { transform: scale(1.01); opacity: 0.8; }
        }
        @keyframes heartCore {
          0%, 100% { transform: scale(0.94); }
          35% { transform: scale(1.08); }
          70% { transform: scale(1.0); }
        }
        .call-full {
          position: fixed;
          inset: 0;
          z-index: 70;
          pointer-events: auto;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          background: var(--color-bg-primary);
        }
        .call-full-bg {
          position: absolute;
          inset: -20px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          filter: blur(24px) saturate(1.1);
          transform: scale(1.12);
        }
        .call-full-bg.has-wallpaper::after {
          content: '';
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--color-bg-primary) 55%, transparent);
        }
        .call-full-shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--color-bg-primary) 35%, transparent), color-mix(in srgb, var(--color-bg-primary) 72%, transparent));
        }
        .call-full-inner {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: calc(env(safe-area-inset-top) + 20px) 20px calc(env(safe-area-inset-bottom) + 24px);
          text-align: center;
        }
        .call-min-btn {
          position: absolute;
          top: calc(env(safe-area-inset-top) + 14px);
          right: 14px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-primary);
          background: color-mix(in srgb, var(--color-bg-secondary) 45%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
        }
        .call-orbit {
          position: relative;
          width: 168px;
          height: 168px;
          margin-bottom: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .call-orbit::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--color-accent) 22%, transparent);
          animation: orbitPulse 2.8s ease-in-out infinite;
        }
        .call-orbit::after {
          content: '';
          position: absolute;
          inset: 18px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--color-accent) 10%, transparent);
          animation: orbitPulse 2.8s ease-in-out infinite reverse;
        }
        @keyframes orbitPulse {
          0%, 100% { transform: scale(0.95); opacity: 0.45; }
          50% { transform: scale(1.02); opacity: 1; }
        }
        .call-avatar-lg .avatar {
          width: 104px;
          height: 104px;
          font-size: 34px;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-bg-primary) 55%, transparent),
                      0 14px 40px var(--color-shadow);
        }
        .call-name {
          font-size: 22px;
          letter-spacing: 4px;
          color: var(--color-text-primary);
          margin-bottom: 10px;
        }
        .call-status {
          font-size: 12px;
          letter-spacing: 4px;
          color: var(--color-text-secondary);
          margin-bottom: 12px;
        }
        .call-duration {
          font-size: 30px;
          letter-spacing: 3px;
          color: var(--color-text-primary);
          margin-bottom: 28px;
          font-family: ui-monospace, 'SF Mono', Consolas, monospace;
        }
        .call-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .call-action {
          min-width: 128px;
          min-height: 46px;
          padding: 0 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          letter-spacing: 2px;
          border: 1px solid var(--color-border);
          background: color-mix(in srgb, var(--color-bg-secondary) 45%, transparent);
          color: var(--color-text-primary);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .call-accept {
          border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
          color: var(--color-accent);
        }
        .call-hang {
          border-color: color-mix(in srgb, #dc2626 55%, transparent);
          color: #dc2626;
        }

        /* sound sheet 元素 */
        .sound-row { display: flex; align-items: center; gap: 12px; padding: 10px 4px; }
        .sound-label { font-size: 13px; color: var(--color-text-primary); letter-spacing: 1px; min-width: 40px; }
        .sound-val { font-size: 12px; color: var(--color-text-tertiary); min-width: 30px; text-align: right; }
        .sound-section-title { font-size: 11px; letter-spacing: 3px; color: var(--color-text-secondary); margin: 18px 4px 8px; }
        .mini-switch { position: relative; width: 42px; height: 22px; display: inline-block; margin-left: auto; }
        .mini-switch input { opacity: 0; width: 0; height: 0; }
        .mini-switch span { position: absolute; inset: 0; background: var(--color-bg-tertiary); border-radius: 22px; transition: background 0.2s; cursor: pointer; }
        .mini-switch span::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          left: 3px;
          top: 3px;
          background: var(--color-text-secondary);
          border-radius: 50%;
          transition: transform 0.2s, background 0.2s;
        }
        .mini-switch input:checked + span { background: var(--color-accent); }
        .mini-switch input:checked + span::before { transform: translateX(20px); background: var(--color-bg-primary); }
        .btn-mini { min-height: 30px; padding: 4px 12px; font-size: 12px; letter-spacing: 1px; }
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: var(--color-bg-tertiary);
          border-radius: 2px;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-accent);
          cursor: pointer;
          border: none;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-accent);
          cursor: pointer;
          border: none;
        }
          /* ============ 屏幕中央悬浮思考/打字卡片 ============ */
.center-typing-card {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999;
  width: 220px;
  padding: 24px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: centerFadeIn 0.3s ease-out;
}
.center-typing-avatar {
  margin-bottom: 12px;
}
.center-typing-avatar .avatar {
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.1);
}
.center-typing-name {
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 2px;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}
.center-typing-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  letter-spacing: 1px;
  text-align: center;
  margin-top: 10px;
  max-width: 90%;
  line-height: 1.4;
}
.center-typing-loading {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  height: 12px;
}
.center-typing-loading .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: centerTypingBounce 1.4s infinite ease-in-out both;
}
.center-typing-loading .dot:nth-child(1) { animation-delay: -0.32s; }
.center-typing-loading .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes centerFadeIn {
  from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes centerTypingBounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}

/* 草稿箱按钮 */
.dock-btn.draft {
  color: var(--color-text-secondary);
}
.dock-btn.draft:active {
  color: var(--color-accent);
}

/* 草稿箱列表 */
.draft-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: 20px;
  font-size: 12px;
}
.draft-items-list {
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.draft-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-secondary);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 13px;
  gap: 8px;
}
.draft-item-text {
  word-break: break-all;
  flex: 1;
}
.draft-item-delete {
  color: #dc2626;
  border: none;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
}
  
.choice-card {
  min-width: 210px;
  max-width: 320px;
  padding: 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, white);
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px var(--color-shadow);
}

.choice-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.4;
  margin-bottom: 10px;
  text-align: center;
  word-break: break-word;
}

.choice-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.choice-card-option {
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.2;
  font-family: inherit;
}

.choice-card-option.selected {
  background: color-mix(in srgb, var(--color-accent) 22%, var(--color-bg-tertiary));
  border-color: var(--color-accent);
}

.choice-card-option:disabled {
  opacity: 1;
  cursor: default;
}

.choice-card-grid .choice-card-option:only-child {
  grid-column: 1 / -1;
}



      </style>
      <style id="chat-user-css"></style>
    </div>
  `;

  try {
    const data = await loadAll(state.convId);
    if (state.destroyed) return;
    Object.assign(state, data);
    if (state.conv && state.conv.pendingQuoteId) {
      state.pendingQuoteId = state.conv.pendingQuoteId;
    }
  } catch (e) {
    toast(e.message || '对话加载失败');
    goBack('/cards');
    return;
  }

  sound.loadConfig().catch(() => {});

 if (typeof renderPill === 'function') renderPill();
if (typeof applyChatStyles === 'function') applyChatStyles();

if (typeof renderCharCard === 'function') renderCharCard();
if (typeof renderUserCard === 'function') renderUserCard();
if (typeof renderMusicCard === 'function') renderMusicCard();


  updateStatusSwipe();
  bindPanelEvents();

  renderMessages();
renderQuoteBar();

root.querySelector('[data-act=back]').addEventListener('click', () => { haptic(6); goBack('/cards'); });
root.querySelector('[data-act=call-phone]').addEventListener('click', async () => {
  haptic(8);

  if (CallManager && CallManager.state && CallManager.state !== 'idle') {
    syncCallStateFromManager();
    openCallFull();
    return;
  }

  const ok = await startVirtualCall(true);
  if (ok) {
    openCallFull();
  }
});

root.querySelector('[data-act=menu]').addEventListener('click', openChatMenu);
root.querySelector('[data-act=toggle-panel]').addEventListener('click', () => togglePanel());


  root.querySelector('[data-act=trigger]').addEventListener('click', () => {
    sound.unlock();
    haptic(10);
    manualTrigger();
  });

  const sendBtn = document.getElementById('send-btn');
  sendBtn.addEventListener('click', () => {
    sound.unlock();
    haptic(6);
    sendUserMessage();
  });

  const input = document.getElementById('chat-input');
  input.addEventListener('input', () => { autoGrow(input); updateSendBtn(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sound.unlock();
      sendUserMessage();
    }
  });

 const dock = root.querySelector('.chat-input-dock');
dock.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-act=clear-quote]');
  if (closeBtn) {
    haptic(6);
    clearPendingQuote();
    return;
  }

  const draftBtn = e.target.closest('[data-act=open-draft]');
  if (draftBtn) {
    haptic(6);
    openDraftSheet();
    return;
  }

  const choiceBtn = e.target.closest('[data-act=open-choice-creator]');
  if (choiceBtn) {
    haptic(6);
    openChoiceCreatorSheet();
    return;
  }

  const diceBtn = e.target.closest('[data-act=open-star-dice]');
  if (diceBtn) {
    haptic(8);
    openSynchronicityDiceSheet();
    return;
  }
});




  const scrollBox = document.getElementById('msg-scroll');
  scrollBox.addEventListener('click', async (e) => {
    const choiceBtn = e.target.closest('[data-choice-msg]');
    if (choiceBtn) {
      const msgId = Number(choiceBtn.getAttribute('data-choice-msg'));
      const idx = Number(choiceBtn.getAttribute('data-choice-idx'));
      await answerCharacterChoice(msgId, idx);
      return;
    }
    const jump = e.target.closest('[data-quote-jump]');
    if (!jump) return;
    if (jump.classList.contains('missing')) return;
    const id = Number(jump.getAttribute('data-quote-jump'));
    if (id) scrollToMessage(id);
  });

  bindViewportFollow();

  state.onVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkPendingReplyOnVisible();
    }
  };
  document.addEventListener('visibilitychange', state.onVisibility);
    state.onCallHistoryUpdated = async (e) => {
    if (e.detail.conversationId === state.convId) {
      state.messages = await db.messages.where('conversationId').equals(state.convId).sortBy('timestamp');
      renderMessages();
    }
  };
  window.addEventListener('call-history-updated', state.onCallHistoryUpdated);


  scheduleTimers();
}

export function destroy() {
  state.destroyed = true;
  cancelTimers();
  if (state.onViewport) state.onViewport();
  if (state.onVisibility) {
    document.removeEventListener('visibilitychange', state.onVisibility);
  }
  if (state.onCallHistoryUpdated) {
    window.removeEventListener('call-history-updated', state.onCallHistoryUpdated);
  }
  clearTimeout(longPressTimer);
}
