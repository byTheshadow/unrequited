import { db } from '../../db.js';
import { navigate, goBack } from '../../router.js';
import {
  toast, openSheet, confirmSheet, avatarHTML, escapeHtml, escapeAttr,
  fileToResizedDataURL, downloadJSON, haptic, ICON,
} from '../../utils.js';
import { setTheme, getCurrentTheme, setAnimEnabled } from '../../themeManager.js';
import * as sound from '../../lib/sound.js';
import * as keepAlive from '../../lib/keepAlive.js';

const THEMES = [
  { id: 'minimal-dark',  name: '极简 · 夜' },
  { id: 'minimal-light', name: '极简 · 昼' },
  { id: 'glass-dark',    name: '玻璃 · 夜' },
  { id: 'glass-light',   name: '玻璃 · 昼' },
  { id: 'starry',        name: '星夜' },
  { id: 'warm-healing',  name: '暖愈' },
  { id: 'pink-healing',  name: '粉色治愈' },
  { id: 'ocean-blue',    name: '海洋蓝' },
  { id: 'ocean-white',   name: '海洋白' },
  { id: 'green-healing-light',   name: '治愈绿白' },
  { id: 'mono-starfield',      name: '星砂黑白' },
  

];

let state = {};
let rootRef = null;

async function getSetting(key, defaultValue = null) {
  const row = await db.settings.get(key);
  return row ? row.value : defaultValue;
}
async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

export async function render(root) {
  rootRef = root;

  state = {
    user: null,
    soundCfg: null,
    keepAliveOn: false,
    animEnabled: (localStorage.getItem('animEnabled') ?? '1') === '1',
    currentTheme: getCurrentTheme(),
    ai: { baseUrl: '', apiKey: '', model: '', models: [] },
    aiKeyRevealed: false,
    aiFetching: false,
    launchStyle: await getSetting('launchStyle', 'classic')
  };

  const users = await db.user.toArray();
  state.user = users[0] || { id: null, name: '', avatar: '', status: '', signature: '' };

  state.soundCfg = await sound.loadConfig();
  state.keepAliveOn = await keepAlive.loadEnabled();

  state.ai.baseUrl = await getSetting('ai.baseUrl', '') || '';
  state.ai.apiKey  = await getSetting('ai.apiKey', '')  || '';
  state.ai.model   = await getSetting('ai.model', '')   || '';
  const models     = await getSetting('ai.models', []);
  state.ai.models  = Array.isArray(models) ? models : [];

  root.innerHTML = renderPage();
  bindEvents(root);
  applyThemePreviews(root);
}

export function destroy() {
  rootRef = null;
  state = {};
}

/* ---------- 页面骨架 ---------- */

function renderPage() {
  return `
    <div class="settings-page page">
      <header class="settings-header">
        <button class="nav-btn" data-act="back" type="button" aria-label="返回">${ICON.back}</button>
        <div class="settings-title">设 置</div>
        <div class="nav-btn-placeholder"></div>
      </header>

      <main class="settings-main">
        ${renderUserSection()}
        ${renderAppearanceSection()}
        ${renderSoundSection()}
        ${renderKeepAliveSection()}
        ${renderAISection()}
        ${renderDataSection()}
        <div class="settings-bottom-space"></div>
      </main>

      <style>${pageCSS()}</style>
    </div>
  `;
}

/* ---------- User 资料 ---------- */

function renderUserSection() {
  const u = state.user;
  const name = u.name ? escapeHtml(u.name) : '未设置';
  const sub  = [u.status, u.signature].filter(Boolean).map(escapeHtml).join(' · ') || '点击设置头像 · 昵称 · 状态 · 签名';
  return `
    <section class="settings-section">
      <div class="section-title">用 户 资 料</div>
      <div class="user-row" data-act="edit-user">
        <div class="user-avatar">${avatarHTML(u.avatar, u.name || 'U', 48)}</div>
        <div class="user-info">
          <div class="user-name">${name}</div>
          <div class="user-sub">${sub}</div>
        </div>
        <div class="row-chev">${chev()}</div>
      </div>
    </section>
  `;
}

