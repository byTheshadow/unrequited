import { db } from '../db.js';
import { navigate, goBack } from '../router.js';
import {
  ICON, escapeHtml, escapeAttr, haptic, toast,
  openSheet, confirmSheet, readFileAsText, downloadJSON,
} from '../utils.js';

let currentCategory = 'all';
let detailSortMode = 'time'; // 'time' | 'resonance' (共鸣频次)
let activeDeckId = null; // 当前处于二级详情页的字卡库ID，null表示在列表页

// 星芒 SVG 图标
const SVG_STAR = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l2.4 7.2L22 10l-5.6 4.8L18 22l-6-4.5L6 22l1.6-7.2L2 10l7.6-.8z"/></svg>`;

async function loadDecks() {
  return db.decks.orderBy('createdAt').reverse().toArray();
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

// 刷新主逻辑
async function refresh(root) {
  if (activeDeckId) {
    await renderDetailView(root, activeDeckId);
  } else {
    await renderListView(root);
  }
}

/* ==================== 一级页面：字卡库列表 ==================== */

async function renderListView(root) {
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
          refresh(root);
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

  listWrap.innerHTML = renderListHTML(filtered);
  bindListRowEvents(root);
}

function renderListHTML(list) {
  if (!list.length) {
    const isFiltered = currentCategory !== 'all';
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${ICON.deck}</div>
        <div class="empty-state-title">${isFiltered ? '分类下无内容' : '还没有字卡库'}</div>
        <div class="empty-state-sub">${isFiltered ? '可以新建该分类下的字卡库' : '点击右下角加号创建字卡库'}</div>
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
            <button class="row-icon-btn" data-act="delete" data-id="${d.id}" aria-label="删除">${ICON.trash}</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function bindListRowEvents(root) {
  document.querySelectorAll('.deck-list .list-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      const id = Number(row.getAttribute('data-id'));
      haptic(6);
      activeDeckId = id;
      refresh(root);
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
      refresh(root);
    });
  });
}

/* ==================== 二级页面：日记手记详情流 ==================== */

