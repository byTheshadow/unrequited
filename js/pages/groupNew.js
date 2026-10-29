import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import { avatarHTML, groupAvatarHTML, escapeHtml, escapeAttr, haptic, toast } from '../utils.js';

let characters = [];
let selected = new Set();
let nameEdited = false;

function selectedMembers() {
  return characters.filter((c) => selected.has(c.id));
}

function defaultName(members) {
  return members.map((m) => m.name).join('、').slice(0, 40);
}

function syncPreview(root) {
  const members = selectedMembers();
  const av = root.querySelector('#gn-avatar');
  const nameEl = root.querySelector('#gn-name');
  const countEl = root.querySelector('#gn-count');
  const okBtn = root.querySelector('#gn-create');

  if (av) av.innerHTML = groupAvatarHTML(members, 76);
  if (countEl) countEl.textContent = `${members.length} / 6`;
  if (okBtn) {
    okBtn.disabled = members.length < 2;
    okBtn.style.opacity = members.length < 2 ? '0.35' : '1';
  }
  if (nameEl && !nameEdited) nameEl.value = defaultName(members);

  root.querySelectorAll('.gn-row').forEach((row) => {
    const id = Number(row.getAttribute('data-id'));
    const on = selected.has(id);
    row.classList.toggle('on', on);
    const check = row.querySelector('.gn-check');
    if (check) check.classList.toggle('on', on);
  });
}

function bind(root) {
  root.querySelector('[data-act=back]').addEventListener('click', () => { haptic(6); goBack('/cards'); });

  root.querySelector('#gn-name').addEventListener('input', () => { nameEdited = true; });

  root.querySelectorAll('.gn-row').forEach((row) => {
    row.addEventListener('click', () => {
      const id = Number(row.getAttribute('data-id'));
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        if (selected.size >= 6) { toast('群聊最多 6 个角色'); return; }
        selected.add(id);
      }
      haptic(6);
      syncPreview(root);
    });
  });

  root.querySelector('#gn-create').addEventListener('click', async () => {
    if (selected.size < 2) { toast('至少选择 2 个角色'); return; }
    const members = selectedMembers();
    const nameInput = root.querySelector('#gn-name');
    const groupName = (nameInput.value.trim() || defaultName(members)).slice(0, 40);
    const now = Date.now();

    const convId = await db.conversations.add({
      type: 'group',
      memberIds: members.map((m) => m.id),
      groupName,
      groupAvatar: '',
      title: '',
      wallpaper: '',
      musicBar: null,
      lastMessage: '',
      lastMessageTime: now,
      pinned: false,
      createdAt: now,
    });

    const content = `你邀请 ${members.map((m) => m.name).join('、')} 加入了群聊`;
    await db.messages.add({
      conversationId: convId,
      sender: 'system',
      content,
      type: 'system',
      status: 'sent',
      quotedMessageId: null,
      timestamp: now,
      isRead: true,
    });
    await db.conversations.update(convId, { lastMessage: content, lastMessageTime: now });

    haptic(12);
    navigate(`/chat?id=${convId}`);
  });
}

