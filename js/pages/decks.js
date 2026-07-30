import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, escapeHtml, escapeAttr, haptic, toast,
  openSheet, confirmSheet, readFileAsText, downloadJSON,
} from '../utils.js';

let currentCategory = 'all';

async function loadDecks() {
  return db.decks.orderBy('createdAt').reverse().toArray();
}

function fragmentsToText(fragments) {
  return (fragments || []).join('\n');
}

function textToFragments(text) {
  return text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  arr.forEach((s) => {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  });
  return out;
}

async function refresh() {
  const filterWrap = document.getElementById('deck-filter-wrap');
  const listWrap = document.getElementById('deck-list-wrap');
  if (!listWrap) return;

  const list = await loadDecks();
  const categories = Array.from(new Set(list.map((d) => d.category).filter(Boolean)));

  if (currentCategory !== 'all' && currentCategory !== 'none' && !categories.includes(currentCategory)) {
    currentCategory = 'all';
  }

  if (filterWrap) {
    if (categories.length === 0) {
      filterWrap.innerHTML = '';
    } else {
      filterWrap.innerHTML = `
        <div class="deck-filter-bar">
          <button class="filter-chip ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">全部</button>
          <button class="filter-chip ${currentCategory === 'none' ? 'active' : ''}" data-cat="none">未分类</button>
          ${categories.map((cat) => `
            <button class="filter-chip ${currentCategory === cat ? 'active' : ''}" data-cat="${escapeAttr(cat)}">${escapeHtml(cat)}</button>
          `).join('')}
        </div>
      `;
      filterWrap.querySelectorAll('.filter-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          haptic(4);
          currentCategory = btn.getAttribute('data-cat');
          refresh();
        });
      });
    }
  }

  let filtered = list;
  if (currentCategory === 'none') {
    filtered = list.filter((d) => !d.category);
  } else if (currentCategory !== 'all') {
    filtered = list.filter((d) => d.category === currentCategory);
  }

  listWrap.innerHTML = renderList(filtered);
  bindRowEvents();
}

