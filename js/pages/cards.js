import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, formatTime,
  openSheet, confirmSheet, haptic, toast,
} from '../utils.js';

let listUnsub = null;

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

async function loadData() {
  const conversations = await db.conversations.orderBy('lastMessageTime').reverse().toArray();
  const charIds = [...new Set(conversations.map((c) => c.characterId))];
  const rawChars = charIds.length ? await db.characters.where('id').anyOf(charIds).toArray() : [];

  const chars = [];
  for (let i = 0; i < rawChars.length; i += 1) {
    const ch = await checkAndRotateCharacterStatus(rawChars[i]);
    chars.push(ch);
  }

  const charMap = new Map(chars.map((c) => [c.id, c]));

  // 置顶排序
  conversations.sort((a, b) => {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
  });

  return { conversations, charMap };
}

function renderList(conversations, charMap) {
  if (!conversations.length) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 60 60" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
            <rect x="10" y="14" width="24" height="34" rx="3" transform="rotate(-9 22 31)"/>
            <rect x="22" y="12" width="24" height="34" rx="3" transform="rotate(7 34 29)"/>
          </svg>
        </div>
        <div class="empty-state-title">还没有对话</div>
        <div class="empty-state-sub">点击右下角加号<br>选择或创建一个角色开始</div>
      </div>
    `;
  }

  return `
    <ul class="conv-list">
      ${conversations.map((c) => {
        const ch = charMap.get(c.characterId);
        const name = ch ? ch.name : '（角色已删除）';
        const time = c.lastMessageTime ? formatTime(c.lastMessageTime) : '';
        const preview = c.lastMessage || '开始一段对话';
        const subText = ch
          ? (ch.status
            ? `「${ch.status}」`
            : (ch.signature ? ch.signature.slice(0, 20) : preview))
          : preview;

        return `
          <li class="conv-row list-row" data-id="${c.id}">
            ${avatarHTML(ch && ch.avatar, name, 46)}
            <div class="list-row-body">
              <div class="list-row-title">${escapeHtml(name)}${c.pinned ? '<span class="pin-dot"></span>' : ''}</div>
              <div class="list-row-sub">${escapeHtml(subText)}</div>
            </div>
            <div class="list-row-aside">
              <span>${time}</span>
            </div>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

async function openNewConversationSheet() {
  const characters = await db.characters.orderBy('createdAt').toArray();

  const body = characters.length
    ? `<div class="sheet-list" id="new-char-list">
        ${characters.map((c) => `
          <div class="sheet-list-item" data-cid="${c.id}">
            ${avatarHTML(c.avatar, c.name, 42)}
            <div class="sheet-list-body">
              <div class="sheet-list-title">${escapeHtml(c.name)}</div>
              <div class="sheet-list-sub">${(c.linkedDeckIds || []).length} 个字卡库</div>
            </div>
          </div>
        `).join('')}
      </div>`
    : `<div style="text-align:center; padding: 16px 0; color: var(--color-text-tertiary); font-size: 12px; line-height: 2;">
        暂无角色<br>先创建一个角色再开始对话
      </div>`;

  const { close } = openSheet({
    title: '选择角色',
    body,
    actions: `<button class="btn btn-secondary btn-block" data-act="new-char">创建新角色</button>`,
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.querySelector('[data-act=new-char]').addEventListener('click', () => {
    close();
    navigate('/characters?new=1');
  });
  root.querySelectorAll('.sheet-list-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const cid = Number(el.getAttribute('data-cid'));
      // 已存在的对话 → 直接进入；否则新建
      const existing = await db.conversations.where('characterId').equals(cid).first();
      let convoId;
      if (existing) {
        convoId = existing.id;
      } else {
        convoId = await db.conversations.add({
          characterId: cid, title: '', wallpaper: '',
          musicBar: null, lastMessage: '',
          lastMessageTime: Date.now(), pinned: false,
          createdAt: Date.now(),
        });
      }
      close();
      navigate(`/chat?id=${convoId}`);
    });
  });
}

async function openConvActions(convId) {
  const conv = await db.conversations.get(convId);
  if (!conv) return;
  const { close } = openSheet({
    title: '对话操作',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-act="pin">
        <div class="sheet-list-body">
          <div class="sheet-list-title">${conv.pinned ? '取消置顶' : '置顶对话'}</div>
        </div>
      </div>
      <div class="sheet-list-item" data-act="clear">
        <div class="sheet-list-body">
          <div class="sheet-list-title">清空消息</div>
          <div class="sheet-list-sub">保留对话，仅清除聊天记录</div>
        </div>
      </div>
      <div class="sheet-list-item" data-act="delete">
        <div class="sheet-list-body">
          <div class="sheet-list-title" style="color:#dc2626;">删除对话</div>
          <div class="sheet-list-sub">对话与消息全部移除</div>
        </div>
      </div>
    </div>`,
  });

  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.sheet-list-item');
    if (!item) return;
    const act = item.getAttribute('data-act');
    if (act === 'pin') {
      await db.conversations.update(convId, { pinned: !conv.pinned });
      close(); refresh();
    } else if (act === 'clear') {
      close();
      const ok = await confirmSheet('确定清空此对话的所有消息？', { danger: true, okText: '清空' });
      if (ok) {
        await db.messages.where('conversationId').equals(convId).delete();
        await db.conversations.update(convId, { lastMessage: '', lastMessageTime: Date.now() });
        toast('已清空'); refresh();
      }
    } else if (act === 'delete') {
      close();
      const ok = await confirmSheet('确定删除此对话？消息将一并删除', { danger: true, okText: '删除' });
      if (ok) {
        await db.messages.where('conversationId').equals(convId).delete();
        await db.conversations.delete(convId);
        toast('已删除'); refresh();
      }
    }
  });
}

