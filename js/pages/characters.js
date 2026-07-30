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

function calculateNextActiveTime(minMinutes, maxMinutes) {
  const min = clampNumber(minMinutes, 1, 14400, 60);
  const max = Math.max(min, clampNumber(maxMinutes, 1, 14400, 300));
  const offset = min + Math.random() * (max - min);
  return Date.now() + offset * 60 * 1000;
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
  if (!char) { toast('角色不存在'); return; }

  const allDecks = await db.decks.orderBy('createdAt').toArray();
  const linked = new Set(char.linkedDeckIds || []);
  const cfg = char.replyConfig || {};

  const quoteChancePercent = chanceToPercent(cfg.quoteChance, 0.5);
  const choiceChancePercent = chanceToPercent(cfg.choiceChance, 0.5);
  const callChancePercent = chanceToPercent(cfg.callChance, 0.5);
  const callMinSecValue = clampNumber(cfg.callMinSec, 10, 360000, 45);
  const callMaxSecValue = Math.max(callMinSecValue, clampNumber(cfg.callMaxSec, 10, 360000, 180));

  const activeMsgEnabled = !!cfg.activeMsgEnabled;
  const activeMsgMinInterval = clampNumber(cfg.activeMsgMinInterval, 1, 14400, 60);
  const activeMsgMaxInterval = Math.max(
    activeMsgMinInterval,
    clampNumber(cfg.activeMsgMaxInterval, 1, 14400, 300)
  );

  const body = `
    <div class="editor-form">
      <div class="avatar-picker">
        <div class="avatar-preview" id="avatar-preview">
          ${avatarHTML(char.avatar, char.name || '?', 84)}
        </div>
        <input type="file" id="avatar-file" accept="image/*" hidden>
        <div class="avatar-actions">
          <button class="btn btn-secondary" data-act="pick-file">选图片</button>
          <button class="btn btn-ghost" data-act="clear-avatar">清除</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label">名称</label>
        <input class="input" id="f-name" placeholder="给ta一个名字" maxlength="40" value="${escapeAttr(char.name || '')}">
      </div>

      <div class="field">
        <label class="field-label">头像 URL（可选，会覆盖上传的图片）</label>
        <input class="input" id="f-avatar-url" placeholder="https://..." value="${escapeAttr(char.avatar && char.avatar.startsWith('http') ? char.avatar : '')}">
      </div>

      <div class="field">
        <label class="field-label">个性签名</label>
        <input class="input" id="f-signature" placeholder="出现在对话顶部" maxlength="60" value="${escapeAttr(char.signature || '')}">
      </div>

      <div class="field">
        <label class="field-label">绑定字卡库</label>
        <div class="deck-picker" id="deck-picker">
          ${allDecks.length ? allDecks.map((d) => `
            <label class="deck-chip ${linked.has(d.id) ? 'on' : ''}">
              <input type="checkbox" value="${d.id}" ${linked.has(d.id) ? 'checked' : ''}>
              <span>${escapeHtml(d.name)}</span>
              <span class="deck-chip-count">${(d.fragments || []).length}</span>
            </label>
          `).join('') : '<div class="field-hint">还没有字卡库，稍后到「字卡库」创建</div>'}
        </div>
        <div class="field-hint">未绑定任何字卡库时，将使用未绑定角色的通用字卡库</div>
      </div>

      <div class="field">
        <label class="field-label">生成参数</label>
        <div class="row-2col">
          <div>
            <div class="field-hint">最少消息条数</div>
            <input class="input" type="number" id="f-min-msgs" min="1" max="999" value="${cfg.minMsgs ?? 1}">
          </div>
          <div>
            <div class="field-hint">最多消息条数</div>
            <input class="input" type="number" id="f-max-msgs" min="1" max="999" value="${cfg.maxMsgs ?? 3}">
          </div>
        </div>
        <div class="row-2col" style="margin-top:12px;">
          <div>
            <div class="field-hint">拼接概率 0-1</div>
            <input class="input" type="number" id="f-combo-chance" min="0" max="1" step="0.05" value="${cfg.comboChance ?? 0.25}">
          </div>
          <div>
            <div class="field-hint">最多拼接卡数</div>
            <input class="input" type="number" id="f-max-combo" min="1" max="999" value="${cfg.maxCombo ?? 3}">
          </div>
        </div>
        <label class="toggle-row">
          <input type="checkbox" id="f-pure-random" ${cfg.pureRandom ? 'checked' : ''}>
          <span>纯随机模式</span>
        </label>
        <div class="field-hint">开启后拼接概率现场随机，忽略上面设定，一切听天由命</div>
      </div>

      <div class="field">
        <label class="field-label">回复行为</label>
        <div class="row-2col">
          <div>
            <div class="field-hint">最小回复时长（秒）</div>
            <input class="input" type="number" id="f-min-delay" min="0" max="1200" value="${cfg.minReplyDelaySec ?? 0}">
          </div>
          <div>
            <div class="field-hint">最大回复时长（秒）</div>
            <input class="input" type="number" id="f-max-delay" min="0" max="1200" value="${cfg.maxReplyDelaySec ?? 0}">
          </div>
        </div>
        <div class="field-hint" style="margin-top:8px;">0-1200 秒（约 20 分钟）。全设 0 则需手动触发。发消息后角色会在此区间内随机时刻回复。</div>

        <div class="row-2col" style="margin-top:12px;">
          <div>
            <div class="field-hint">已读不回概率 0-1</div>
            <input class="input" type="number" id="f-skip-chance" min="0" max="1" step="0.05" value="${cfg.skipReplyChance ?? 0}">
          </div>
          <div></div>
        </div>
        <div class="field-hint" style="margin-top:8px;">到点时按此概率跳过回复，改为一条系统提示</div>

        <div class="field-subgroup">
          <div class="field-hint">引用历史消息概率</div>
          <div class="range-row">
            <input class="range-input" type="range" id="f-quote-chance-range" min="0" max="100" step="1" value="${quoteChancePercent}">
            <input class="input percent-input" type="number" id="f-quote-chance" min="0" max="100" step="1" value="${quoteChancePercent}">
            <span class="percent-mark">%</span>
          </div>
          <div class="field-hint">角色自动回复第一条消息时，引用一条历史消息的概率。保存为 replyConfig.quoteChance。</div>
        </div>

        <div class="field-subgroup">
          <div class="field-hint">主动发送选择题概率</div>
          <div class="range-row">
            <input class="range-input" type="range" id="f-choice-chance-range" min="0" max="100" step="1" value="${choiceChancePercent}">
            <input class="input percent-input" type="number" id="f-choice-chance" min="0" max="100" step="1" value="${choiceChancePercent}">
            <span class="percent-mark">%</span>
          </div>
          <div class="field-hint">角色主动发送选择题的概率。选择题字卡格式：??问题|选项1|选项2|选项3，最多 5 个选项。保存为 replyConfig.choiceChance。</div>
        </div>

        <div class="field-subgroup">
          <div class="field-hint">自动发起虚拟通话概率</div>
          <div class="range-row">
            <input class="range-input" type="range" id="f-call-chance-range" min="0" max="100" step="1" value="${callChancePercent}">
            <input class="input percent-input" type="number" id="f-call-chance" min="0" max="100" step="1" value="${callChancePercent}">
            <span class="percent-mark">%</span>
          </div>
          <div class="field-hint">角色回复时自动发起虚拟通话的概率。保存为 replyConfig.callChance。</div>
        </div>

        <div class="row-2col" style="margin-top:12px;">
          <div>
            <div class="field-hint">虚拟通话最短时长（秒）</div>
            <input class="input" type="number" id="f-call-min-sec" min="10" max="360000" step="1" value="${callMinSecValue}">
          </div>
          <div>
            <div class="field-hint">虚拟通话最长时长（秒）</div>
            <input class="input" type="number" id="f-call-max-sec" min="10" max="360000" step="1" value="${callMaxSecValue}">
          </div>
        </div>
        <div class="field-hint" style="margin-top:8px;">通话时长上限为 360000 秒，即 100 小时。最长时长保存时会自动不小于最短时长。</div>

        <div class="field-subgroup active-msg-block">
          <label class="toggle-row active-msg-toggle">
            <input type="checkbox" id="f-active-msg-enabled" ${activeMsgEnabled ? 'checked' : ''}>
            <span>启用角色主动消息</span>
          </label>
          <div class="field-hint">开启后，角色会按纯随机计时器主动发来字卡消息。App 保持后台活跃时可能在后台触发，重新打开 App 时也会检查是否需要补发。</div>

          <div id="active-msg-settings" style="display:${activeMsgEnabled ? 'block' : 'none'};">
            <div class="row-2col" style="margin-top:12px;">
              <div>
                <div class="field-hint">最小间隔（分钟）</div>
                <input class="input" type="number" id="f-active-min-interval" min="1" max="14400" step="1" value="${activeMsgMinInterval}">
              </div>
              <div>
                <div class="field-hint">最大间隔（分钟）</div>
                <input class="input" type="number" id="f-active-max-interval" min="1" max="14400" step="1" value="${activeMsgMaxInterval}">
              </div>
            </div>
            <div class="field-hint" style="margin-top:8px;">建议设置为 60 到 300 分钟，即大约 1 到 5 小时。保存时会自动保证最大间隔不小于最小间隔。</div>
          </div>
        </div>

        <div class="field-hint" style="margin-top:14px;">思考期文案（每行一句，空则用默认）</div>
        <textarea class="input textarea" id="f-thinking-hints" rows="3" placeholder="正在深思熟虑...&#10;正在挑选字卡...">${escapeHtml((cfg.thinkingHints || []).join('\n'))}</textarea>

        <div class="field-hint" style="margin-top:12px;">已读不回文案（每行一句，空则用默认）</div>
        <textarea class="input textarea" id="f-skip-hints" rows="3" placeholder="对方无视了这条消息&#10;对方跳过了这条消息">${escapeHtml((cfg.skipHints || []).join('\n'))}</textarea>
      </div>
    </div>
  `;

  const { close } = openSheet({
    title: isNew ? '新建角色' : '编辑角色',
    body,
    maxHeight: '92vh',
    actions: `
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-primary" data-act="save">保存</button>
    `,
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');
  if (!sheetRoot) {
    toast('编辑面板打开失败');
    return;
  }

  let uploadedDataUrl = char.avatar && !char.avatar.startsWith('http') ? char.avatar : '';

  const preview = sheetRoot.querySelector('#avatar-preview');
  const fileInput = sheetRoot.querySelector('#avatar-file');

  sheetRoot.querySelector('[data-act=pick-file]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    try {
      const url = await fileToResizedDataURL(f, 300);
      uploadedDataUrl = url;
      sheetRoot.querySelector('#f-avatar-url').value = '';
      preview.innerHTML = avatarHTML(url, sheetRoot.querySelector('#f-name').value || '?', 84);
    } catch (e) { toast('图片处理失败'); }
  });
  sheetRoot.querySelector('[data-act=clear-avatar]').addEventListener('click', () => {
    uploadedDataUrl = '';
    sheetRoot.querySelector('#f-avatar-url').value = '';
    preview.innerHTML = avatarHTML('', sheetRoot.querySelector('#f-name').value || '?', 84);
  });
  sheetRoot.querySelector('#f-avatar-url').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    preview.innerHTML = avatarHTML(url || uploadedDataUrl, sheetRoot.querySelector('#f-name').value || '?', 84);
  });
  sheetRoot.querySelector('#f-name').addEventListener('input', (e) => {
    const url = sheetRoot.querySelector('#f-avatar-url').value.trim() || uploadedDataUrl;
    preview.innerHTML = avatarHTML(url, e.target.value || '?', 84);
  });
  sheetRoot.querySelectorAll('.deck-chip input').forEach((cb) => {
    cb.addEventListener('change', () => {
      cb.closest('.deck-chip').classList.toggle('on', cb.checked);
    });
  });

  const activeMsgToggle = sheetRoot.querySelector('#f-active-msg-enabled');
  const activeMsgSettings = sheetRoot.querySelector('#active-msg-settings');
  if (activeMsgToggle && activeMsgSettings) {
    activeMsgToggle.addEventListener('change', () => {
      activeMsgSettings.style.display = activeMsgToggle.checked ? 'block' : 'none';
    });
  }

  [
    ['#f-quote-chance-range', '#f-quote-chance'],
    ['#f-choice-chance-range', '#f-choice-chance'],
    ['#f-call-chance-range', '#f-call-chance'],
  ].forEach(([rangeSelector, numberSelector]) => {
    const range = sheetRoot.querySelector(rangeSelector);
    const number = sheetRoot.querySelector(numberSelector);
    if (!range || !number) return;

    range.addEventListener('input', () => {
      number.value = range.value;
    });

    number.addEventListener('input', () => {
      const value = clampNumber(number.value, 0, 100, 50);
      range.value = value;
    });

    number.addEventListener('blur', () => {
      const value = Math.round(clampNumber(number.value, 0, 100, 50));
      number.value = value;
      range.value = value;
    });
  });

  sheetRoot.querySelector('[data-act=cancel]').addEventListener('click', () => close());
  sheetRoot.querySelector('[data-act=save]').addEventListener('click', async () => {
    const name = sheetRoot.querySelector('#f-name').value.trim();
    if (!name) { toast('请填写名称'); return; }
    const avatarUrl = sheetRoot.querySelector('#f-avatar-url').value.trim();
    const avatar = avatarUrl || uploadedDataUrl || '';
    const signature = sheetRoot.querySelector('#f-signature').value.trim();
    const selected = [...sheetRoot.querySelectorAll('.deck-chip input:checked')].map((el) => Number(el.value));

    const minMsgs = Math.max(1, Math.min(999, Number(sheetRoot.querySelector('#f-min-msgs').value) || 1));
    let maxMsgs = Math.max(1, Math.min(999, Number(sheetRoot.querySelector('#f-max-msgs').value) || 3));
    if (maxMsgs < minMsgs) maxMsgs = minMsgs;
    const comboChance = Math.max(0, Math.min(1, Number(sheetRoot.querySelector('#f-combo-chance').value) || 0));
    const maxCombo = Math.max(1, Math.min(999, Number(sheetRoot.querySelector('#f-max-combo').value) || 3));
    const pureRandom = !!sheetRoot.querySelector('#f-pure-random').checked;

    const minDelay = Math.max(0, Math.min(1200, Number(sheetRoot.querySelector('#f-min-delay').value) || 0));
    let maxDelay = Math.max(0, Math.min(1200, Number(sheetRoot.querySelector('#f-max-delay').value) || 0));
    if (maxDelay < minDelay) maxDelay = minDelay;
    const skipChance = Math.max(0, Math.min(1, Number(sheetRoot.querySelector('#f-skip-chance').value) || 0));

    const quoteChance = percentToChance(sheetRoot.querySelector('#f-quote-chance').value, 50);
    const choiceChance = percentToChance(sheetRoot.querySelector('#f-choice-chance').value, 50);
    const callChance = percentToChance(sheetRoot.querySelector('#f-call-chance').value, 50);

    const callMinSec = clampNumber(sheetRoot.querySelector('#f-call-min-sec').value, 10, 360000, 45);
    let callMaxSec = clampNumber(sheetRoot.querySelector('#f-call-max-sec').value, 10, 360000, 180);
    if (callMaxSec < callMinSec) callMaxSec = callMinSec;

    const activeEnabled = !!sheetRoot.querySelector('#f-active-msg-enabled').checked;
    const activeMinInterval = clampNumber(sheetRoot.querySelector('#f-active-min-interval').value, 1, 14400, 60);
    let activeMaxInterval = clampNumber(sheetRoot.querySelector('#f-active-max-interval').value, 1, 14400, 300);
    if (activeMaxInterval < activeMinInterval) activeMaxInterval = activeMinInterval;

    const thinkingHints = sheetRoot.querySelector('#f-thinking-hints').value
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const skipHints = sheetRoot.querySelector('#f-skip-hints').value
      .split('\n').map((s) => s.trim()).filter(Boolean);

    if (activeEnabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn('通知权限申请失败:', err);
      }
    }

    const payload = {
      name, avatar, signature,
      linkedDeckIds: selected,
      replyConfig: {
        minMsgs, maxMsgs,
        comboChance, minCombo: 2, maxCombo,
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
        activeMsgMinInterval: activeMinInterval,
        activeMsgMaxInterval: activeMaxInterval,
        thinkingHints,
        skipHints,
      },
    };

    let savedCharId = charId;

    if (isNew) {
      savedCharId = await db.characters.add({ ...payload, createdAt: Date.now(), status: '' });
    } else {
      await db.characters.update(charId, payload);
    }

    if (savedCharId) {
      const conv = await db.conversations.where('characterId').equals(savedCharId).first();

      if (conv) {
        if (activeEnabled) {
          const currentLastMsgTime = conv.lastMessageTime || conv.createdAt || Date.now();
          const needReset =
            !conv.nextActiveMsgAt ||
            !conv.lastActiveMsgScheduledTime ||
            cfg.activeMsgMinInterval !== activeMinInterval ||
            cfg.activeMsgMaxInterval !== activeMaxInterval ||
            !cfg.activeMsgEnabled;

          if (needReset) {
            await db.conversations.update(conv.id, {
              nextActiveMsgAt: calculateNextActiveTime(activeMinInterval, activeMaxInterval),
              lastActiveMsgScheduledTime: currentLastMsgTime,
            });
          }
        } else {
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: null,
            lastActiveMsgScheduledTime: null,
          });
        }
      }
    }

    toast('已保存');
    close();
    refresh();
  });
}