function renderList(list) {
  if (!list.length) {
    const isFiltered = currentCategory !== 'all';
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${ICON.deck}</div>
        <div class="empty-state-title">${isFiltered ? '分类下无内容' : '还没有字卡库'}</div>
        <div class="empty-state-sub">${isFiltered ? '可以新建该分类下的字卡库<br>或者修改已有库的分类' : '点击右下角加号创建<br>一行一条，可粘贴大段文本'}</div>
      </div>
    `;
  }
  return `
    <ul class="deck-list">
      ${list.map((d) => `
        <li class="list-row" data-id="${d.id}">
          <div class="deck-icon">${ICON.deck}</div>
          <div class="list-row-body">
            <div class="list-row-title">${escapeHtml(d.name)}</div>
            <div class="list-row-sub">
              ${d.category ? `<span class="deck-category-tag">${escapeHtml(d.category)}</span>` : ''}
              ${(d.fragments || []).length} 条碎片
              ${d.bindCharacterId ? '　·　已绑定角色' : '　·　通用'}
            </div>
          </div>
          <div class="list-row-aside">
            <button class="row-icon-btn" data-act="export" data-id="${d.id}" aria-label="导出">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 8 12 3 17 8"/><path d="M5 21h14"/></svg>
            </button>
            <button class="row-icon-btn" data-act="delete" data-id="${d.id}" aria-label="删除">${ICON.trash}</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function bindRowEvents() {
  document.querySelectorAll('.deck-list .list-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      const id = Number(row.getAttribute('data-id'));
      openEditor(id);
    });
  });
  document.querySelectorAll('[data-act=export]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const d = await db.decks.get(id);
      if (!d) return;
      const payload = {
        deckName: d.name,
        bindCharacter: null,
        category: d.category || null,
        fragments: d.fragments || [],
      };
      downloadJSON(`${d.name || 'deck'}.json`, payload);
      toast('已导出');
    });
  });
  document.querySelectorAll('[data-act=delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.getAttribute('data-id'));
      const ok = await confirmSheet('删除此字卡库？绑定它的角色仍会保留', { danger: true, okText: '删除' });
      if (!ok) return;
      const chars = await db.characters.toArray();
      for (const c of chars) {
        if ((c.linkedDeckIds || []).includes(id)) {
          await db.characters.update(c.id, {
            linkedDeckIds: c.linkedDeckIds.filter((x) => x !== id),
          });
        }
      }
      await db.decks.delete(id);
      toast('已删除');
      refresh();
    });
  });
}

async function openEditor(deckId) {
  const isNew = !deckId;
  const deck = isNew
    ? { name: '', bindCharacterId: null, fragments: [], category: '' }
    : await db.decks.get(deckId);
  if (!deck) { toast('字卡库不存在'); return; }

  const characters = await db.characters.orderBy('createdAt').toArray();

  const body = `
    <div class="editor-form">
      <div class="field">
        <label class="field-label">字卡库名称</label>
        <input class="input" id="d-name" placeholder="例如：日常问候" maxlength="60" value="${escapeAttr(deck.name || '')}">
      </div>

      <div class="field">
        <label class="field-label">分类标签（可选）</label>
        <input class="input" id="d-category" placeholder="例如：日常、深夜、共时" maxlength="20" value="${escapeAttr(deck.category || '')}">
        <div class="field-hint">用于在字卡库列表页过滤和整理</div>
      </div>

      <div class="field">
        <label class="field-label">绑定角色（可选）</label>
        <select class="select" id="d-bind">
          <option value="">通用（未绑定）</option>
          ${characters.map((c) => `
            <option value="${c.id}" ${deck.bindCharacterId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
          `).join('')}
        </select>
        <div class="field-hint">通用库对所有未绑定字卡库的角色生效</div>
      </div>

      <div class="field">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label class="field-label">字卡内容</label>
          <span class="chip" id="frag-count">${(deck.fragments || []).length} 条</span>
        </div>
        <textarea class="textarea" id="d-frags" placeholder="一行一条，直接粘贴&#10;&#10;例如：&#10;早安&#10;吃饭了吗&#10;今天想你了" spellcheck="false">${escapeHtml(fragmentsToText(deck.fragments || []))}</textarea>
        <div class="field-hint">每行是一条独立碎片，保存时自动去除空行和重复项</div>
      </div>

      <div class="field">
        <label class="field-label">导入 / 追加</label>
        <input type="file" id="import-file" accept=".json,.txt,application/json,text/plain" hidden>
        <div class="row-2col">
          <button class="btn btn-secondary" data-act="import-json">导入 JSON</button>
          <button class="btn btn-secondary" data-act="import-txt">导入 TXT</button>
        </div>
        <div class="field-hint">JSON 支持标准模板 { deckName, fragments: [...] }；TXT 一行一条</div>
      </div>
    </div>
  `;

  const { close } = openSheet({
    title: isNew ? '新建字卡库' : '编辑字卡库',
    body,
    maxHeight: '92vh',
    actions: `
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-primary" data-act="save">保存</button>
    `,
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');
  const nameEl = sheetRoot.querySelector('#d-name');
  const categoryEl = sheetRoot.querySelector('#d-category');
  const bindEl = sheetRoot.querySelector('#d-bind');
  const fragEl = sheetRoot.querySelector('#d-frags');
  const countEl = sheetRoot.querySelector('#frag-count');
  const fileInput = sheetRoot.querySelector('#import-file');

  const updateCount = () => {
    const n = textToFragments(fragEl.value).length;
    countEl.textContent = `${n} 条`;
  };
  fragEl.addEventListener('input', updateCount);

  let importMode = 'json';
  sheetRoot.querySelector('[data-act=import-json]').addEventListener('click', () => {
    importMode = 'json';
    fileInput.accept = '.json,application/json';
    fileInput.click();
  });
  sheetRoot.querySelector('[data-act=import-txt]').addEventListener('click', () => {
    importMode = 'txt';
    fileInput.accept = '.txt,text/plain';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    try {
      const text = await readFileAsText(f);
      let incoming = [];
      let importedName = '';
      let importedCategory = '';
      if (importMode === 'json') {
        const j = JSON.parse(text);
        importedName = j.deckName || j.name || '';
        importedCategory = j.category || '';
        if (Array.isArray(j.fragments)) {
          incoming = j.fragments;
        } else if (j.fragments && typeof j.fragments === 'object') {
          incoming = [
            ...(j.fragments.opener || []),
            ...(j.fragments.core || []),
            ...(j.fragments.closer || []),
            ...(j.fragments.standalone || []),
          ];
        }
      } else {
        incoming = textToFragments(text);
      }
      const merged = dedup([...textToFragments(fragEl.value), ...incoming.map((s) => String(s).trim()).filter(Boolean)]);
      fragEl.value = merged.join('\n');
      if (importedName && !nameEl.value.trim()) nameEl.value = importedName;
      if (importedCategory && !categoryEl.value.trim()) categoryEl.value = importedCategory;
      updateCount();
      toast(`导入 ${incoming.length} 条，去重后共 ${merged.length} 条`, 2200);
    } catch (e) {
      toast('导入失败：' + (e.message || '格式错误'), 2600);
    } finally {
      fileInput.value = '';
    }
  });

  sheetRoot.querySelector('[data-act=cancel]').addEventListener('click', () => close());
  sheetRoot.querySelector('[data-act=save]').addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { toast('请填写名称'); return; }
    const fragments = dedup(textToFragments(fragEl.value));
    const bindCharacterId = bindEl.value ? Number(bindEl.value) : null;
    const category = categoryEl.value.trim() || null;
    const payload = { name, bindCharacterId, fragments, category };
    if (isNew) {
      await db.decks.add({ ...payload, createdAt: Date.now() });
    } else {
      await db.decks.update(deckId, payload);
    }
    toast(`已保存 ${fragments.length} 条`);
    close();
    refresh();
  });
}

export async function render(root, params = {}) {
  root.innerHTML = `
    <div class="page deck-page">
      <div class="top-bar">
        <button class="top-bar-btn" data-act="back" aria-label="返回">${ICON.back}</button>
        <div class="top-bar-title">字 卡 库</div>
        <span style="width:40px;"></span>
      </div>
      <div id="deck-filter-wrap"></div>
      <div id="deck-list-wrap"></div>
      <button class="fab" data-act="new" aria-label="新建字卡库">${ICON.plus}</button>
      <style>
        .deck-page { min-height: 100vh; padding-bottom: 100px; }
        .deck-list { list-style: none; }
        .deck-icon {
          width: 46px; height: 46px; border-radius: 50%;
          background: var(--color-bg-secondary);
          color: var(--color-accent);
          display: inline-flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .list-row-aside { flex-direction: row; gap: 4px; }
        
        .deck-filter-bar {
          display: flex;
          gap: 8px;
          padding: 12px 16px 4px 16px;
          overflow-x: auto;
          white-space: nowrap;
          scrollbar-width: none;
        }
        .deck-filter-bar::-webkit-scrollbar {
          display: none;
        }
        .filter-chip {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 13px;
          background: var(--color-bg-secondary);
          color: var(--color-text-secondary);
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .filter-chip.active {
          background: var(--color-accent);
          color: var(--color-bg);
          font-weight: 500;
        }
        .deck-category-tag {
          display: inline-block;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 10px;
          background: var(--color-bg-secondary);
          color: var(--color-accent);
          border: 1px solid var(--color-border);
          vertical-align: middle;
          margin-right: 6px;
        }
      </style>
    </div>
  `;

  await refresh();

  root.querySelector('[data-act=back]').addEventListener('click', () => { haptic(6); goBack('/cards'); });
  root.querySelector('[data-act=new]').addEventListener('click', () => { haptic(8); openEditor(null); });

  if (params.new === '1') openEditor(null);
}

export function destroy() {}
