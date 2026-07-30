import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, avatarHTML, escapeHtml, escapeAttr,
  haptic, toast, openSheet, confirmSheet,
  fileToResizedDataURL,
} from '../utils.js';

let state = { editingId: null };

async function loadCharacters() {
  return db.characters.orderBy('createdAt').reverse().toArray();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function chanceToPercent(value, fallback = 0.5) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.round(Math.max(0, Math.min(1, safe)) * 100);
}

function percentToChance(value, fallbackPercent = 50) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallbackPercent;
  return Math.max(0, Math.min(100, safe)) / 100;
}

function renderList(list) {
  if (!list.length) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${ICON.people}</div>
        <div class="empty-state-title">还没有角色</div>
        <div class="empty-state-sub">点击右下角加号创建第一个角色</div>
      </div>
    `;
  }
  return `
    <ul class="char-list">
      ${list.map((c) => `
        <li class="list-row" data-id="${c.id}">
          ${avatarHTML(c.avatar, c.name, 46)}
          <div class="list-row-body">
            <div class="list-row-title">${escapeHtml(c.name)}</div>
            <div class="list-row-sub">${(c.linkedDeckIds || []).length} 个字卡库${c.signature ? '　·　' + escapeHtml(c.signature.slice(0, 20)) : ''}</div>
          </div>
          <div class="list-row-aside">
            <button class="row-icon-btn" data-act="delete" data-id="${c.id}" aria-label="删除">${ICON.trash}</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

async function refresh() {
  const wrap = document.getElementById('char-list-wrap');
  if (!wrap) return;
  const list = await loadCharacters();
  wrap.innerHTML = renderList(list);
  bindRowEvents();
}

function bindRowEvents() {
  document.querySelectorAll('.char-list .list-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      const id = Number(row.getAttribute('data-id'));
      openEditor(id);
    });
  });
  document.querySelectorAll('[data-act=delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const ok = await confirmSheet('删除此角色？关联的对话与消息也会删除，字卡库保留', { danger: true, okText: '删除' });
      if (!ok) return;
      const convos = await db.conversations.where('characterId').equals(id).toArray();
      for (const c of convos) {
        await db.messages.where('conversationId').equals(c.id).delete();
      }
      await db.conversations.where('characterId').equals(id).delete();
      await db.characters.delete(id);
      toast('已删除');
      refresh();
    });
  });
}

async function openEditor(charId) {
  const isNew = !charId;
  const char = isNew
    ? { name: '', avatar: '', signature: '', linkedDeckIds: [], replyConfig: {} }
    : await db.characters.get(charId);

  const allDecks = await db.decks.orderBy('createdAt').toArray();
  const cfg = char.replyConfig || {};

  const minMsgs = cfg.minMsgs ?? 1;
  const maxMsgs = cfg.maxMsgs ?? 3;
  const comboChance = chanceToPercent(cfg.comboChance, 0.25);
  const maxCombo = cfg.maxCombo ?? 3;
  const pureRandom = !!cfg.pureRandom;
  const minDelay = cfg.minReplyDelaySec ?? 2;
  const maxDelay = cfg.maxReplyDelaySec ?? 8;
  const skipChance = chanceToPercent(cfg.skipReplyChance, 0);
  const quoteChance = chanceToPercent(cfg.quoteChance, 0.40);
  const choiceChance = chanceToPercent(cfg.choiceChance, 0);
  const callChance = chanceToPercent(cfg.callChance, 0);
  const callMinSec = cfg.callMinSec ?? 30;
  const callMaxSec = cfg.callMaxSec ?? 180;
  const thinkingHints = (cfg.thinkingHints || []).join('\n');
  const skipHints = (cfg.skipHints || []).join('\n');

  // 批次 K 主动消息字段
  const activeMsgEnabled = !!cfg.activeMsgEnabled;
  const activeMinInt = cfg.activeMsgMinInterval ?? 60;
  const activeMaxInt = cfg.activeMsgMaxInterval ?? 180;

  const html = `
    <div class="sheet-header">
      <button class="sheet-close" data-act="close">${ICON.close}</button>
      <div class="sheet-title">${isNew ? '创建角色' : '编辑角色'}</div>
      <button class="btn btn-primary" data-act="save">保存</button>
    </div>
    <div class="sheet-body" style="padding-bottom: 2rem;">
      <div class="field">
        <div class="field-label">头像</div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div id="editor-avatar-preview">${avatarHTML(char.avatar, char.name || '?', 64)}</div>
          <button class="btn btn-secondary" style="position:relative; overflow:hidden;">
            上传图片
            <input type="file" id="f-avatar-file" accept="image/*" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;">
          </button>
        </div>
      </div>

      <div class="field">
        <div class="field-label">姓名</div>
        <input class="input" type="text" id="f-name" value="${escapeAttr(char.name)}" placeholder="角色名字">
      </div>

      <div class="field">
        <div class="field-label">签名 / 描述</div>
        <input class="input" type="text" id="f-signature" value="${escapeAttr(char.signature || '')}" placeholder="一句话描述">
      </div>

      <div class="field">
        <div class="field-label">关联字卡库</div>
        <div class="field-hint">角色回复时，会从关联的库中抽取内容。未关联任何库时将使用通用字卡库。</div>
        <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
          ${allDecks.map((d) => {
            const checked = (char.linkedDeckIds || []).includes(d.id) ? 'checked' : '';
            return `
              <label class="chip-checkbox">
                <input type="checkbox" name="f-decks" value="${d.id}" ${checked}>
                <span>${escapeHtml(d.name)}</span>
              </label>
            `;
          }).join('')}
          ${allDecks.length === 0 ? '<div style="color:var(--color-text-secondary);font-size:0.9rem;">暂无字卡库，去“字卡”页面建一个吧</div>' : ''}
        </div>
      </div>

      <div class="field-section-title">回复机制配置</div>

      <div class="field">
        <div class="field-label">单次发送字卡数</div>
        <div class="row-2col">
          <div>
            <div class="field-hint">最少张数</div>
            <input class="input" type="number" id="f-min-msgs" min="1" max="10" value="${minMsgs}">
          </div>
          <div>
            <div class="field-hint">最多张数</div>
            <input class="input" type="number" id="f-max-msgs" min="1" max="10" value="${maxMsgs}">
          </div>
        </div>
      </div>

      <div class="field">
        <div class="field-label">多卡连发 (Combo)</div>
        <div class="row-2col">
          <div>
            <div class="field-hint">连发概率 %</div>
            <input class="input" type="number" id="f-combo-chance" min="0" max="100" value="${comboChance}">
          </div>
          <div>
            <div class="field-hint">连发上限</div>
            <input class="input" type="number" id="f-max-combo" min="2" max="10" value="${maxCombo}">
          </div>
        </div>
      </div>

      <div class="field">
        <label class="toggle-row">
          <input type="checkbox" id="f-pure-random" ${pureRandom ? 'checked' : ''}>
          <span>连发张数纯随机</span>
        </label>
        <div class="field-hint">开启后每次回复时的连发数量在 [2, 连发上限] 间均匀随机，忽略连发概率。</div>
      </div>

      <div class="field">
        <div class="field-label">回复等待时长（秒）</div>
        <div class="row-2col">
          <div>
            <div class="field-hint">最小延迟</div>
            <input class="input" type="number" id="f-min-delay" min="0" max="3600" value="${minDelay}">
          </div>
          <div>
            <div class="field-hint">最大延迟</div>
            <input class="input" type="number" id="f-max-delay" min="0" max="3600" value="${maxDelay}">
          </div>
        </div>
        <div class="field-hint" style="margin-top:4px;">设为 0 且最小等于最大，则该角色不自动回复，需手动在对话框点击星星触发。</div>
      </div>

      <div class="field">
        <div class="row-2col">
          <div>
            <div class="field-label">已读不回概率 %</div>
            <input class="input" type="number" id="f-skip-chance" min="0" max="100" value="${skipChance}">
          </div>
          <div>
            <div class="field-label">自动引用历史概率 %</div>
            <input class="input" type="number" id="f-quote-chance" min="0" max="100" value="${quoteChance}">
          </div>
        </div>
      </div>

      <div class="field">
        <div class="field-label">互动行为概率</div>
        <div class="row-2col">
          <div>
            <div class="field-hint">选择题触发概率 %</div>
            <input class="input" type="number" id="f-choice-chance" min="0" max="100" value="${choiceChance}">
          </div>
          <div>
            <div class="field-hint">虚拟通话挂件概率 %</div>
            <input class="input" type="number" id="f-call-chance" min="0" max="100" value="${callChance}">
          </div>
        </div>
      </div>

      <div class="field">
        <div class="field-label">通话时长范围（秒）</div>
        <div class="row-2col">
          <div>
            <div class="field-hint">最小通话时长</div>
            <input class="input" type="number" id="f-call-min-sec" min="5" max="3600" value="${callMinSec}">
          </div>
          <div>
            <div class="field-hint">最大通话时长</div>
            <input class="input" type="number" id="f-call-max-sec" min="5" max="3600" value="${callMaxSec}">
          </div>
        </div>
      </div>

      <div class="field-section-title">角色主动消息配置</div>

      <div class="field">
        <label class="toggle-row">
          <input type="checkbox" id="f-active-msg-enabled" ${activeMsgEnabled ? 'checked' : ''}>
          <span>启用角色主动消息</span>
        </label>
        <div class="field-hint">开启后，角色会在后台保活或离线期间，按设定的时间间隔主动向你发送字卡消息。</div>

        <div id="active-msg-settings-group" style="display: ${activeMsgEnabled ? 'block' : 'none'}; margin-top: 12px;">
          <div class="row-2col">
            <div>
              <div class="field-hint">最小触发间隔（分钟）</div>
              <input class="input" type="number" id="f-active-min-interval" min="1" max="14400" value="${activeMinInt}">
            </div>
            <div>
              <div class="field-hint">最大触发间隔（分钟）</div>
              <input class="input" type="number" id="f-active-max-interval" min="1" max="14400" value="${activeMaxInt}">
            </div>
          </div>
          <div class="field-hint" style="margin-top:8px;">1 分钟到 14400 分钟（10天）。保存时最大间隔会自动纠正为不小于最小间隔。首次启用时，会向系统申请本地通知权限。</div>
        </div>
      </div>

      <div class="field">
        <div class="field-label">自定义思考期顶栏文案</div>
        <div class="field-hint">一行一句。未填写时使用系统默认思考文案。</div>
        <textarea class="textarea" id="f-thinking-hints" placeholder="例如：\n正在凝视虚空...\n似乎有话想说..." style="height:80px;">${thinkingHints}</textarea>
      </div>

      <div class="field">
        <div class="field-label">自定义已读不回提示语</div>
        <div class="field-hint">一行一句。当触发已读不回时，会在对话气泡上方显示。未填写时使用系统默认。</div>
        <textarea class="textarea" id="f-skip-hints" placeholder="例如：\n对方陷入了沉思\n风吹过，没有回音" style="height:80px;">${skipHints}</textarea>
      </div>
    </div>
  `;

  const sheet = openSheet(html);
  const sheetRoot = sheet.el;
  let currentAvatarDataURL = char.avatar || '';

  sheetRoot.querySelector('#f-active-msg-enabled').addEventListener('change', (e) => {
    sheetRoot.querySelector('#active-msg-settings-group').style.display = e.target.checked ? 'block' : 'none';
  });

  sheetRoot.querySelector('#f-avatar-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      currentAvatarDataURL = await fileToResizedDataURL(file, 200, 200);
      const name = sheetRoot.querySelector('#f-name').value.trim() || '?';
      sheetRoot.querySelector('#editor-avatar-preview').innerHTML = avatarHTML(currentAvatarDataURL, name, 64);
    } catch (err) {
      toast('图片处理失败');
    }
  });

  sheetRoot.querySelector('[data-act=close]').addEventListener('click', () => {
    sheet.close();
  });

  sheetRoot.querySelector('[data-act=save]').addEventListener('click', async () => {
    haptic('medium');
    const name = sheetRoot.querySelector('#f-name').value.trim();
    if (!name) {
      toast('名字不能为空');
      return;
    }
    const signature = sheetRoot.querySelector('#f-signature').value.trim();

    const selected = [];
    sheetRoot.querySelectorAll('input[name=f-decks]:checked').forEach((cb) => {
      selected.push(Number(cb.value));
    });

    const minMsgs = clampNumber(sheetRoot.querySelector('#f-min-msgs').value, 1, 10, 1);
    let maxMsgs = clampNumber(sheetRoot.querySelector('#f-max-msgs').value, 1, 10, 3);
    if (maxMsgs < minMsgs) maxMsgs = minMsgs;

    const comboChance = percentToChance(sheetRoot.querySelector('#f-combo-chance').value, 25);
    const maxCombo = clampNumber(sheetRoot.querySelector('#f-max-combo').value, 2, 10, 3);
    const pureRandom = sheetRoot.querySelector('#f-pure-random').checked;

    const minDelay = clampNumber(sheetRoot.querySelector('#f-min-delay').value, 0, 3600, 2);
    let maxDelay = clampNumber(sheetRoot.querySelector('#f-max-delay').value, 0, 3600, 8);
    if (maxDelay < minDelay) maxDelay = minDelay;

    const skipChance = percentToChance(sheetRoot.querySelector('#f-skip-chance').value, 0);
    const quoteChance = percentToChance(sheetRoot.querySelector('#f-quote-chance').value, 40);
    const choiceChance = percentToChance(sheetRoot.querySelector('#f-choice-chance').value, 0);
    const callChance = percentToChance(sheetRoot.querySelector('#f-call-chance').value, 0);

    const callMinSec = clampNumber(sheetRoot.querySelector('#f-call-min-sec').value, 5, 3600, 30);
    let callMaxSec = clampNumber(sheetRoot.querySelector('#f-call-max-sec').value, 5, 3600, 180);
    if (callMaxSec < callMinSec) callMaxSec = callMinSec;

    const activeEnabled = sheetRoot.querySelector('#f-active-msg-enabled').checked;
    const activeMinVal = clampNumber(sheetRoot.querySelector('#f-active-min-interval').value, 1, 14400, 60);
    let activeMaxVal = clampNumber(sheetRoot.querySelector('#f-active-max-interval').value, 1, 14400, 180);
    if (activeMaxVal < activeMinVal) activeMaxVal = activeMinVal;

    const thinkingHints = sheetRoot.querySelector('#f-thinking-hints').value
      .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const skipHints = sheetRoot.querySelector('#f-skip-hints').value
      .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    // 如果启用了主动消息，且通知权限还是默认，则在此处申请权限
    if (activeEnabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn('通知权限申请失败:', err);
      }
    }

    const payload = {
      name,
      avatar: currentAvatarDataURL,
      signature,
      linkedDeckIds: selected,
      replyConfig: {
        minMsgs,
        maxMsgs,
        comboChance,
        minCombo: 2,
        maxCombo,
        pureRandom,
        minReplyDelaySec: minDelay,
        maxReplyDelaySec: maxDelay,
        skipReplyChance: skipChance,
        quoteChance,
        choiceChance,
        callChance,
        callMinSec,
        callMaxSec,
        activeMsgEnabled: activeEnabled,
        activeMsgMinInterval: activeMinVal,
        activeMsgMaxInterval: activeMaxVal,
        thinkingHints,
        skipHints,
      },
    };

    let savedCharId = charId;
    if (isNew) {
      payload.createdAt = Date.now();
      payload.status = '';
      savedCharId = await db.characters.add(payload);
    } else {
      await db.characters.update(charId, payload);
    }

    // 处理对话主动消息时间初始化
    if (activeEnabled) {
      const conv = await db.conversations.where('characterId').equals(savedCharId).first();
      if (conv) {
        // 如果原本没有计划发送时间，或者修改了间隔配置，初始化一次 nextActiveMsgAt
        if (!conv.nextActiveMsgAt) {
          const randIntervalMin = activeMinVal + Math.random() * (activeMaxVal - activeMinVal);
          const nextTime = Date.now() + randIntervalMin * 60 * 1000;
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: nextTime,
            lastActiveMsgScheduledTime: conv.lastMessageTime || Date.now()
          });
        }
      }
    }

    sheet.close();
    toast('已保存');
    refresh();
  });
}

export function render(root, params) {
  const html = `
    <div class="characters-page">
      <div class="top-bar">
        <button class="top-bar-btn" data-act="back">${ICON.back}</button>
        <h1 class="top-bar-title">角色列表</h1>
        <div style="width:32px;"></div>
      </div>
      <div class="page-content" id="char-list-wrap" style="padding-bottom: 80px;">
        <div style="text-align:center; padding: 2rem; color: var(--color-text-secondary);">加载中...</div>
      </div>
      <button class="fab" id="add-char-btn" aria-label="新建角色">${ICON.plus}</button>
    </div>
  `;
  root.innerHTML = html;

  root.querySelector('[data-act=back]').addEventListener('click', () => {
    goBack('/home');
  });

  root.querySelector('#add-char-btn').addEventListener('click', () => {
    openEditor(null);
  });

  refresh();
}