export async function render(root) {
  characters = await db.characters.orderBy('createdAt').toArray();
  selected = new Set();
  nameEdited = false;

  if (!characters.length) {
    root.innerHTML = `
      <div class="page" style="padding-top: calc(10px + env(safe-area-inset-top));">
        <div style="display:grid;grid-template-columns:40px 1fr 40px;align-items:center;padding:6px 12px 8px;">
          <button data-act="back" aria-label="返回" style="width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--color-text-secondary);border:1px solid color-mix(in srgb, var(--color-border) 55%, transparent);background:color-mix(in srgb, var(--color-bg-secondary) 55%, transparent);">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style="text-align:center;font-size:13px;letter-spacing:3px;">新建群聊</div>
          <div></div>
        </div>
        <div style="padding:80px 24px;text-align:center;font-size:14px;letter-spacing:2px;color:var(--color-text-secondary);line-height:2;">
          还没有角色<br><span style="font-size:12px;color:var(--color-text-tertiary);">先去创建一个角色，再来建群</span>
        </div>
      </div>`;
    root.querySelector('[data-act=back]').addEventListener('click', () => goBack('/cards'));
    return;
  }

  root.innerHTML = `
    <div class="page gn-page">
      <div class="gn-head">
        <button class="gn-icon-btn" data-act="back" aria-label="返回">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="gn-title">新建群聊</div>
        <button class="gn-ok" id="gn-create">创建</button>
      </div>

      <div class="gn-preview">
        <div id="gn-avatar"></div>
        <input class="gn-name" id="gn-name" maxlength="40" placeholder="群名">
        <div class="gn-hint">群名默认为成员名字，可修改</div>
      </div>

      <div class="gn-sec">
        <span>选择成员</span>
        <span class="gn-count" id="gn-count">0 / 6</span>
      </div>

      <div class="gn-list">
        ${characters.map((c) => `
          <div class="gn-row" data-id="${c.id}">
            ${avatarHTML(c.avatar, c.name, 42)}
            <div class="gn-row-body">
              <div class="gn-row-name">${escapeHtml(c.name || '未命名')}</div>
              <div class="gn-row-sub">${escapeHtml(c.status ? `「${c.status}」` : (c.signature || ''))}</div>
            </div>
            <span class="gn-check">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          </div>
        `).join('')}
      </div>

      <div class="gn-foot">至少选择 2 个角色，群头像会自动拼合</div>

      <style>
        .gn-page {
          min-height: 100vh;
          min-height: 100dvh;
          padding-top: calc(10px + env(safe-area-inset-top));
          padding-bottom: 40px;
          display: flex;
          flex-direction: column;
        }
        .gn-head {
          display: grid;
          grid-template-columns: 40px 1fr 40px;
          align-items: center;
          padding: 6px 12px 8px;
        }
        .gn-icon-btn {
          width: 40px; height: 40px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: color-mix(in srgb, var(--color-bg-secondary) 55%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
          backdrop-filter: blur(14px) saturate(1.15);
          -webkit-backdrop-filter: blur(14px) saturate(1.15);
        }
        .gn-title {
          text-align: center;
          font-size: 13px;
          letter-spacing: 3px;
          color: var(--color-text-primary);
        }
        .gn-ok {
          text-align: right;
          font-size: 13px;
          letter-spacing: 2px;
          color: var(--color-text-primary);
          transition: opacity .2s;
        }
        .gn-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 24px 12px;
        }
        .gn-name {
          margin-top: 14px;
          width: 100%;
          text-align: center;
          font-size: 18px;
          letter-spacing: 3px;
          color: var(--color-text-primary);
          background: transparent;
          border: none;
          outline: none;
          padding: 2px 8px;
        }
        .gn-name::placeholder { color: var(--color-text-tertiary); }
        .gn-hint {
          margin-top: 8px;
          font-size: 11px;
          letter-spacing: 1px;
          color: var(--color-text-tertiary);
        }
        .gn-sec {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 18px 8px;
          font-size: 12px;
          letter-spacing: 2px;
          color: var(--color-text-secondary);
        }
        .gn-count { font-size: 11px; color: var(--color-text-tertiary); letter-spacing: 1px; }
        .gn-list { flex: 1; }
        .gn-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 18px;
          cursor: pointer;
        }
        .gn-row-body { flex: 1; min-width: 0; }
        .gn-row-name {
          font-size: 15px;
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gn-row-sub {
          font-size: 11px;
          color: var(--color-text-tertiary);
          letter-spacing: 1px;
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gn-check {
          width: 24px; height: 24px;
          border-radius: 50%;
          border: 1px solid color-mix(in srgb, var(--color-text-tertiary) 45%, transparent);
          color: var(--color-bg-primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background .2s, border-color .2s;
        }
        .gn-check svg { opacity: 0; transition: opacity .2s; }
        .gn-check.on {
          background: var(--color-accent);
          border-color: var(--color-accent);
        }
        .gn-check.on svg { opacity: 1; }
        .gn-foot {
          padding: 18px;
          text-align: center;
          font-size: 11px;
          letter-spacing: 1px;
          color: var(--color-text-tertiary);
        }
        .gn-empty {
          padding: 80px 24px;
          text-align: center;
          font-size: 14px;
          letter-spacing: 2px;
          color: var(--color-text-secondary);
          line-height: 2;
        }
        .gn-empty span { font-size: 12px; color: var(--color-text-tertiary); }
      </style>
    </div>
  `;

  bind(root);
  syncPreview(root);
}

export function destroy() {}