export async function render(root, params = {}) {
  root.innerHTML = `
    <div class="page char-page">
      <div class="top-bar">
        <button class="top-bar-btn" data-act="back" aria-label="返回">${ICON.back}</button>
        <div class="top-bar-title">角 色</div>
        <span style="width:40px;"></span>
      </div>
      <div id="char-list-wrap"></div>
      <button class="fab" data-act="new" aria-label="新建角色">${ICON.plus}</button>
      <style>
        .char-page { min-height: 100vh; padding-bottom: 100px; }
        .char-list { list-style: none; }
        .row-icon-btn {
          padding: 8px; border-radius: 8px;
          color: var(--color-text-tertiary);
          transition: color 0.2s, background 0.2s;
        }
        .row-icon-btn:active { color: #dc2626; background: var(--color-bg-secondary); }

        .editor-form { max-height: 68vh; overflow-y: auto; padding-right: 4px; }
        .avatar-picker {
          display: flex; align-items: center; gap: 16px;
          padding: 4px 4px 20px; border-bottom: 1px solid var(--color-border);
          margin-bottom: 20px;
        }
        .avatar-preview .avatar { width: 84px; height: 84px; font-size: 32px; }
        .avatar-actions { display: flex; flex-direction: column; gap: 8px; }
        .avatar-actions .btn { min-height: 34px; padding: 8px 14px; font-size: 12px; letter-spacing: 1px; }

        .deck-picker { display: flex; flex-wrap: wrap; gap: 8px; }
        .deck-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px;
          border-radius: 999px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
          font-size: 12px; letter-spacing: 1px;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .deck-chip input { display: none; }
        .deck-chip.on {
          background: var(--color-bg-tertiary);
          border-color: var(--color-accent);
          color: var(--color-text-primary);
        }
        .deck-chip-count {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 999px;
          background: var(--color-bg-primary);
          color: var(--color-text-tertiary);
        }

        .toggle-row {
          display: flex; align-items: center; gap: 10px;
          margin-top: 14px;
          font-size: 13px; color: var(--color-text-secondary);
          cursor: pointer;
          letter-spacing: 1px;
        }
        .toggle-row input[type=checkbox] {
          width: 18px; height: 18px;
          accent-color: var(--color-accent);
          cursor: pointer;
        }
        .textarea {
          width: 100%;
          min-height: 76px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          color: var(--color-text-primary);
          font-size: 13px; line-height: 1.55;
          font-family: inherit;
          resize: vertical;
        }
        .textarea:focus { border-color: var(--color-accent); outline: none; }

        .field-subgroup {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--color-border);
        }
        .active-msg-block {
          padding: 14px 12px 12px;
          border: 1px solid var(--color-border);
          border-radius: 16px;
          background: var(--color-bg-secondary);
        }
        .active-msg-toggle {
          margin-top: 0;
          color: var(--color-text-primary);
        }
        .range-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          margin-bottom: 6px;
        }
        .range-input {
          flex: 1;
          min-width: 0;
          accent-color: var(--color-accent);
        }
        .percent-input {
          width: 74px;
          flex: none;
          text-align: right;
        }
        .percent-mark {
          flex: none;
          color: var(--color-text-tertiary);
          font-size: 12px;
        }
      </style>
    </div>
  `;

  const list = await loadCharacters();
  document.getElementById('char-list-wrap').innerHTML = renderList(list);
  bindRowEvents();

  root.querySelector('[data-act=back]').addEventListener('click', () => { haptic(6); goBack('/cards'); });
  root.querySelector('[data-act=new]').addEventListener('click', () => { haptic(8); openEditor(null); });

  if (params.new === '1') openEditor(null);
  else if (params.edit) openEditor(Number(params.edit));
}

export function destroy() {}