function openTopMenu() {
  const { close } = openSheet({
    title: '字卡管理',
    body: `<div class="sheet-list">
      <div class="sheet-list-item" data-nav="/characters">
        <div class="sheet-list-icon">${ICON.people}</div>
        <div class="sheet-list-body">
          <div class="sheet-list-title">角色管理</div>
          <div class="sheet-list-sub">创建、编辑、删除角色</div>
        </div>
      </div>
      <div class="sheet-list-item" data-nav="/decks">
        <div class="sheet-list-icon">${ICON.deck}</div>
        <div class="sheet-list-body">
          <div class="sheet-list-title">字卡库</div>
          <div class="sheet-list-sub">管理字卡库、导入导出</div>
        </div>
      </div>
    </div>`,
  });
  const root = document.querySelector('.sheet-backdrop:last-of-type');
  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      const p = el.getAttribute('data-nav');
      close();
      navigate(p);
    });
  });
}

async function renderMissBox() {
  const container = document.getElementById('miss-box-wrap');
  if (!container) return;

  const unreadMisses = await db.missRecords
    .where('isRead')
    .equals(0)
    .toArray();

  if (!unreadMisses.length) {
    container.innerHTML = `
      <div class="miss-box-card calm">
        <span class="miss-box-star">✦</span>
        <span class="miss-box-text">星轨平稳，思绪在深空中漂流</span>
      </div>
    `;
    container.onclick = null;
    return;
  }

  container.innerHTML = `
    <div class="miss-box-card active glow">
      <span class="miss-box-star pulsing">✦</span>
      <span class="miss-box-text">有 ${unreadMisses.length} 缕思绪落入了想念箱，点击开启</span>
    </div>
  `;

  container.onclick = () => {
    haptic(10);
    openMissDetailsSheet(unreadMisses);
  };
}