function openUserEdit() {
  const u = state.user;
  const bodyHTML = `
    <div class="user-edit">
      <div class="avatar-picker">
        <div class="avatar-preview" id="avatar-preview">${avatarHTML(u.avatar, u.name || 'U', 76)}</div>
        <label class="btn btn-inline">
          选择头像
          <input type="file" accept="image/*" id="avatar-input" hidden>
        </label>
        ${u.avatar ? '<button type="button" class="btn btn-inline" id="avatar-clear">移除</button>' : ''}
      </div>
      <div class="input-row plain">
        <div class="input-label">昵 称</div>
        <div class="input-field">
          <input type="text" id="u-name" maxlength="24" value="${escapeAttr(u.name || '')}" placeholder="怎么称呼你">
        </div>
      </div>
      <div class="input-row plain">
        <div class="input-label">状 态</div>
        <div class="input-field">
          <input type="text" id="u-status" maxlength="24" value="${escapeAttr(u.status || '')}" placeholder="在做什么">
        </div>
      </div>
      <div class="input-row plain">
        <div class="input-label">签 名</div>
        <div class="input-field">
          <input type="text" id="u-signature" maxlength="60" value="${escapeAttr(u.signature || '')}" placeholder="想说的一句话">
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-inline" id="u-cancel" type="button">取消</button>
        <button class="btn btn-primary btn-inline" id="u-save" type="button">保存</button>
      </div>
    </div>
    <style>
      .user-edit { padding: 4px 4px 12px; display: flex; flex-direction: column; gap: 12px; }
      .avatar-picker { display: flex; align-items: center; gap: 12px; padding: 4px 4px 8px; }
      .avatar-preview { width: 76px; height: 76px; border-radius: 999px; overflow: hidden;
        background: var(--color-bg-tertiary); flex-shrink: 0; }
      .avatar-preview img, .avatar-preview svg { width: 100%; height: 100%; }
      .input-row.plain { padding: 4px 4px; border: none; }
      .sheet-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; }
    </style>
  `;

  const { sheet, close } = openSheet({ title: '编辑资料', body: bodyHTML });

  let newAvatar = u.avatar || '';

  const $avatarPreview = sheet.querySelector('#avatar-preview');
  const $avatarInput = sheet.querySelector('#avatar-input');
  const $avatarClear = sheet.querySelector('#avatar-clear');
  const $name = sheet.querySelector('#u-name');
  const $status = sheet.querySelector('#u-status');
  const $signature = sheet.querySelector('#u-signature');
  const $cancel = sheet.querySelector('#u-cancel');
  const $save = sheet.querySelector('#u-save');

  $avatarInput.addEventListener('change', async () => {
    const f = $avatarInput.files && $avatarInput.files[0];
    if (!f) return;
    try {
      newAvatar = await fileToResizedDataURL(f, 300);
      $avatarPreview.innerHTML = avatarHTML(newAvatar, $name.value || 'U', 76);
    } catch (e) {
      toast('头像处理失败');
    }
  });
  if ($avatarClear) {
    $avatarClear.addEventListener('click', () => {
      newAvatar = '';
      $avatarPreview.innerHTML = avatarHTML('', $name.value || 'U', 76);
    });
  }
  $cancel.addEventListener('click', () => close());
  $save.addEventListener('click', async () => {
    const patch = {
      avatar: newAvatar,
      name: $name.value.trim(),
      status: $status.value.trim(),
      signature: $signature.value.trim(),
    };
    if (state.user.id) {
      await db.user.update(state.user.id, patch);
    } else {
      const id = await db.user.add(patch);
      state.user.id = id;
    }
    Object.assign(state.user, patch);
    // 局部重渲染 user 分区
    const sec = rootRef.querySelector('.settings-main .settings-section:first-child');
    if (sec) sec.outerHTML = renderUserSection();
    // 事件重绑（简化：整段重绑）
    rebindMain();
    toast('已保存');
    close();
  });
}