async function renderDetailView(root, deckId) {
  const deck = await db.decks.get(deckId);
  if (!deck) {
    activeDeckId = null;
    refresh(root);
    return;
  }

  // 补全 stats 数据结构
  const stats = deck.fragmentStats || {};
  const frags = deck.fragments || [];

  // 组装带统计信息的临时碎片列表
  const fragItems = frags.map((text, idx) => {
    const itemStat = stats[text] || { usageCount: 0, createdAt: deck.createdAt + idx };
    return { text, usageCount: itemStat.usageCount || 0, createdAt: itemStat.createdAt || deck.createdAt };
  });

  // 排序
  if (detailSortMode === 'resonance') {
    // 共鸣次数降序，次数相同按时间降序
    fragItems.sort((a, b) => b.usageCount - a.usageCount || b.createdAt - a.createdAt);
  } else {
    // 时间降序
    fragItems.sort((a, b) => b.createdAt - a.createdAt);
  }

  // 绑定角色名称
  let bindCharName = '通用';
  if (deck.bindCharacterId) {
    const char = await db.characters.get(deck.bindCharacterId);
    if (char) bindCharName = `绑定角色：${char.name}`;
  }

  root.innerHTML = `
    <div class="page deck-detail-page">
      <div class="top-bar">
        <button class="top-bar-btn" data-act="back-to-list" aria-label="返回列表">${ICON.back}</button>
        <div class="top-bar-title" style="letter-spacing:1px;">${escapeHtml(deck.name)}</div>
        <button class="top-bar-btn" data-act="deck-setting" aria-label="设置">${ICON.more}</button>
      </div>

      <div class="detail-info-bar">
        <span class="detail-subtitle">${escapeHtml(bindCharName)}</span>
        <div class="detail-sort-selector">
          <button class="sort-tab ${detailSortMode === 'time' ? 'active' : ''}" data-sort="time">时间</button>
          <button class="sort-tab ${detailSortMode === 'resonance' ? 'active' : ''}" data-sort="resonance">共鸣</button>
        </div>
      </div>

      <div class="detail-cards-container">
        ${fragItems.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon" style="opacity:0.3;">✦</div>
            <div class="empty-state-title">星空中空无一物</div>
            <div class="empty-state-sub">点击右下角写入第一句手记碎片</div>
          </div>
        ` : fragItems.map((item) => {
            const count = item.usageCount;
            // 计算星芒的发光等级
            let glowClass = 'glow-none';
            if (count > 0 && count <= 3) glowClass = 'glow-weak';
            else if (count > 3 && count <= 8) glowClass = 'glow-medium';
            else if (count > 8) glowClass = 'glow-strong';

            return `
              <div class="frag-dream-card" data-text="${escapeAttr(item.text)}">
                <div class="frag-card-content">${escapeHtml(item.text)}</div>
                <div class="frag-card-footer">
                  <span class="frag-resonance-star ${glowClass}">${SVG_STAR}</span>
                  <span class="frag-resonance-count">${count > 0 ? `共鸣 ${count} 次` : '未共鸣'}</span>
                </div>
              </div>
            `;
        }).join('')}
      </div>

      <button class="fab" data-act="write-single" aria-label="写入手记">${ICON.plus}</button>

      <style>
        .deck-detail-page { min-height: 100vh; padding-bottom: 100px; background: radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.05) 0%, transparent 70%); }
        .detail-info-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px 4px; }
        .detail-subtitle { font-size: 11px; color: var(--color-text-tertiary); letter-spacing: 1px; }
        
        /* 排序页签 */
        .detail-sort-selector { display: flex; background: var(--color-bg-secondary); padding: 2px; border-radius: 12px; border: 1px solid var(--color-border); }
        .sort-tab { border: none; background: none; color: var(--color-text-secondary); padding: 4px 10px; font-size: 11px; border-radius: 9px; cursor: pointer; transition: all 0.2s; }
        .sort-tab.active { background: var(--color-accent); color: var(--color-bg-primary); font-weight: 500; }

        /* 梦幻卡片流容器 */
        .detail-cards-container { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 16px 20px; }

        /* 灵动梦幻卡片 */
        .frag-dream-card {
          position: relative;
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 14px;
          padding: 18px 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          cursor: pointer;
        }
        .frag-dream-card:active {
          transform: scale(0.98);
          border-color: rgba(139, 92, 246, 0.2);
          box-shadow: 0 4px 24px rgba(139, 92, 246, 0.1);
        }
        .frag-card-content {
          font-size: 14px;
          line-height: 1.6;
          letter-spacing: 1.5px;
          color: var(--color-text-primary);
          word-break: break-all;
          margin-bottom: 12px;
        }
        .frag-card-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: var(--color-text-tertiary);
          letter-spacing: 1px;
        }

        /* 星芒光晕等级 */
        .frag-resonance-star { display: inline-flex; align-items: center; justify-content: center; transition: all 0.3s; }
        .frag-resonance-star.glow-none { color: rgba(255,255,255,0.15); }
        .frag-resonance-star.glow-weak { color: #d97706; filter: drop-shadow(0 0 2px rgba(217,119,6,0.5)); }
        .frag-resonance-star.glow-medium { color: #f59e0b; filter: drop-shadow(0 0 5px rgba(245,158,11,0.8)); }
        .frag-resonance-star.glow-strong { color: var(--color-accent); filter: drop-shadow(0 0 8px var(--color-accent)); animation: pulseStar 3s infinite ease-in-out; }

        @keyframes pulseStar {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      </style>
    </div>
  `;

  // 绑定事件
  root.querySelector('[data-act=back-to-list]').onclick = () => {
    haptic(6);
    activeDeckId = null;
    refresh(root);
  };

  root.querySelector('[data-act=deck-setting]').onclick = () => {
    haptic(6);
    openDeckSettingSheet(root, deckId);
  };

  root.querySelector('[data-act=write-single]').onclick = () => {
    haptic(8);
    openSingleWriteSheet(root, deckId);
  };

  root.querySelectorAll('.sort-tab').forEach((tab) => {
    tab.onclick = () => {
      haptic(4);
      detailSortMode = tab.getAttribute('data-sort');
      refresh(root);
    };
  });

  root.querySelectorAll('.frag-dream-card').forEach((card) => {
    card.onclick = () => {
      haptic(6);
      const text = card.getAttribute('data-text');
      openSingleEditSheet(root, deckId, text);
    };
  });
}

/* ==================== 快捷写单条 / 编辑单条 ==================== */

// 单条写入
function openSingleWriteSheet(root, deckId) {
  const body = `
    <div class="field">
      <label class="field-label">手记碎片</label>
      <textarea class="textarea" id="s-text" placeholder="写下这一刻的碎碎念手记..." rows="3"></textarea>
    </div>
  `;

  const { close } = openSheet({
    title: '写入新碎片',
    body,
    actions: `
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-primary" data-act="save">写入</button>
    `,
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');
  sheetRoot.querySelector('[data-act=cancel]').onclick = () => close();
  sheetRoot.querySelector('[data-act=save]').onclick = async () => {
    const text = sheetRoot.querySelector('#s-text').value.trim();
    if (!text) { toast('内容不能为空'); return; }

    const deck = await db.decks.get(deckId);
    if (!deck) return;

    if (deck.fragments.includes(text)) {
      toast('此碎片已在字卡库中');
      return;
    }

    const newFrags = [...deck.fragments, text];
    const stats = deck.fragmentStats || {};
    stats[text] = { usageCount: 0, createdAt: Date.now() };

    await db.decks.update(deckId, {
      fragments: newFrags,
      fragmentStats: stats
    });

    toast('已写入');
    close();
    refresh(root);
  };
}

// 单条修改/编辑
function openSingleEditSheet(root, deckId, originalText) {
  const body = `
    <div class="field">
      <label class="field-label">修改手记碎片</label>
      <textarea class="textarea" id="s-edit-text" rows="3">${escapeHtml(originalText)}</textarea>
    </div>
  `;

  const { close } = openSheet({
    title: '手记详情',
    body,
    actions: `
      <button class="btn btn-danger" data-act="delete-single" style="margin-right:auto; padding:10px 14px;">删除</button>
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-primary" data-act="save">保存</button>
    `,
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');
  sheetRoot.querySelector('[data-act=cancel]').onclick = () => close();

  // 删除单条
  sheetRoot.querySelector('[data-act=delete-single]').onclick = async () => {
    close();
    const ok = await confirmSheet('删除此条碎片？', { danger: true, okText: '删除' });
    if (!ok) return;

    const deck = await db.decks.get(deckId);
    if (!deck) return;

    const newFrags = deck.fragments.filter(f => f !== originalText);
    const stats = deck.fragmentStats || {};
    delete stats[originalText];

    await db.decks.update(deckId, {
      fragments: newFrags,
      fragmentStats: stats
    });

    toast('已删除');
    refresh(root);
  };

  // 修改单条
  sheetRoot.querySelector('[data-act=save]').onclick = async () => {
    const text = sheetRoot.querySelector('#s-edit-text').value.trim();
    if (!text) { toast('内容不能为空'); return; }

    const deck = await db.decks.get(deckId);
    if (!deck) return;

    let newFrags = [...deck.fragments];
    const stats = deck.fragmentStats || {};

    if (originalText !== text) {
      if (deck.fragments.includes(text)) {
        toast('新内容与已有碎片重复');
        return;
      }
      // 替换原项
      const idx = newFrags.indexOf(originalText);
      if (idx !== -1) {
        newFrags[idx] = text;
      } else {
        newFrags.push(text);
      }
      
      // 迁移统计属性并删除旧项
      const oldStat = stats[originalText] || { usageCount: 0, createdAt: Date.now() };
      stats[text] = {
        usageCount: oldStat.usageCount,
        createdAt: oldStat.createdAt
      };
      delete stats[originalText];
    }

    await db.decks.update(deckId, {
      fragments: newFrags,
      fragmentStats: stats
    });

    toast('已保存');
    close();
    refresh(root);
  };
}

/* ==================== 原版功能：批量设置 / 导入 / 导出 ==================== */

async function openDeckSettingSheet(root, deckId) {
  const deck = await db.decks.get(deckId);
  if (!deck) return;

  const characters = await db.characters.orderBy('createdAt').toArray();

  const body = `
    <div class="editor-form">
      <div class="field">
        <label class="field-label">字卡库名称</label>
        <input class="input" id="d-name" placeholder="例如：日常问候" maxlength="60" value="${escapeAttr(deck.name || '')}">
      </div>

      <div class="field">
        <label class="field-label">分类标签</label>
        <input class="input" id="d-category" placeholder="例如：日常、深夜、共时" maxlength="20" value="${escapeAttr(deck.category || '')}">
      </div>

      <div class="field">
        <label class="field-label">绑定角色</label>
        <select class="select" id="d-bind">
          <option value="">通用（未绑定）</option>
          ${characters.map((c) => `
            <option value="${c.id}" ${deck.bindCharacterId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>
          `).join('')}
        </select>
      </div>

      <div class="field">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label class="field-label">批量操作 (文本框导入)</label>
          <span class="chip" id="frag-count">${(deck.fragments || []).length} 条</span>
        </div>
        <textarea class="textarea" id="d-frags" placeholder="一行一条，直接粘贴进行批量覆盖" spellcheck="false">${escapeHtml((deck.fragments || []).join('\n'))}</textarea>
        <div class="field-hint">直接修改此处内容，保存后将完整覆盖原有字卡（去重并保留匹配项的频次统计）</div>
      </div>

      <div class="field">
        <label class="field-label">外部导入</label>
        <input type="file" id="import-file" accept=".json,.txt,application/json,text/plain" hidden>
        <div class="row-2col">
          <button class="btn btn-secondary" data-act="import-json">导入 JSON</button>
          <button class="btn btn-secondary" data-act="import-txt">导入 TXT</button>
        </div>
      </div>
      
      <div class="field" style="margin-top:16px;">
        <button class="btn btn-secondary btn-block" data-act="export-json">导出此字卡库 (.json)</button>
      </div>
    </div>
  `;

  const { close } = openSheet({
    title: '字卡库高级配置',
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
  const fileInput = sheetRoot.querySelector('#import-file');

  // 原有导入导出行为
  let importMode = 'json';
  sheetRoot.querySelector('[data-act="import-json"]').addEventListener('click', () => {
    importMode = 'json';
    fileInput.accept = '.json,application/json';
    fileInput.click();
  });
  sheetRoot.querySelector('[data-act="import-txt"]').addEventListener('click', () => {
    importMode = 'txt';
    fileInput.accept = '.txt,text/plain';
    fileInput.click();
  });
  sheetRoot.querySelector('[data-act="export-json"]').addEventListener('click', () => {
    const payload = {
      deckName: deck.name,
      bindCharacter: null,
      category: deck.category || null,
      fragments: deck.fragments || [],
    };
    downloadJSON(`${deck.name || 'deck'}.json`, payload);
    toast('已导出');
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    try {
      const text = await readFileAsText(f);
      let incoming = [];
      if (importMode === 'json') {
        const j = JSON.parse(text);
        if (Array.isArray(j.fragments)) incoming = j.fragments;
        else if (j.fragments && typeof j.fragments === 'object') {
          incoming = [...(j.fragments.opener || []), ...(j.fragments.core || []), ...(j.fragments.closer || []), ...(j.fragments.standalone || [])];
        }
      } else {
        incoming = textToFragments(text);
      }
      const merged = dedup([...textToFragments(fragEl.value), ...incoming.map((s) => String(s).trim()).filter(Boolean)]);
      fragEl.value = merged.join('\n');
      toast(`成功导入并合并了 ${incoming.length} 条碎片`);
    } catch (e) {
      toast('导入失败：' + e.message);
    } finally {
      fileInput.value = '';
    }
  });

  sheetRoot.querySelector('[data-act="cancel"]').onclick = () => close();
  sheetRoot.querySelector('[data-act="save"]').onclick = async () => {
    const name = nameEl.value.trim();
    if (!name) { toast('请填写名称'); return; }
    
    const inputFrags = dedup(textToFragments(fragEl.value));
    const bindCharacterId = bindEl.value ? Number(bindEl.value) : null;
    const category = categoryEl.value.trim() || null;

    // 精细合并统计信息
    const oldStats = deck.fragmentStats || {};
    const newStats = {};
    inputFrags.forEach(f => {
      newStats[f] = oldStats[f] || { usageCount: 0, createdAt: Date.now() };
    });

    await db.decks.update(deckId, {
      name,
      bindCharacterId,
      category,
      fragments: inputFrags,
      fragmentStats: newStats
    });

    toast('配置已保存');
    close();
    refresh(root);
  };
}

// 快速新建（一级列表使用）
function openNewDeckCreator(root) {
  const body = `
    <div class="field">
      <label class="field-label">字卡库名称</label>
      <input class="input" id="new-d-name" placeholder="请输入名称..." maxlength="60">
    </div>
    <div class="field">
      <label class="field-label">分类标签 (可选)</label>
      <input class="input" id="new-d-cat" placeholder="日常、心情、共时等..." maxlength="20">
    </div>
  `;

  const { close } = openSheet({
    title: '新建字卡库',
    body,
    actions: `
      <button class="btn btn-ghost" data-act="cancel">取消</button>
      <button class="btn btn-primary" data-act="create">创建</button>
    `
  });

  const sheetRoot = document.querySelector('.sheet-backdrop:last-of-type');
  sheetRoot.querySelector('[data-act=cancel]').onclick = () => close();
  sheetRoot.querySelector('[data-act=create]').onclick = async () => {
    const name = sheetRoot.querySelector('#new-d-name').value.trim();
    const category = sheetRoot.querySelector('#new-d-cat').value.trim() || null;
    if (!name) { toast('请输入名称'); return; }

    const newId = await db.decks.add({
      name,
      category,
      bindCharacterId: null,
      fragments: [],
      fragmentStats: {},
      createdAt: Date.now()
    });

    toast('创建成功');
    close();
    // 自动进入新创建的详情页
    activeDeckId = newId;
    refresh(root);
  };
}

/* ==================== 渲染入口 ==================== */

export async function render(root, params = {}) {
  // 重设页面主结构
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
          color: var(--color-bg-primary);
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

  // 初始化状态
  activeDeckId = null;

  await refresh(root);

  root.querySelector('[data-act=back]').onclick = () => { haptic(6); goBack('/cards'); };
  root.querySelector('[data-act=new]').onclick = () => { haptic(8); openNewDeckCreator(root); };

  if (params.new === '1') openNewDeckCreator(root);
}

export function destroy() {}