async function openMissDetailsSheet(unreadMisses) {
  const characters = await db.characters.toArray();
  const charMap = new Map(characters.map((c) => [c.id, c]));

  const items = unreadMisses.map((miss) => {
    const char = charMap.get(miss.characterId) || { name: '未知存在' };
    const timeStr = formatTime(miss.timestamp);

    return `
      <div class="miss-letter-item">
        <div class="miss-letter-header">
          <span class="miss-letter-char">${escapeHtml(char.name)}</span>
          <span class="miss-letter-time">${escapeHtml(timeStr)}</span>
        </div>
        <div class="miss-letter-body">“ ${escapeHtml(miss.fragment)} ”</div>
      </div>
    `;
  }).join('');

  const { close } = openSheet({
    title: '想念箱的手记信笺',
    body: `<div class="miss-letters-container">${items}</div>`,
    actions: `<button class="btn btn-primary btn-block" data-act="read-all">默默收起</button>`,
    maxHeight: '75vh'
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');

  sheetRoot.querySelector('[data-act=read-all]').addEventListener('click', async () => {
    close();

    for (const miss of unreadMisses) {
      await db.missRecords.update(miss.id, {
        isRead: 1
      });
    }

    renderMissBox();
  });
}




async function refresh() {
  const container = document.getElementById('conv-list-wrap');
  if (!container) return;

  const { conversations, charMap } = await loadData();
  container.innerHTML = renderList(conversations, charMap);
  bindRowEvents();

  await renderMissBox();
}


let longPressTimer = null;
let onMissBoxUpdated = null;

function bindRowEvents() {
  document.querySelectorAll('.conv-row').forEach((row) => {
    const id = Number(row.getAttribute('data-id'));
    let moved = false;
    row.addEventListener('pointerdown', () => {
      moved = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => { if (!moved) { haptic(20); openConvActions(id); } }, 500);
    });
    row.addEventListener('pointermove', () => { moved = true; });
    row.addEventListener('pointerup', () => {
      clearTimeout(longPressTimer);
      if (!moved) navigate(`/chat?id=${id}`);
    });
    row.addEventListener('pointerleave', () => clearTimeout(longPressTimer));
    row.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
  });
}

export async function render(root) {
  root.innerHTML = `
    <div class="page cards-page">
      <div class="cards-floating-actions">
        <button class="cards-icon-btn" data-act="back" aria-label="返回">${ICON.back}</button>
        <button class="cards-icon-btn" data-act="menu" aria-label="菜单">${ICON.more}</button>
      </div>

      <div id="miss-box-wrap"></div>

      <div id="conv-list-wrap"></div>

      <button class="fab" data-act="new" aria-label="新建对话">${ICON.plus}</button>

      <style>
        .cards-page {
          min-height: 100vh;
          min-height: 100dvh;
          padding-top: calc(18px + env(safe-area-inset-top));
          padding-bottom: 100px;
        }

        .cards-floating-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 14px 10px;
          pointer-events: none;
        }

        .cards-icon-btn {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-secondary);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--color-border);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          transition: transform 0.15s, background 0.2s, color 0.2s;
          pointer-events: auto;
        }

        .cards-icon-btn:active {
          transform: scale(0.94);
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }

        .conv-list {
          list-style: none;
        }

        .pin-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-accent);
          margin-left: 8px;
          vertical-align: middle;
        }

        .sheet-list-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-secondary);
          color: var(--color-accent);
          flex-shrink: 0;
        }
      </style>
    </div>
  `;

  const { conversations, charMap } = await loadData();

  document.getElementById('conv-list-wrap').innerHTML = renderList(conversations, charMap);
  bindRowEvents();

  await renderMissBox();

  onMissBoxUpdated = () => {
    renderMissBox();
  };

  window.addEventListener('miss-box-updated', onMissBoxUpdated);

  root.querySelector('[data-act=back]').addEventListener('click', () => {
    haptic(6);
    goBack('/home');
  });

  root.querySelector('[data-act=menu]').addEventListener('click', () => {
    haptic(6);
    openTopMenu();
  });

  root.querySelector('[data-act=new]').addEventListener('click', () => {
    haptic(8);
    openNewConversationSheet();
  });
}


export function destroy() {
  clearTimeout(longPressTimer);

  if (listUnsub) {
    listUnsub();
    listUnsub = null;
  }

  if (onMissBoxUpdated) {
    window.removeEventListener('miss-box-updated', onMissBoxUpdated);
    onMissBoxUpdated = null;
  }
}