/* ---------- 外观 ---------- */

function renderAppearanceSection() {
  return `
    <section class="settings-section">
      <div class="section-title">外 观</div>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <button class="theme-cell" data-act="pick-theme" data-theme="${t.id}" data-on="${state.currentTheme === t.id ? '1' : '0'}" type="button">
            <div class="theme-preview" data-preview-for="${t.id}"></div>
            <div class="theme-name">${t.name}</div>
          </button>
        `).join('')}
      </div>
      <div class="row">
        <div class="row-label">动 效</div>
        <div class="switch" data-act="toggle-anim" data-on="${state.animEnabled ? '1' : '0'}" role="switch" aria-checked="${state.animEnabled}"></div>
      </div>
      <div class="row row-vertical">
        <div class="row-header">
          <div class="row-label">启动动画</div>
        </div>
        <div class="chips inline">
          <button class="chip" data-act="pick-launch-style" data-val="classic" data-on="${state.launchStyle === 'classic' ? '1' : '0'}" type="button">经典塔罗</button>
          <button class="chip" data-act="pick-launch-style" data-val="ecg" data-on="${state.launchStyle === 'ecg' ? '1' : '0'}" type="button">心跳播放器</button>
        </div>
      </div>
    </section>
  `;
}

function applyThemePreviews(root) {
  THEMES.forEach(t => {
    const cell = root.querySelector(`[data-preview-for="${t.id}"]`);
    if (!cell) return;
    const probe = document.createElement('div');
    probe.setAttribute('data-theme', t.id);
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const bg   = (cs.getPropertyValue('--color-bg-primary')      || '').trim() || '#111';
    const user = (cs.getPropertyValue('--color-bubble-user')     || '').trim() || '#333';
    const chr  = (cs.getPropertyValue('--color-bubble-character')|| '').trim() || '#222';
    document.body.removeChild(probe);
    cell.style.background = bg;
    cell.innerHTML = `
      <div class="pv-bubble pv-user" style="background:${user}"></div>
      <div class="pv-bubble pv-char" style="background:${chr}"></div>
    `;
  });
}

/* ---------- 提示音 ---------- */

function renderSoundSection() {
  const c = state.soundCfg;
  return `
    <section class="settings-section" data-section="sound">
      <div class="section-title">提 示 音</div>
      <div class="row">
        <div class="row-label">静 音</div>
        <div class="switch" data-act="toggle-mute" data-on="${c.muted ? '1' : '0'}"></div>
      </div>
      <div class="row row-vertical">
        <div class="row-header">
          <div class="row-label">音 量</div>
          <div class="row-value" data-role="vol-text">${Math.round(c.volume * 100)}%</div>
        </div>
        <input type="range" class="slider" min="0" max="100" step="1" value="${Math.round(c.volume * 100)}" data-act="vol">
      </div>
      <div class="row row-vertical">
        <div class="row-header">
          <div class="row-label">内 置 音 色</div>
        </div>
        <div class="chips inline">
          <button class="chip" data-act="pick-builtin" data-val="bell" data-on="${c.builtin === 'bell' ? '1' : '0'}" type="button">清脆铃</button>
          <button class="chip" data-act="pick-builtin" data-val="chime" data-on="${c.builtin === 'chime' ? '1' : '0'}" type="button">磬 音</button>
        </div>
      </div>
      <div class="row row-vertical">
        <div class="row-header">
          <div class="row-label">自 定 义 音</div>
        </div>
        <div class="custom-audio">
          ${c.customUrl
            ? `<div class="custom-audio-name">已设置自定义音</div>
               <div class="custom-audio-actions">
                 <button class="btn btn-inline" data-act="preview-custom" type="button">试听</button>
                 <button class="btn btn-inline btn-danger" data-act="clear-custom" type="button">移除</button>
               </div>`
            : `<label class="btn btn-inline">
                 选择音频
                 <input type="file" accept="audio/*" hidden data-act="upload-custom">
               </label>`
          }
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-full" data-act="preview-current" type="button">试听当前配置</button>
      </div>
    </section>
  `;
}

/* ---------- 后台保活 ---------- */

function renderKeepAliveSection() {
  return `
    <section class="settings-section">
      <div class="section-title">后 台 保 活</div>
      <div class="row">
        <div class="row-label">开 启</div>
        <div class="switch" data-act="toggle-keepalive" data-on="${state.keepAliveOn ? '1' : '0'}"></div>
      </div>
      <div class="section-desc">
        通过静默音频维持后台运行，用于让角色的自动回复在切后台后仍能触发。Android Chrome 有效；iOS 只能延缓被暂停的时间，锁屏或长时间后台仍会被系统回收。
      </div>
    </section>
  `;
}

/* ---------- AI 配置 ---------- */

function renderAISection() {
  const a = state.ai;
  const keyType = state.aiKeyRevealed ? 'text' : 'password';
  return `
    <section class="settings-section" data-section="ai">
      <div class="section-title">A I 解 读 · 占 卜 用</div>
      <div class="input-row">
        <div class="input-label">B A S E   U R L</div>
        <div class="input-field">
          <input type="text" id="ai-base-url" placeholder="https://api.openai.com/v1" value="${escapeAttr(a.baseUrl)}">
        </div>
      </div>
      <div class="input-row">
        <div class="input-label">A P I   K E Y</div>
        <div class="input-field">
          <input type="${keyType}" id="ai-api-key" placeholder="sk-..." value="${escapeAttr(a.apiKey)}" autocomplete="off">
          <button class="eye-btn" data-act="toggle-eye" type="button" aria-label="显示或隐藏">${state.aiKeyRevealed ? eyeOff() : eye()}</button>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-full" data-act="fetch-models" type="button" ${state.aiFetching ? 'disabled' : ''}>
          ${state.aiFetching ? '拉取中…' : (a.models.length ? '重新拉取模型列表' : '拉取模型列表')}
        </button>
      </div>
      ${a.models.length ? `
        <div class="row-vertical row" style="padding-top: 6px;">
          <div class="row-header">
            <div class="row-label">选 择 模 型</div>
            <div class="row-value">${a.model ? escapeHtml(a.model) : '未选择'}</div>
          </div>
        </div>
        <div class="chips">
          ${a.models.map(m => `
            <button class="chip" data-act="pick-model" data-val="${escapeAttr(m)}" data-on="${a.model === m ? '1' : '0'}" type="button">${escapeHtml(m)}</button>
          `).join('')}
        </div>
      ` : `
        <div class="section-desc">填入 Base URL 和 API Key，点击"拉取模型列表"后从中选择要用于占卜解读的模型。</div>
      `}
    </section>
  `;
}

/* ---------- 数据管理 ---------- */

function renderDataSection() {
  return `
    <section class="settings-section">
      <div class="section-title">数 据 管 理</div>
      <button class="row row-btn" data-act="export-data" type="button">
        <div class="row-label">导出全部数据</div>
        <div class="row-chev">${chev()}</div>
      </button>
      <button class="row row-btn" data-act="import-data" type="button">
        <div class="row-label">从 JSON 导入</div>
        <div class="row-chev">${chev()}</div>
      </button>
      <button class="row row-btn" data-act="wipe-data" type="button">
        <div class="row-label" style="color:#dc2626">清空所有数据</div>
        <div class="row-chev">${chev()}</div>
      </button>
      <div class="section-desc">
        导入采用覆盖模式，会先清空当前数据再写入。清空后应用会回到启动页。
      </div>
    </section>
  `;
}

/* ---------- 事件绑定 ---------- */

function bindEvents(root) {
  root.querySelector('[data-act="back"]').addEventListener('click', () => {
    haptic(6);
    goBack('/');
  });
  rebindMain();
}

function rebindMain() {
  const main = rootRef.querySelector('.settings-main');
  if (!main) return;
  main.onclick = onMainClick;
  main.oninput = onMainInput;
  main.onchange = onMainChange;
  main.onblur = null;
  // blur 事件不冒泡，需在具体输入上绑
  const $base = main.querySelector('#ai-base-url');
  const $key = main.querySelector('#ai-api-key');
  if ($base) $base.onblur = async () => {
    const v = $base.value.trim();
    if (v === state.ai.baseUrl) return;
    state.ai.baseUrl = v;
    await setSetting('ai.baseUrl', v);
    toast('已保存');
  };
  if ($key) $key.onblur = async () => {
    const v = $key.value.trim();
    if (v === state.ai.apiKey) return;
    state.ai.apiKey = v;
    await setSetting('ai.apiKey', v);
    toast('已保存');
  };
}

async function onMainClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.getAttribute('data-act');

  switch (act) {
    case 'edit-user':
      openUserEdit();
      break;

    case 'pick-theme': {
      const id = t.getAttribute('data-theme');
      if (id === state.currentTheme) return;
      state.currentTheme = id;
      setTheme(id);
      rootRef.querySelectorAll('[data-act="pick-theme"]').forEach(el => {
        el.setAttribute('data-on', el.getAttribute('data-theme') === id ? '1' : '0');
      });
      haptic(6);
      break;
    }

    case 'toggle-anim': {
      const now = t.getAttribute('data-on') === '1';
      const next = !now;
      t.setAttribute('data-on', next ? '1' : '0');
      state.animEnabled = next;
      setAnimEnabled(next);
      localStorage.setItem('animEnabled', next ? '1' : '0');
      break;
    }

    case 'pick-launch-style': {
      const v = t.getAttribute('data-val');
      if (v === state.launchStyle) return;
      state.launchStyle = v;
      await setSetting('launchStyle', v);
      rootRef.querySelectorAll('[data-act="pick-launch-style"]').forEach(el => {
        el.setAttribute('data-on', el.getAttribute('data-val') === v ? '1' : '0');
      });
      haptic(6);
      toast('启动动画已更改，下次进入时生效');
      break;
    }

    case 'toggle-mute': {
      const now = t.getAttribute('data-on') === '1';
      const next = !now;
      t.setAttribute('data-on', next ? '1' : '0');
      state.soundCfg.muted = next;
      await sound.saveConfig({ muted: next });
      break;
    }

    case 'pick-builtin': {
      const v = t.getAttribute('data-val');
      state.soundCfg.builtin = v;
      await sound.saveConfig({ builtin: v });
      rootRef.querySelectorAll('[data-act="pick-builtin"]').forEach(el => {
        el.setAttribute('data-on', el.getAttribute('data-val') === v ? '1' : '0');
      });
      // 同步栈内 unlock，然后 preview
      await sound.unlock();
      sound.preview(v);
      break;
    }

    case 'preview-custom': {
      await sound.unlock();
      if (state.soundCfg.customUrl) sound.preview('custom', state.soundCfg.customUrl);
      break;
    }

    case 'clear-custom': {
      state.soundCfg.customUrl = null;
      await sound.saveConfig({ customUrl: null });
      refreshSoundSection();
      toast('已移除自定义音');
      break;
    }

    case 'preview-current': {
      await sound.unlock();
      const c = state.soundCfg;
      if (c.muted) { toast('当前处于静音'); return; }
      if (c.customUrl) sound.preview('custom', c.customUrl);
      else sound.preview(c.builtin || 'bell');
      break;
    }

    case 'toggle-keepalive': {
      const now = t.getAttribute('data-on') === '1';
      const next = !now;
      t.setAttribute('data-on', next ? '1' : '0');
      state.keepAliveOn = next;
      await keepAlive.saveEnabled(next);
      if (next) await keepAlive.start();
      else keepAlive.stop();
      break;
    }

    case 'toggle-eye': {
      state.aiKeyRevealed = !state.aiKeyRevealed;
      refreshAISection();
      break;
    }

    case 'fetch-models': {
      await handleFetchModels();
      break;
    }

    case 'pick-model': {
      const m = t.getAttribute('data-val');
      state.ai.model = m;
      await setSetting('ai.model', m);
      rootRef.querySelectorAll('[data-act="pick-model"]').forEach(el => {
        el.setAttribute('data-on', el.getAttribute('data-val') === m ? '1' : '0');
      });
      const val = rootRef.querySelector('[data-section="ai"] .row-header .row-value');
      if (val) val.textContent = m;
      toast('已选择模型');
      break;
    }

    case 'export-data':
      await handleExport();
      break;
    case 'import-data':
      await handleImport();
      break;
    case 'wipe-data':
      await handleWipe();
      break;
  }
}

async function onMainChange(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'upload-custom') {
    const f = t.files && t.files[0];
    if (!f) return;
    try {
      const dataUrl = await fileToDataURL(f);
      state.soundCfg.customUrl = dataUrl;
      await sound.saveConfig({ customUrl: dataUrl });
      refreshSoundSection();
      toast('已设置自定义音');
    } catch (err) {
      toast('音频读取失败');
    }
  }
}

async function onMainInput(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'vol') {
    const v = Number(t.value) / 100;
    state.soundCfg.volume = v;
    const txt = rootRef.querySelector('[data-role="vol-text"]');
    if (txt) txt.textContent = Math.round(v * 100) + '%';
    // 节流保存
    clearTimeout(state._volTimer);
    state._volTimer = setTimeout(() => sound.saveConfig({ volume: v }), 200);
  }
}

/* ---------- AI 拉取模型 ---------- */

async function handleFetchModels() {
  const baseUrl = state.ai.baseUrl.trim();
  const apiKey  = state.ai.apiKey.trim();
  if (!baseUrl) { toast('请填写 Base URL'); return; }
  if (!apiKey)  { toast('请填写 API Key'); return; }

  state.aiFetching = true;
  refreshAISection();

  try {
    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    const list = Array.isArray(json.data) ? json.data.map(m => m.id).filter(Boolean) : [];
    if (!list.length) throw new Error('返回中没有 data 列表');
    list.sort();
    state.ai.models = list;
    await setSetting('ai.models', list);
    // 若当前 model 不在新列表里，保留原值不清空（有的接口分页可能不返回全部）
    toast(`已获取 ${list.length} 个模型`);
  } catch (err) {
    toast('拉取失败：' + (err.message || '未知错误'));
  } finally {
    state.aiFetching = false;
    refreshAISection();
  }
}

/* ---------- 数据管理 ---------- */

async function handleExport() {
  const tables = ['user', 'characters', 'conversations', 'messages', 'decks', 'statusPool', 'divinationHistory', 'settings'];
  const data = {};
  for (const t of tables) {
    try { data[t] = await db.table(t).toArray(); } catch { data[t] = []; }
  }
  const payload = { version: 1, exportedAt: Date.now(), data };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadJSON(`unrequited-backup-${stamp}.json`, payload);
  toast('已导出');
}

async function handleImport() {
  const ok1 = await confirmSheet('导入将覆盖当前所有数据，是否继续？', { danger: true, okText: '继续' });
  if (!ok1) return;

  const file = await pickFile('application/json,.json');
  if (!file) return;

  let json;
  try {
    const text = await file.text();
    json = JSON.parse(text);
  } catch {
    toast('文件解析失败');
    return;
  }
  if (!json || !json.version || !json.data) {
    toast('不是有效的备份文件');
    return;
  }

  try {
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) {
        await t.clear();
        const rows = json.data[t.name];
        if (Array.isArray(rows) && rows.length) {
          await t.bulkAdd(rows);
        }
      }
    });
    toast('导入完成，即将刷新');
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    toast('导入失败：' + (err.message || '未知'));
  }
}

async function handleWipe() {
  const ok1 = await confirmSheet('确认清空所有数据？此操作无法恢复。', { danger: true, okText: '继续' });
  if (!ok1) return;
  const ok2 = await confirmSheet('再次确认：所有角色、字卡库、对话记录、设置都会被删除。', { danger: true, okText: '清空' });
  if (!ok2) return;

  try {
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) await t.clear();
    });
    toast('已清空，即将刷新');
    setTimeout(() => {
      location.hash = '#/';
      location.reload();
    }, 800);
  } catch (err) {
    toast('清空失败：' + (err.message || '未知'));
  }
}

/* ---------- 辅助 ---------- */

function refreshSoundSection() {
  const sec = rootRef.querySelector('[data-section="sound"]');
  if (!sec) return;
  sec.outerHTML = renderSoundSection();
  rebindMain();
}

function refreshAISection() {
  const sec = rootRef.querySelector('[data-section="ai"]');
  if (!sec) return;
  sec.outerHTML = renderAISection();
  rebindMain();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(f || null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

function chev() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}
function eye() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function eyeOff() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.77 19.77 0 0 1-2.16 3.19M6.71 6.71a3 3 0 1 0 4.24 4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

/* ---------- 页面 CSS ---------- */

function pageCSS() {
  return `
    .settings-page { min-height: 100vh; min-height: 100dvh;
      padding: 0 16px;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
      animation: fadeInPlain 0.4s ease; }
    .settings-header { position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0;
      padding-top: calc(8px + env(safe-area-inset-top));
      background: var(--color-bg-primary); }
    .nav-btn { width: 40px; height: 40px; display: inline-flex;
      align-items: center; justify-content: center;
      color: var(--color-text-secondary); border-radius: 999px; }
    .nav-btn:active { color: var(--color-text-primary); }
    .nav-btn-placeholder { width: 40px; height: 40px; }
    .settings-title { font-size: 14px; letter-spacing: 6px; color: var(--color-text-primary); }
    .settings-main { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; }
    .settings-bottom-space { height: 40px; }

    .settings-section { background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 16px; overflow: hidden; }
    .section-title { padding: 14px 16px 6px; font-size: 10px; letter-spacing: 4px;
      color: var(--color-text-tertiary); }
    .section-desc { padding: 4px 16px 14px; font-size: 12px;
      color: var(--color-text-tertiary); line-height: 1.7; letter-spacing: 0.5px; }

    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 16px; min-height: 44px; background: transparent; text-align: left; width: 100%; }
    .row + .row { border-top: 1px solid var(--color-border); }
    .row-btn { cursor: pointer; }
    .row-btn:active { background: var(--color-bg-tertiary); }
    .row-vertical { flex-direction: column; align-items: stretch; gap: 8px; }
    .row-vertical .row-header { display: flex; justify-content: space-between; align-items: center; }
    .row-label { font-size: 14px; color: var(--color-text-primary); }
    .row-value { font-size: 12px; color: var(--color-text-secondary); max-width: 60%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-chev { color: var(--color-text-tertiary); flex-shrink: 0; }

    .switch { position: relative; width: 44px; height: 26px; flex-shrink: 0;
      border-radius: 999px; background: var(--color-bg-tertiary);
      transition: background 0.2s; cursor: pointer; }
    .switch[data-on="1"] { background: var(--color-accent); }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px;
      width: 20px; height: 20px; border-radius: 999px; background: #fff;
      transition: transform 0.22s cubic-bezier(.5,.05,.1,1);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .switch[data-on="1"]::after { transform: translateX(18px); }

    .slider { width: 100%; -webkit-appearance: none; appearance: none;
      height: 3px; background: var(--color-border); border-radius: 999px; outline: none; }
    .slider::-webkit-slider-thumb { -webkit-appearance: none;
      width: 18px; height: 18px; border-radius: 999px;
      background: var(--color-accent); cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
    .slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 999px;
      background: var(--color-accent); border: none; }

    .chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 16px 12px; }
    .chips.inline { padding: 0; }
    .chip { padding: 6px 14px; border-radius: 999px; font-size: 12px;
      color: var(--color-text-secondary);
      background: var(--color-bg-tertiary);
      border: 1px solid transparent; cursor: pointer;
      transition: color 0.15s, border-color 0.15s; }
    .chip[data-on="1"] { color: var(--color-accent); border-color: var(--color-accent); }
    .chip:active { opacity: 0.75; }

    .theme-grid { display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px; padding: 4px 16px 14px; }
    .theme-cell { position: relative; padding: 8px 6px; border-radius: 12px;
      border: 1px solid var(--color-border);
      background: var(--color-bg-tertiary); cursor: pointer;
      display: flex; flex-direction: column; align-items: stretch; gap: 6px;
      transition: border-color 0.15s, transform 0.15s; }
    .theme-cell[data-on="1"] { border-color: var(--color-accent); }
    .theme-cell:active { transform: scale(0.97); }
    .theme-preview { width: 100%; aspect-ratio: 3/2; border-radius: 6px;
      position: relative; overflow: hidden; }
    .pv-bubble { position: absolute; height: 26%; border-radius: 6px; }
    .pv-user { width: 40%; right: 8%; top: 20%; border-bottom-right-radius: 2px; }
    .pv-char { width: 45%; left: 8%; top: 55%; border-bottom-left-radius: 2px; }
    .theme-name { font-size: 10px; letter-spacing: 2px;
      color: var(--color-text-primary); text-align: center; }

    .input-row { display: flex; flex-direction: column; gap: 6px; padding: 10px 16px; }
    .input-row + .input-row { border-top: 1px solid var(--color-border); }
    .input-label { font-size: 10px; letter-spacing: 3px; color: var(--color-text-tertiary); }
    .input-field { display: flex; align-items: center; gap: 6px;
      background: var(--color-bg-tertiary);
      border-radius: 10px; padding: 8px 12px; }
    .input-field input { flex: 1; background: transparent;
      color: var(--color-text-primary);
      font-size: 14px; border: none; outline: none;
      font-family: inherit; letter-spacing: 0.3px; }
    .input-field input::placeholder { color: var(--color-text-tertiary); }
    .eye-btn { display: inline-flex; padding: 4px;
      color: var(--color-text-tertiary); cursor: pointer; }

    .btn { display: inline-flex; align-items: center; justify-content: center;
      padding: 10px 16px; border-radius: 10px; font-size: 13px;
      color: var(--color-text-primary);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border); cursor: pointer;
      transition: opacity 0.15s; letter-spacing: 1px; }
    .btn:active { opacity: 0.7; }
    .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--color-accent);
      color: var(--color-bg-primary); border-color: transparent; }
    .btn-danger { color: #dc2626; border-color: rgba(220, 38, 38, 0.35); }
    .btn-full { width: 100%; }
    .btn-inline { padding: 8px 14px; font-size: 12px; }
    .btn-row { display: flex; gap: 8px; padding: 4px 16px 14px; }

    .custom-audio { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .custom-audio-name { font-size: 13px; color: var(--color-text-secondary); }
    .custom-audio-actions { display: flex; gap: 8px; }

    .user-row { display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; cursor: pointer; text-align: left; width: 100%;
      background: transparent; }
    .user-row:active { background: var(--color-bg-tertiary); }
    .user-avatar { width: 48px; height: 48px; border-radius: 999px;
      overflow: hidden; background: var(--color-bg-tertiary);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .user-avatar img, .user-avatar svg { width: 100%; height: 100%; }
    .user-info { flex: 1; min-width: 0; }
    .user-name { font-size: 15px; color: var(--color-text-primary); }
    .user-sub { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;
}
