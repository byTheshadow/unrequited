import { goBack } from '../../router.js';
import { toast, haptic, escapeHtml, sleep } from '../../utils.js';
import { db } from '../../db.js';

/* ============ 模块级引用 ============ */

let state = null;
let rootRef = null;
let purifyRAF = 0;
let purifyLastTs = 0;
let castRAF = 0;
let castLastTs = 0;
let meditationTimer = 0;
let purifyPress = null;
let castPress = null;

/* ============ 常量 ============ */

const PURIFY_HOLD_MS = 2400;
const MEDITATION_MS = 30000;
const CAST_HOLD_MS = 1000;
const SWIPE_THRESHOLD = 40;
const FAN_MAX_VISIBLE = 21;

const CARD_TYPES = [
  { id: 'tarot',     name: '塔  罗',    sub: '78 张 · 象征之语', symbol: 'tarot' },
  { id: 'lenormand', name: '雷 诺 曼',  sub: '36 张 · 直白之言', symbol: 'lenormand' },
  { id: 'astroDice', name: '占 星 骰',  sub: '3 骰 · 星轨落定',  symbol: 'dice' },
];

const FALLBACK_SPREADS = [
  {
    id: 'single', name: '单 牌', description: '当下最需要知道的那一句。',
    positions: [{ index: 1, name: '此刻', x: 50, y: 50 }],
  },
  {
    id: 'three', name: '三 牌 阵', description: '过去、现在与未来的流向。',
    positions: [
      { index: 1, name: '过去', x: 20, y: 50 },
      { index: 2, name: '现在', x: 50, y: 50 },
      { index: 3, name: '未来', x: 80, y: 50 },
    ],
  },
];

const FOCUS_OPTIONS = [
  { id: 'meaning', name: '解 读 牌 意', sub: '专注于牌本身的象征与讯息' },
  { id: 'message', name: '传 达 信 息', sub: '让 TA 借由牌面对你说些什么' },
];

const DICE_FALLBACK = {
  planets: [{ id: 'p_sun', name: '太阳', symbol: '☉' }],
  signs:   [{ id: 's_ari', name: '白羊', symbol: '♈' }],
  houses:  [{ id: 'h_01', name: '第一宫', number: '1' }],
};

const STEP_ORDER_CARD = ['purify', 'pickType', 'pickSpread', 'setIntent', 'shuffle', 'reveal', 'result'];
const STEP_ORDER_DICE = ['purify', 'pickType', 'setIntent', 'cast', 'result'];

/* ============ 生命周期 ============ */

export async function render(root) {
  rootRef = root;
  state = createInitialState();
  root.innerHTML = renderShell();
  attachGlobalListeners();
  renderStep();
  loadData();
}

export function destroy() {
  cancelAnimationFrame(purifyRAF);
  cancelAnimationFrame(castRAF);
  if (meditationTimer) { clearInterval(meditationTimer); meditationTimer = 0; }
  detachGlobalListeners();
  rootRef = null;
  state = null;
  purifyPress = null;
  castPress = null;
}

function createInitialState() {
  return {
    step: 'purify',
    dataLoaded: false,
    data: null,
    // 净化
    purifyMode: 'crystal',
    purifyCharge: 0,
    purifyDone: false,
    // 选类
    type: null,
    typeIndex: 1,
    // 选阵
    spread: null,
    spreadIndex: 0,
    spreads: FALLBACK_SPREADS.slice(),
    // 起意
    intentMode: 'question',
    question: '',
    meditationRemain: MEDITATION_MS / 1000,
    meditationDone: false,
    focus: 'meaning',
    // 洗牌抽牌
    deck: [],
    shuffled: false,
    shuffling: false,
    drawnFanIndices: new Set(),
    drawnCards: [],
    // 骰子
    diceCharge: 0,
    diceRolling: false,
    diceResult: null,
    historySaved: false,
  };
}

async function loadData() {
  const tryFetch = async (p) => {
    try { return await fetch(p).then(r => r.json()); }
    catch { return null; }
  };
  const [tarot, lenormand, astroDice, spreads] = await Promise.all([
    tryFetch('./data/tarot.json'),
    tryFetch('./data/lenormand.json'),
    tryFetch('./data/astroDice.json'),
    tryFetch('./data/spreads.json'),
  ]);
  if (!state) return;
  state.data = {
    tarot:     Array.isArray(tarot)     ? tarot     : [],
    lenormand: Array.isArray(lenormand) ? lenormand : [],
    astroDice: astroDice && typeof astroDice === 'object' ? astroDice : DICE_FALLBACK,
  };
  if (Array.isArray(spreads) && spreads.length) state.spreads = spreads;
  state.dataLoaded = true;
}

/* ============ Shell & 导航 ============ */

function renderShell() {
  return `
    <div class="div-page page">
      <button class="div-nav div-nav-back" data-act="nav-back" type="button" aria-label="返回">${iconBack()}</button>
      <button class="div-nav div-nav-restart" data-act="nav-restart" type="button" aria-label="重来">${iconRestart()}</button>
      <div class="div-step-label" data-role="step-label">净  化</div>
      <div class="div-stage" data-role="stage"></div>
      <div class="flash-overlay" data-role="flash"></div>
      <style>${pageCSS()}</style>
    </div>
  `;
}

function attachGlobalListeners() {
  rootRef.addEventListener('click', onRootClick);
}
function detachGlobalListeners() {
  if (rootRef) rootRef.removeEventListener('click', onRootClick);
}
function onRootClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.getAttribute('data-act');
  if (act === 'nav-back')    onNavBack();
  if (act === 'nav-restart') onNavRestart();
}

function currentStepOrder() {
  return state.type === 'astroDice' ? STEP_ORDER_DICE : STEP_ORDER_CARD;
}

function onNavBack() {
  haptic(6);
  const order = currentStepOrder();
  const idx = order.indexOf(state.step);
  if (idx <= 0) { goBack('/home'); return; }
  goTo(order[idx - 1]);
}

function onNavRestart() {
  haptic(8);
  const data = state.data;
  const dataLoaded = state.dataLoaded;
  const spreads = state.spreads;
  state = createInitialState();
  state.data = data;
  state.dataLoaded = dataLoaded;
  if (spreads && spreads.length) state.spreads = spreads;
  goTo('purify');
}

function goTo(step) {
  cancelAnimationFrame(purifyRAF);
  cancelAnimationFrame(castRAF);
  if (meditationTimer) { clearInterval(meditationTimer); meditationTimer = 0; }
  state.step = step;
  const stage = rootRef.querySelector('[data-role="stage"]');
  stage.classList.remove('is-enter');
  stage.classList.add('is-leave');
  setTimeout(() => {
    renderStep();
    stage.classList.remove('is-leave');
    stage.classList.add('is-enter');
  }, 220);
}

function renderStep() {
  const stage = rootRef.querySelector('[data-role="stage"]');
  const label = rootRef.querySelector('[data-role="step-label"]');
  const restart = rootRef.querySelector('.div-nav-restart');
  const labels = {
    purify: '净  化', pickType: '选  类', pickSpread: '设  阵',
    setIntent: '起  意', shuffle: '洗  牌', cast: '投  掷',
    reveal: '翻  牌', result: '解  读',
  };
  label.textContent = labels[state.step] || '';
  restart.style.opacity = state.step === 'purify' ? '0' : '1';
  restart.style.pointerEvents = state.step === 'purify' ? 'none' : 'auto';

  if      (state.step === 'purify')     renderPurify(stage);
  else if (state.step === 'pickType')   renderPickType(stage);
  else if (state.step === 'pickSpread') renderPickSpread(stage);
  else if (state.step === 'setIntent')  renderSetIntent(stage);
  else if (state.step === 'shuffle')    renderShuffle(stage);
  else if (state.step === 'cast')       renderCast(stage);
  else if (state.step === 'reveal')     renderReveal(stage);
  else if (state.step === 'result')     renderResult(stage);
}

/* ============ 步骤 1 · 净化 ============ */

function renderPurify(stage) {
  state.purifyCharge = 0;
  state.purifyDone = false;
  stage.innerHTML = `
    <div class="purify">
      <div class="purify-hint" data-role="purify-hint">
        ${state.purifyMode === 'crystal' ? '长  按  水  晶  ·  注  入  能  量' : '轻  触  水  晶  ·  散  出  光  雾'}
      </div>
      <div class="crystal-wrap" data-role="crystal">
        <svg class="crystal-glow" viewBox="0 0 200 200"><circle cx="100" cy="100" r="82"/></svg>
        <svg class="crystal-svg" viewBox="0 0 120 120" width="180" height="180">
          <defs>
            <linearGradient id="cg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="currentColor" stop-opacity="0.9"/>
              <stop offset="1" stop-color="currentColor" stop-opacity="0.25"/>
            </linearGradient>
          </defs>
          <polygon class="crystal-outer" points="60,10 100,35 100,85 60,110 20,85 20,35"
            fill="none" stroke="currentColor" stroke-width="1"/>
          <polygon class="crystal-inner" points="60,25 88,42 88,78 60,95 32,78 32,42"
            fill="url(#cg1)" stroke="currentColor" stroke-width="0.6"/>
          <line x1="60" y1="25" x2="60" y2="95" stroke="currentColor" stroke-width="0.4"/>
          <line x1="32" y1="42" x2="88" y2="78" stroke="currentColor" stroke-width="0.4"/>
          <line x1="88" y1="42" x2="32" y2="78" stroke="currentColor" stroke-width="0.4"/>
        </svg>
        <svg class="charge-ring" viewBox="0 0 120 120" width="220" height="220">
          <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>
          <circle class="charge-ring-fill" cx="60" cy="60" r="54" fill="none" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="339.29"
            transform="rotate(-90 60 60)"/>
        </svg>
        <div class="mist-layer" data-role="mist"></div>
      </div>
      <div class="purify-tabs">
        <button class="purify-tab" data-act="purify-mode" data-val="crystal"
          data-on="${state.purifyMode === 'crystal' ? '1' : '0'}" type="button">水  晶  充  能</button>
        <button class="purify-tab" data-act="purify-mode" data-val="mist"
          data-on="${state.purifyMode === 'mist' ? '1' : '0'}" type="button">光  雾  净  化</button>
      </div>
    </div>
  `;
  bindPurifyEvents(stage);
}

function bindPurifyEvents(stage) {
  stage.querySelectorAll('[data-act="purify-mode"]').forEach((t) => {
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.purifyDone) return;
      state.purifyMode = t.getAttribute('data-val');
      state.purifyCharge = 0;
      renderPurify(stage);
    });
  });
  const crystal = stage.querySelector('[data-role="crystal"]');
  crystal.addEventListener('pointerdown', (e) => {
    if (state.purifyDone) return;
    e.preventDefault();
    haptic(10);
    try { crystal.setPointerCapture(e.pointerId); } catch {}
    if (state.purifyMode === 'crystal') startCrystalCharge();
    else burstMist();
  });
  const onEnd = () => {
    if (state.purifyMode !== 'crystal' || state.purifyDone) return;
    cancelAnimationFrame(purifyRAF);
    purifyPress = null;
    const decay = () => {
      if (!state || state.step !== 'purify' || state.purifyDone) return;
      state.purifyCharge = Math.max(0, state.purifyCharge - 0.02);
      updateChargeRing();
      if (state.purifyCharge > 0) purifyRAF = requestAnimationFrame(decay);
    };
    purifyRAF = requestAnimationFrame(decay);
  };
  crystal.addEventListener('pointerup', onEnd);
  crystal.addEventListener('pointercancel', onEnd);
}

function startCrystalCharge() {
  purifyPress = { active: true };
  purifyLastTs = performance.now();
  cancelAnimationFrame(purifyRAF);
  const loop = (ts) => {
    if (!purifyPress || !purifyPress.active) return;
    const dt = ts - purifyLastTs;
    purifyLastTs = ts;
    state.purifyCharge = Math.min(1, state.purifyCharge + dt / PURIFY_HOLD_MS);
    updateChargeRing();
    if (state.purifyCharge >= 1) {
      purifyPress = null;
      completePurify();
      return;
    }
    purifyRAF = requestAnimationFrame(loop);
  };
  purifyRAF = requestAnimationFrame(loop);
}

function updateChargeRing() {
  const fill = rootRef.querySelector('.charge-ring-fill');
  if (!fill) return;
  const c = 2 * Math.PI * 54;
  fill.setAttribute('stroke-dashoffset', String(c * (1 - state.purifyCharge)));
  const crystal = rootRef.querySelector('.crystal-wrap');
  if (crystal) crystal.style.setProperty('--charge', state.purifyCharge.toFixed(3));
}

function burstMist() {
  const mist = rootRef.querySelector('[data-role="mist"]');
  if (!mist) return;
  mist.innerHTML = '';
  const N = 18;
  for (let i = 0; i < N; i++) {
    const angle = (Math.PI * 2 * i) / N + (Math.random() - 0.5) * 0.4;
    const dist = 90 + Math.random() * 60;
    const p = document.createElement('span');
    p.className = 'mist-particle';
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    p.style.setProperty('--delay', (Math.random() * 0.15) + 's');
    p.style.setProperty('--size', (6 + Math.random() * 10) + 'px');
    mist.appendChild(p);
  }
  const flash = rootRef.querySelector('[data-role="flash"]');
  if (flash) {
    flash.classList.remove('is-flash');
    void flash.offsetWidth;
    flash.classList.add('is-flash');
  }
  state.purifyCharge = 1;
  updateChargeRing();
  setTimeout(() => completePurify(), 900);
}

function completePurify() {
  if (state.purifyDone) return;
  state.purifyDone = true;
  haptic(24);
  const flash = rootRef.querySelector('[data-role="flash"]');
  if (flash) {
    flash.classList.remove('is-flash');
    void flash.offsetWidth;
    flash.classList.add('is-final');
  }
  const hint = rootRef.querySelector('[data-role="purify-hint"]');
  if (hint) hint.textContent = '心  已  静  ·  可  以  开  始';
  setTimeout(() => goTo('pickType'), 900);
}

/* ============ 步骤 2 · 选类 ============ */

function renderPickType(stage) {
  stage.innerHTML = `
    <div class="deck">
      <div class="deck-caption">选  择  你  想  倾  听  的  语  言</div>
      <div class="deck-stage" data-role="deck-stage">
        ${CARD_TYPES.map((c, i) => `
          <div class="deck-card" data-idx="${i}" data-type="${c.id}">
            <div class="deck-card-inner">
              <div class="deck-card-back">
                ${cardTotemSVG(c.symbol)}
                <div class="deck-card-title">${c.name}</div>
                <div class="deck-card-sub">${c.sub}</div>
              </div>
              <div class="deck-card-face">
                <div class="deck-card-title" style="color: var(--color-accent)">${c.name}</div>
                <div class="deck-card-sub">已  选  定</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="deck-dots" data-role="type-dots">
        ${CARD_TYPES.map((_, i) => `<span class="deck-dot" data-idx="${i}"></span>`).join('')}
      </div>
      <div class="deck-hint">左  右  滑  动  ·  轻  触  中  央  卡  以  确  认</div>
    </div>
  `;
  updateDeckPositions('.deck-card', CARD_TYPES.length, () => state.typeIndex, '[data-role="type-dots"]');
  bindSwiper(
    stage.querySelector('[data-role="deck-stage"]'),
    CARD_TYPES.length,
    () => state.typeIndex,
    (v) => {
      state.typeIndex = v;
      updateDeckPositions('.deck-card', CARD_TYPES.length, () => state.typeIndex, '[data-role="type-dots"]');
    },
    (cardEl) => confirmTypeCard(cardEl),
  );
  stage.querySelectorAll('[data-role="type-dots"] .deck-dot').forEach((d) => {
    d.addEventListener('click', () => {
      state.typeIndex = Number(d.getAttribute('data-idx'));
      updateDeckPositions('.deck-card', CARD_TYPES.length, () => state.typeIndex, '[data-role="type-dots"]');
      haptic(6);
    });
  });
}

function updateDeckPositions(cardSel, total, getIdx, dotsSel) {
  const idx = getIdx();
  rootRef.querySelectorAll(cardSel).forEach((c) => {
    const i = Number(c.getAttribute('data-idx'));
    const diff = i - idx;
    let pos = 'hidden';
    if (diff === -1) pos = 'prev';
    else if (diff === 0) pos = 'active';
    else if (diff === 1) pos = 'next';
    else pos = diff < 0 ? 'far-left' : 'far-right';
    c.setAttribute('data-pos', pos);
  });
  if (dotsSel) {
    rootRef.querySelectorAll(dotsSel + ' .deck-dot').forEach((d, i) => {
      d.setAttribute('data-on', i === idx ? '1' : '0');
    });
  }
}

function bindSwiper(container, total, getIdx, setIdx, onConfirm) {
  let start = null;
  let dragged = false;
  container.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, moved: false };
    dragged = false;
    try { container.setPointerCapture(e.pointerId); } catch {}
  });
  container.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 6) start.moved = true;
    container.style.setProperty('--drag', dx + 'px');
  });
  const onEnd = () => {
    if (!start) return;
    const dx = parseFloat(container.style.getPropertyValue('--drag')) || 0;
    container.style.setProperty('--drag', '0px');
    dragged = start.moved;
    start = null;
    if (dragged && Math.abs(dx) > SWIPE_THRESHOLD) {
      const dir = dx > 0 ? -1 : 1;
      const cur = getIdx();
      const next = Math.max(0, Math.min(total - 1, cur + dir));
      if (next !== cur) { setIdx(next); haptic(6); }
    }
  };
  container.addEventListener('pointerup', onEnd);
  container.addEventListener('pointercancel', onEnd);
  container.addEventListener('click', (e) => {
    if (dragged) { dragged = false; return; }
    const card = e.target.closest('.deck-card');
    if (!card) return;
    const i = Number(card.getAttribute('data-idx'));
    const cur = getIdx();
    if (i !== cur) { setIdx(i); haptic(6); return; }
    onConfirm(card);
  });
}

function confirmTypeCard(cardEl) {
  const type = cardEl.getAttribute('data-type');
  state.type = type;
  cardEl.classList.add('is-flipping');
  haptic(14);
  setTimeout(() => {
    if (type === 'astroDice') {
      state.spread = null;
      goTo('setIntent');
    } else {
      goTo('pickSpread');
    }
  }, 780);
}

/* ============ 步骤 3 · 选阵 ============ */

function renderPickSpread(stage) {
  const spreads = state.spreads;
  stage.innerHTML = `
    <div class="deck">
      <div class="deck-caption">为  这  次  提  问  选  一  个  牌  阵</div>
      <div class="deck-stage" data-role="deck-stage">
        ${spreads.map((s, i) => `
          <div class="deck-card spread-card" data-idx="${i}" data-spread="${s.id}">
            <div class="deck-card-inner">
              <div class="deck-card-back spread-back">
                <div class="spread-map">
                  ${(s.positions || []).map(p => `
                    <span class="spread-pt" style="left:${p.x}%;top:${p.y}%">
                      <em>${p.index}</em>
                    </span>
                  `).join('')}
                </div>
                <div class="deck-card-title">${escapeHtml(s.name)}</div>
                <div class="deck-card-sub spread-desc">${escapeHtml(s.description || '')}</div>
              </div>
              <div class="deck-card-face"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="deck-dots" data-role="spread-dots">
        ${spreads.map((_, i) => `<span class="deck-dot" data-idx="${i}"></span>`).join('')}
      </div>
      <button class="div-primary" data-act="confirm-spread" type="button">选  择  此  牌  阵</button>
    </div>
  `;
  updateDeckPositions('.spread-card', spreads.length, () => state.spreadIndex, '[data-role="spread-dots"]');
  bindSwiper(
    stage.querySelector('[data-role="deck-stage"]'),
    spreads.length,
    () => state.spreadIndex,
    (v) => {
      state.spreadIndex = v;
      updateDeckPositions('.spread-card', spreads.length, () => state.spreadIndex, '[data-role="spread-dots"]');
    },
    () => {},
  );
  stage.querySelectorAll('[data-role="spread-dots"] .deck-dot').forEach((d) => {
    d.addEventListener('click', () => {
      state.spreadIndex = Number(d.getAttribute('data-idx'));
      updateDeckPositions('.spread-card', spreads.length, () => state.spreadIndex, '[data-role="spread-dots"]');
      haptic(6);
    });
  });
  stage.querySelector('[data-act="confirm-spread"]').addEventListener('click', () => {
    state.spread = spreads[state.spreadIndex];
    haptic(10);
    goTo('setIntent');
  });
}

/* ============ 步骤 4 · 起意 ============ */

function renderSetIntent(stage) {
  const body = state.intentMode === 'question' ? renderIntentQuestion() : renderIntentMeditation();
  stage.innerHTML = `
    <div class="intent">
      <div class="intent-tabs">
        <button class="intent-tab" data-act="intent-mode" data-val="question"
          data-on="${state.intentMode === 'question' ? '1' : '0'}" type="button">写  下  问  题</button>
        <button class="intent-tab" data-act="intent-mode" data-val="meditation"
          data-on="${state.intentMode === 'meditation' ? '1' : '0'}" type="button">冥  想  开  始</button>
      </div>
      <div class="intent-body">${body}</div>
      <div class="intent-focus">
        <div class="intent-section-title">占  卜  师  侧  重  点</div>
        <div class="focus-list">
          ${FOCUS_OPTIONS.map(f => `
            <button class="focus-card" data-act="pick-focus" data-val="${f.id}"
              data-on="${state.focus === f.id ? '1' : '0'}" type="button">
              <div class="focus-name">${f.name}</div>
              <div class="focus-sub">${f.sub}</div>
            </button>
          `).join('')}
        </div>
      </div>
      <button class="div-primary intent-go" data-act="start-draw" type="button">开  始  抽  牌</button>
    </div>
  `;
  bindIntentEvents(stage);
  updateIntentGoState();
  if (state.intentMode === 'meditation' && !state.meditationDone) startMeditation();
}

function renderIntentQuestion() {
  return `
    <div class="intent-question">
      <div class="intent-hint">把  心  里  想  问  的  写  下  来</div>
      <textarea class="intent-textarea" data-role="question"
        placeholder="例如：我该继续等下去吗？" maxlength="240">${escapeHtml(state.question || '')}</textarea>
    </div>
  `;
}

function renderIntentMeditation() {
  const remain = Math.max(0, Math.ceil(state.meditationRemain));
  return `
    <div class="intent-meditation">
      <div class="breath-wrap">
        <div class="breath-ring"></div>
        <div class="breath-core"></div>
        <div class="breath-text">
          ${state.meditationDone ? '心  已  就  绪' : '跟  随  节  奏  ·  呼  吸'}
        </div>
      </div>
      <div class="meditation-remain" data-role="meditation-remain">
        ${state.meditationDone ? '' : `剩  余  ${remain}  秒`}
      </div>
    </div>
  `;
}

function bindIntentEvents(stage) {
  stage.querySelectorAll('[data-act="intent-mode"]').forEach((t) => {
    t.addEventListener('click', () => {
      const v = t.getAttribute('data-val');
      if (v === state.intentMode) return;
      state.intentMode = v;
      renderSetIntent(stage);
    });
  });
  const ta = stage.querySelector('[data-role="question"]');
  if (ta) {
    ta.addEventListener('input', () => {
      state.question = ta.value;
      updateIntentGoState();
    });
  }
  stage.querySelectorAll('[data-act="pick-focus"]').forEach((c) => {
    c.addEventListener('click', () => {
      state.focus = c.getAttribute('data-val');
      stage.querySelectorAll('[data-act="pick-focus"]').forEach(el => {
        el.setAttribute('data-on', el.getAttribute('data-val') === state.focus ? '1' : '0');
      });
      haptic(6);
    });
  });
  stage.querySelector('[data-act="start-draw"]').addEventListener('click', () => {
    if (!canStartDraw()) return;
    haptic(12);
    const next = state.type === 'astroDice' ? 'cast' : 'shuffle';
    goTo(next);
  });
}

function canStartDraw() {
  if (state.intentMode === 'question') return state.question.trim().length > 0;
  return state.meditationDone;
}

function updateIntentGoState() {
  const btn = rootRef && rootRef.querySelector('[data-act="start-draw"]');
  if (!btn) return;
  if (canStartDraw()) btn.removeAttribute('disabled');
  else btn.setAttribute('disabled', '');
}

function startMeditation() {
  state.meditationRemain = MEDITATION_MS / 1000;
  state.meditationDone = false;
  if (meditationTimer) clearInterval(meditationTimer);
  meditationTimer = setInterval(() => {
    state.meditationRemain -= 1;
    const remainEl = rootRef && rootRef.querySelector('[data-role="meditation-remain"]');
    if (state.meditationRemain <= 0) {
      clearInterval(meditationTimer);
      meditationTimer = 0;
      state.meditationDone = true;
      const wrapText = rootRef && rootRef.querySelector('.breath-text');
      if (wrapText) wrapText.textContent = '心  已  就  绪';
      if (remainEl) remainEl.textContent = '';
      updateIntentGoState();
      haptic(18);
    } else {
      if (remainEl) remainEl.textContent = `剩  余  ${state.meditationRemain}  秒`;
    }
  }, 1000);
}

/* ============ 步骤 5 · 洗牌 & 抽牌 ============ */

function renderShuffle(stage) {
  if (!state.dataLoaded) {
    stage.innerHTML = `<div class="loading-hint">正  在  展  开  牌  阵</div>`;
    setTimeout(() => { if (state && state.step === 'shuffle') renderShuffle(stage); }, 200);
    return;
  }
  const source = state.type === 'tarot' ? state.data.tarot : state.data.lenormand;
  if (!source || !source.length) {
    stage.innerHTML = `<div class="loading-hint">牌  库  为  空  ·  请  检  查  数  据  文  件</div>`;
    return;
  }
  if (!state.deck.length) state.deck = shuffleArr(source);
  const positions = state.spread.positions;
  const drawn = state.drawnCards.length;
  const body = state.shuffled ? renderFanPhase() : renderPilePhase();
  stage.innerHTML = `
    <div class="shuffle">
      ${renderMiniSpread(positions, drawn)}
      ${body}
    </div>
  `;
  if (state.shuffled) bindFanEvents(stage);
  else bindPileEvents(stage);
}

function renderMiniSpread(positions, drawn) {
  return `
    <div class="mini-spread">
      <div class="mini-info">
        <div class="mini-name">${escapeHtml(state.spread.name)}</div>
        <div class="mini-progress">已  抽  ${drawn} / ${positions.length}</div>
      </div>
      <div class="mini-map">
        ${positions.map((p, i) => {
          const isDrawn = i < drawn;
          const isActive = i === drawn && drawn < positions.length;
          const card = state.drawnCards[i];
          return `<span class="mini-slot" data-slot-idx="${i}"
              style="left:${p.x}%;top:${p.y}%"
              data-on="${isDrawn ? '1' : '0'}"
              data-active="${isActive ? '1' : '0'}">
              ${isDrawn && card
                ? `<span class="mini-card ${card.reversed ? 'is-reversed' : ''}">${cardBackMini()}</span>`
                : `<em>${p.index}</em>`}
            </span>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderPilePhase() {
  return `
    <div class="pile-phase">
      <div class="pile-hint" data-role="pile-hint">凝  神  片  刻</div>
      <div class="deck-pile" data-role="deck-pile">
        ${Array.from({length: 10}).map((_, i) =>
          `<span class="pile-card" style="--i:${i}">${cardBackMini()}</span>`).join('')}
      </div>
      <button class="div-primary" data-act="do-shuffle" type="button">洗    牌</button>
    </div>
  `;
}

function renderFanPhase() {
  const total = Math.min(FAN_MAX_VISIBLE, state.deck.length);
  const cards = [];
  for (let i = 0; i < total; i++) {
    const angle = total > 1 ? (i / (total - 1) - 0.5) * 90 : 0;
    const isDrawn = state.drawnFanIndices.has(i);
    cards.push(`
      <span class="fan-card ${isDrawn ? 'is-taken' : ''}"
        data-fan-idx="${i}"
        style="--angle:${angle}deg;--i:${i}">
        ${cardBackMini()}
      </span>
    `);
  }
  return `
    <div class="fan-phase">
      <div class="fan-hint">凭  直  觉  ·  选  择  下  一  张</div>
      <div class="fan" data-role="fan">
        ${cards.join('')}
      </div>
    </div>
  `;
}

function bindPileEvents(stage) {
  stage.querySelector('[data-act="do-shuffle"]').addEventListener('click', async () => {
    if (state.shuffling) return;
    state.shuffling = true;
    haptic(12);
    const pile = stage.querySelector('[data-role="deck-pile"]');
    const hint = stage.querySelector('[data-role="pile-hint"]');
    if (hint) hint.textContent = '洗  牌  中';
    pile.classList.add('is-shuffling');
    await sleep(1700);
    const source = state.type === 'tarot' ? state.data.tarot : state.data.lenormand;
    state.deck = shuffleArr(source);
    state.shuffled = true;
    state.shuffling = false;
    renderShuffle(stage);
  });
}

function bindFanEvents(stage) {
  const fan = stage.querySelector('[data-role="fan"]');
  fan.addEventListener('click', (e) => {
    const card = e.target.closest('.fan-card');
    if (!card) return;
    if (card.classList.contains('is-taken') || card.classList.contains('is-flying')) return;
    const idx = Number(card.getAttribute('data-fan-idx'));
    onFanCardPick(idx, card);
  });
}

async function onFanCardPick(fanIdx, cardEl) {
  const positions = state.spread.positions;
  if (state.drawnCards.length >= positions.length) return;
  const cardData = state.deck[fanIdx];
  const reversed = state.type === 'tarot' && Math.random() < 0.5;
  const posIdx = state.drawnCards.length;
  state.drawnFanIndices.add(fanIdx);
  state.drawnCards.push({ card: cardData, reversed, positionIndex: posIdx });
  haptic(10);
  const slot = rootRef.querySelector(`.mini-slot[data-slot-idx="${posIdx}"]`);
  if (slot) {
    const srcRect = cardEl.getBoundingClientRect();
    const dstRect = slot.getBoundingClientRect();
    const dx = (dstRect.left + dstRect.width / 2) - (srcRect.left + srcRect.width / 2);
    const dy = (dstRect.top + dstRect.height / 2) - (srcRect.top + srcRect.height / 2);
    const targetScale = Math.max(0.18, (dstRect.width - 6) / srcRect.width);
    cardEl.style.setProperty('--fly-dx', dx + 'px');
    cardEl.style.setProperty('--fly-dy', dy + 'px');
    cardEl.style.setProperty('--fly-scale', targetScale.toFixed(3));
    cardEl.classList.add('is-flying');
  }
  await sleep(720);
  cardEl.classList.remove('is-flying');
  cardEl.classList.add('is-taken');
  cardEl.style.removeProperty('--fly-dx');
  cardEl.style.removeProperty('--fly-dy');
  cardEl.style.removeProperty('--fly-scale');
  // 刷新 mini-spread
  const mini = rootRef.querySelector('.mini-spread');
  if (mini) {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderMiniSpread(positions, state.drawnCards.length);
    mini.replaceWith(wrap.firstElementChild);
  }
  if (state.drawnCards.length >= positions.length) {
    await sleep(600);
    goTo('reveal');
  }
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============ 步骤 5' · 骰子投掷 ============ */

function renderCast(stage) {
  if (!state.dataLoaded) {
    stage.innerHTML = `<div class="loading-hint">正  在  校  准  星  盘</div>`;
    setTimeout(() => { if (state && state.step === 'cast') renderCast(stage); }, 200);
    return;
  }
  const r = state.diceResult;
  stage.innerHTML = `
    <div class="cast">
      <div class="cast-hint" data-role="cast-hint">
        ${r ? '星  轨  已  落  定' : '长  按  ·  蓄  力  投  掷'}
      </div>
      <div class="dice-stage" data-role="dice-stage">
        <div class="die die-1" data-role="die-1"><span data-role="face-1">${r ? symbolOf(r.planet) : '·'}</span></div>
        <div class="die die-2" data-role="die-2"><span data-role="face-2">${r ? symbolOf(r.sign)   : '·'}</span></div>
        <div class="die die-3" data-role="die-3"><span data-role="face-3">${r ? houseFace(r.house) : '·'}</span></div>
      </div>
      <div class="cast-charge-wrap">
        <div class="cast-charge-bar"><div class="cast-charge-fill" data-role="cast-fill"></div></div>
      </div>
      <div class="cast-line" data-role="cast-line">
        ${r ? `${escapeHtml(r.planet.name)}  ·  ${escapeHtml(r.sign.name)}  ·  ${escapeHtml(r.house.name)}` : ''}
      </div>
      <button class="div-primary" data-act="cast-next" type="button" ${r ? '' : 'disabled'}>${r ? '查  看  解  读' : '等  待  投  掷'}</button>
    </div>
  `;
  bindCastEvents(stage);
}

function symbolOf(item) { return item.symbol || (item.name || '·').slice(0, 1); }
function houseFace(h)   { return h.number || (h.name || '·').slice(0, 1); }

function bindCastEvents(stage) {
  const btn = stage.querySelector('[data-act="cast-next"]');
  btn.addEventListener('click', () => {
    if (!state.diceResult) return;
    haptic(10);
    goTo('result');
  });
  if (state.diceResult) return;

  const cast = stage.querySelector('.cast');
  const onDown = (e) => {
    if (e.target.closest('.div-primary')) return;
    if (state.diceRolling || state.diceResult) return;
    e.preventDefault();
    haptic(10);
    try { cast.setPointerCapture(e.pointerId); } catch {}
    startDiceCharge();
  };
  const onEnd = () => {
    if (!castPress) return;
    castPress = null;
    cancelAnimationFrame(castRAF);
    if (state.diceRolling || state.diceResult) return;
    if (state.diceCharge > 0.15) commitDiceRoll();
    else { state.diceCharge = 0; updateCastFill(); }
  };
  cast.addEventListener('pointerdown', onDown);
  cast.addEventListener('pointerup', onEnd);
  cast.addEventListener('pointercancel', onEnd);
}

function startDiceCharge() {
  castPress = { active: true };
  castLastTs = performance.now();
  cancelAnimationFrame(castRAF);
  const loop = (ts) => {
    if (!castPress || !castPress.active) return;
    const dt = ts - castLastTs;
    castLastTs = ts;
    state.diceCharge = Math.min(1, state.diceCharge + dt / CAST_HOLD_MS);
    updateCastFill();
    if (state.diceCharge >= 1) {
      castPress = null;
      commitDiceRoll();
      return;
    }
    castRAF = requestAnimationFrame(loop);
  };
  castRAF = requestAnimationFrame(loop);
}

function updateCastFill() {
  const fill = rootRef && rootRef.querySelector('[data-role="cast-fill"]');
  if (fill) fill.style.width = (state.diceCharge * 100) + '%';
  const dice = rootRef && rootRef.querySelectorAll('.die');
  if (dice) dice.forEach(d => d.style.setProperty('--charge', state.diceCharge.toFixed(3)));
}

async function commitDiceRoll() {
  state.diceRolling = true;
  const dice = rootRef.querySelectorAll('.die');
  dice.forEach(d => { d.classList.add('is-rolling'); d.classList.remove('is-settled'); });
  const faceEls = [
    rootRef.querySelector('[data-role="face-1"]'),
    rootRef.querySelector('[data-role="face-2"]'),
    rootRef.querySelector('[data-role="face-3"]'),
  ];
  const d = state.data.astroDice;
  const planets = (d && d.planets) || DICE_FALLBACK.planets;
  const signs   = (d && d.signs)   || DICE_FALLBACK.signs;
  const houses  = (d && d.houses)  || DICE_FALLBACK.houses;

  const ROLL_MS = 1600;
  const T0 = performance.now();
  const tick = () => {
    if (!state || state.step !== 'cast') return;
    const elapsed = performance.now() - T0;
    if (elapsed >= ROLL_MS) {
      const p = pickRandom(planets);
      const s = pickRandom(signs);
      const h = pickRandom(houses);
      state.diceResult = { planet: p, sign: s, house: h };
      state.diceRolling = false;
      state.diceCharge = 0;
      if (faceEls[0]) faceEls[0].textContent = symbolOf(p);
      if (faceEls[1]) faceEls[1].textContent = symbolOf(s);
      if (faceEls[2]) faceEls[2].textContent = houseFace(h);
      dice.forEach(dd => { dd.classList.remove('is-rolling'); dd.classList.add('is-settled'); });
      haptic(24);
      const line = rootRef.querySelector('[data-role="cast-line"]');
      if (line) line.textContent = `${p.name}  ·  ${s.name}  ·  ${h.name}`;
      const hint = rootRef.querySelector('[data-role="cast-hint"]');
      if (hint) hint.textContent = '星  轨  已  落  定';
      const btn = rootRef.querySelector('[data-act="cast-next"]');
      if (btn) { btn.removeAttribute('disabled'); btn.textContent = '查  看  解  读'; }
      updateCastFill();
      return;
    }
    const interval = 50 + (elapsed / ROLL_MS) * 130;
    const ri = Math.floor(Math.random() * 100);
    if (faceEls[0]) faceEls[0].textContent = symbolOf(planets[ri % planets.length]);
    if (faceEls[1]) faceEls[1].textContent = symbolOf(signs[(ri + 1) % signs.length]);
    if (faceEls[2]) faceEls[2].textContent = houseFace(houses[(ri + 2) % houses.length]);
    setTimeout(tick, interval);
  };
  tick();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ============ 步骤 6 · 翻牌 ============ */

function renderReveal(stage) {
  state.drawnCards.forEach(c => {
    if (c.revealed === undefined) c.revealed = false;
  });

  const allRevealed = state.drawnCards.every(c => c.revealed);

  stage.innerHTML = `
    <div class="reveal-page">
      <div class="reveal-hint" data-role="reveal-hint">
        ${allRevealed ? '牌  面  已  悉  数  展  开' : '轻  触  卡  牌  ·  逐  一  唤  醒'}
      </div>
      <div class="reveal-map">
        ${state.drawnCards.map((d, i) => {
          const pos = state.spread.positions[i];
          const isFlipped = d.revealed;
          return `
            <div class="reveal-card-slot" style="left: ${pos.x}%; top: ${pos.y}%;">
              <div class="reveal-card ${isFlipped ? 'is-flipped' : ''}" data-idx="${i}">
                <div class="reveal-card-inner">
                  <div class="reveal-card-back">
                    ${cardBackMini()}
                  </div>
                  <div class="reveal-card-face">
                    <div class="reveal-card-face-inner ${d.reversed ? 'is-reversed' : ''}">
                      <div class="reveal-card-face-symbol">
                        ${cardTotemSVG(state.type)}
                      </div>
                      <div class="reveal-card-face-name">${escapeHtml(d.card.name)}</div>
                      ${state.type === 'tarot' ? `<div class="reveal-card-face-dir">${d.reversed ? '逆  位' : '正  位'}</div>` : ''}
                    </div>
                  </div>
                </div>
              </div>
              <div class="reveal-card-pos-name">${escapeHtml(pos.name)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="reveal-actions">
        ${!allRevealed ? `
          <button class="btn-reveal-all" data-act="reveal-all" type="button">一  键  翻  开</button>
        ` : ''}
        <button class="div-primary" data-act="reveal-next" type="button" ${allRevealed ? '' : 'disabled'}>
          ${allRevealed ? '参  悟  牌  意' : '等  待  翻  牌'}
        </button>
      </div>
    </div>
  `;
  bindRevealEvents(stage);
}

function bindRevealEvents(stage) {
  stage.querySelectorAll('.reveal-card').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      const idx = parseInt(cardEl.getAttribute('data-idx'));
      if (state.drawnCards[idx].revealed) return;
      haptic(10);
      state.drawnCards[idx].revealed = true;
      cardEl.classList.add('is-flipped');
      checkAllRevealed(stage);
    });
  });

  const btnAll = stage.querySelector('[data-act="reveal-all"]');
  if (btnAll) {
    btnAll.addEventListener('click', () => {
      haptic(14);
      state.drawnCards.forEach(c => c.revealed = true);
      stage.querySelectorAll('.reveal-card').forEach(cardEl => {
        cardEl.classList.add('is-flipped');
      });
      checkAllRevealed(stage);
    });
  }

  const btnNext = stage.querySelector('[data-act="reveal-next"]');
  btnNext.addEventListener('click', () => {
    if (btnNext.hasAttribute('disabled')) return;
    haptic(10);
    goTo('result');
  });
}

function checkAllRevealed(stage) {
  const allRevealed = state.drawnCards.every(c => c.revealed);
  if (allRevealed) {
    const hint = stage.querySelector('[data-role="reveal-hint"]');
    if (hint) hint.textContent = '牌  面  已  悉  数  展  开';
    const btnNext = stage.querySelector('[data-act="reveal-next"]');
    if (btnNext) {
      btnNext.removeAttribute('disabled');
      btnNext.textContent = '参  悟  牌  意';
    }
    const btnAll = stage.querySelector('[data-act="reveal-all"]');
    if (btnAll) {
      btnAll.style.opacity = '0';
      setTimeout(() => btnAll.remove(), 250);
    }
  }
}

/* ============ 步骤 7 · 解读 ============ */

function renderResult(stage) {
  saveToHistory();

  const typeName = (CARD_TYPES.find(c => c.id === state.type) || {}).name || '';
  const spreadName = state.spread ? state.spread.name : '';
  const intentTxt = state.intentMode === 'question' ? (state.question || '未填写问题') : '以冥想为引';
  const focusName = (FOCUS_OPTIONS.find(f => f.id === state.focus) || {}).name || '';
  const detail = state.type === 'astroDice' ? renderDiceDetail() : renderCardsDetail();

  stage.innerHTML = `
    <div class="result-page">
      <div class="result-header">
        <div class="result-title">仪  式  已  成</div>
        <div class="result-meta">
          <span>${typeName}</span>
          ${spreadName ? `<span>${spreadName}</span>` : ''}
          <span>${focusName}</span>
        </div>
        <div class="result-intent">${escapeHtml(intentTxt)}</div>
      </div>
      <div class="result-content">
        ${detail}
      </div>
      <div class="result-actions">
        <button class="div-primary" data-act="restart-flow" type="button">重  新  开  始</button>
      </div>
    </div>
  `;
  stage.querySelector('[data-act="restart-flow"]').addEventListener('click', () => onNavRestart());
}

async function saveToHistory() {
  if (!state || state.historySaved) return;
  state.historySaved = true;
  try {
    const record = {
      type: state.type,
      timestamp: Date.now(),
      intentMode: state.intentMode,
      question: state.intentMode === 'question' ? state.question : '',
      focus: state.focus,
      drawnCards: state.drawnCards.map(d => ({
        id: d.card.id,
        name: d.card.name,
        reversed: d.reversed,
        positionIndex: d.positionIndex
      })),
      diceResult: state.diceResult ? {
        planet: { id: state.diceResult.planet.id, name: state.diceResult.planet.name, symbol: state.diceResult.planet.symbol || '' },
        sign: { id: state.diceResult.sign.id, name: state.diceResult.sign.name, symbol: state.diceResult.sign.symbol || '' },
        house: { id: state.diceResult.house.id, name: state.diceResult.house.name, number: state.diceResult.house.number || '' }
      } : null
    };
    await db.divinationHistory.add(record);
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

function renderCardsDetail() {
  if (!state.drawnCards.length) return '';
  return `
    <div class="result-cards-list">
      ${state.drawnCards.map((d, i) => {
        const pos = state.spread.positions[i];
        const kw = (d.card.keywords || []).slice(0, 4).join('  ·  ');
        
        let cardMeaningText = '';
        if (state.type === 'tarot') {
          const meanings = d.card.meanings || {};
          cardMeaningText = d.reversed ? (meanings.reversed || '') : (meanings.upright || '');
        } else {
          if (d.card.meanings) {
            if (typeof d.card.meanings === 'string') {
              cardMeaningText = d.card.meanings;
            } else if (typeof d.card.meanings === 'object') {
              cardMeaningText = d.card.meanings.upright || d.card.meanings.meaning || Object.values(d.card.meanings)[0] || '';
            }
          } else {
            cardMeaningText = d.card.meaning || '';
          }
        }

        let interpretationHtml = '';
        if (state.focus === 'message') {
          interpretationHtml = `
            <div class="result-card-whisper">它在低语：“${escapeHtml(cardMeaningText)}”</div>
          `;
        } else {
          interpretationHtml = `
            <div class="result-card-meaning">${escapeHtml(cardMeaningText)}</div>
          `;
        }

        return `
          <div class="result-card-item">
            <div class="result-card-item-header">
              <div class="result-card-mini-view ${d.reversed ? 'is-reversed' : ''}">
                ${cardBackMini()}
              </div>
              <div class="result-card-info">
                <span class="result-card-pos">${escapeHtml(pos.name)}</span>
                <span class="result-card-title">
                  ${escapeHtml(d.card.name)}
                  ${state.type === 'tarot' ? `<span class="result-card-dir">${d.reversed ? '逆位' : '正位'}</span>` : ''}
                </span>
              </div>
            </div>
            ${kw ? `<div class="result-card-keywords">${escapeHtml(kw)}</div>` : ''}
            <div class="result-card-body">
              ${interpretationHtml}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getItemMeaning(item) {
  if (!item) return '';
  if (typeof item.meaning === 'string') return item.meaning;
  if (item.meanings) {
    if (typeof item.meanings === 'string') return item.meanings;
    if (typeof item.meanings === 'object') {
      return item.meanings.upright || item.meanings.meaning || Object.values(item.meanings)[0] || '';
    }
  }
  return '';
}

function renderDiceDetail() {
  const r = state.diceResult;
  if (!r) return '';
  
  const items = [
    { label: '行  星', name: r.planet.name, symbol: r.planet.symbol || '', keywords: r.planet.keywords, meaning: getItemMeaning(r.planet) },
    { label: '星  座', name: r.sign.name, symbol: r.sign.symbol || '', keywords: r.sign.keywords, meaning: getItemMeaning(r.sign) },
    { label: '宫  位', name: r.house.name, symbol: r.house.number ? `${r.house.number}宫` : '', keywords: r.house.keywords, meaning: getItemMeaning(r.house) }
  ];

  return `
    <div class="result-dice-list">
      ${items.map(item => {
        const kwStr = (item.keywords || []).slice(0, 4).join('  ·  ');
        return `
          <div class="result-dice-card">
            <div class="result-dice-card-header">
              <span class="result-dice-label">${item.label}</span>
              <span class="result-dice-name">${escapeHtml(item.name)} ${escapeHtml(item.symbol)}</span>
            </div>
            ${kwStr ? `<div class="result-card-keywords">${escapeHtml(kwStr)}</div>` : ''}
            <div class="result-dice-meaning">${escapeHtml(item.meaning || '暂无释义')}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============ SVG · 卡背图腾 ============ */

function cardTotemSVG(kind) {
  if (kind === 'tarot') {
    return `<svg class="deck-card-svg" viewBox="0 0 100 140">
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.7"/>
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.35"/>
      <g transform="translate(50 70)" opacity="0.85">
        <circle r="22" fill="none" stroke="currentColor" stroke-width="0.6"/>
        <path d="M0,-22 A22,22 0 0,0 0,22 Z" fill="currentColor" opacity="0.15"/>
        <circle r="8" fill="none" stroke="currentColor" stroke-width="0.5"/>
      </g>
      <g transform="translate(50 70)" opacity="0.9">
        <path d="M0,-32 L4,-4 L32,0 L4,4 L0,32 L-4,4 L-32,0 L-4,-4 Z"
          fill="none" stroke="currentColor" stroke-width="0.6"/>
      </g>
    </svg>`;
  }
  if (kind === 'lenormand') {
    return `<svg class="deck-card-svg" viewBox="0 0 100 140">
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.7"/>
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.35"/>
      <g transform="translate(50 70)" opacity="0.85">
        <path d="M0,-30 C-14,-20 -14,0 0,16 C14,0 14,-20 0,-30 Z" fill="none" stroke="currentColor" stroke-width="0.6"/>
        <path d="M-18,-6 Q0,10 18,-6" fill="none" stroke="currentColor" stroke-width="0.5"/>
        <path d="M-22,10 Q0,26 22,10" fill="none" stroke="currentColor" stroke-width="0.5"/>
        <path d="M-14,22 Q0,36 14,22" fill="none" stroke="currentColor" stroke-width="0.5"/>
      </g>
    </svg>`;
  }
  return `<svg class="deck-card-svg" viewBox="0 0 100 140">
    <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.7"/>
    <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.35"/>
    <g transform="translate(50 70)" opacity="0.9">
      <polygon points="0,-26 22,-13 22,13 0,26 -22,13 -22,-13" fill="none" stroke="currentColor" stroke-width="0.7"/>
      <polygon points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
      <circle cx="0" cy="0" r="2" fill="currentColor"/>
      <circle cx="-12" cy="-6" r="1.4" fill="currentColor"/>
      <circle cx="12" cy="-6" r="1.4" fill="currentColor"/>
      <circle cx="0" cy="18" r="1.4" fill="currentColor"/>
    </g>
  </svg>`;
}

function cardBackMini() {
  return `<svg class="mini-back" viewBox="0 0 40 56" preserveAspectRatio="none">
    <rect x="1" y="1" width="38" height="54" rx="3" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.75"/>
    <rect x="4" y="4" width="32" height="48" rx="2" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.4"/>
    <path d="M20 12 L24 26 L20 44 L16 26 Z" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.85"/>
    <circle cx="20" cy="28" r="6" fill="none" stroke="currentColor" stroke-width="0.35" opacity="0.55"/>
  </svg>`;
}

function iconBack() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}
function iconRestart() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15A9 9 0 1 0 6 5.29L1 10"/></svg>`;
}

/* ============ CSS ============ */

function pageCSS() {
  return `
    .div-page {
      position: relative;
      min-height: 100vh; min-height: 100dvh;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--color-bg-primary);
      background-image: var(--bg-image, none);
      color: var(--color-text-primary);
      animation: divFadeIn 0.5s ease;
    }
    @keyframes divFadeIn { from { opacity: 0; } to { opacity: 1; } }

    .div-nav {
      position: fixed; z-index: 40;
      top: calc(12px + env(safe-area-inset-top));
      width: 40px; height: 40px;
      border-radius: 999px;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      transition: opacity 0.24s, color 0.2s;
    }
    .div-nav:active { color: var(--color-text-primary); }
    .div-nav-back { left: 14px; }
    .div-nav-restart { right: 14px; }
    @media (min-width: 640px) {
      .div-nav-back    { left: calc(50vw - 240px + 14px); }
      .div-nav-restart { right: calc(50vw - 240px + 14px); }
    }
    .div-step-label {
      position: absolute; top: calc(20px + env(safe-area-inset-top));
      left: 0; right: 0; text-align: center;
      font-size: 10px; letter-spacing: 8px;
      color: var(--color-text-tertiary);
      pointer-events: none; z-index: 20;
    }
    .div-stage {
      position: relative;
      min-height: 100vh; min-height: 100dvh;
      padding: 84px 20px 40px;
      padding-bottom: calc(40px + env(safe-area-inset-bottom));
      display: flex; flex-direction: column; align-items: stretch;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .div-stage.is-enter { animation: divStageEnter 0.32s ease both; }
    .div-stage.is-leave { opacity: 0; transform: translateY(-6px); }
    @keyframes divStageEnter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

    .div-primary {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 14px 18px; border-radius: 999px;
      background: var(--color-accent); color: var(--color-bg-primary);
      font-size: 13px; letter-spacing: 6px;
      border: none; cursor: pointer;
      transition: opacity 0.15s, transform 0.15s;
      align-self: center; min-width: 220px;
      margin-top: 20px;
    }
    .div-primary:active { transform: scale(0.97); }
    .div-primary[disabled] { opacity: 0.32; pointer-events: none; }

    .loading-hint { text-align: center; padding: 60px 0;
      font-size: 12px; letter-spacing: 4px; color: var(--color-text-tertiary); }

    /* ============ 净化 ============ */
    .purify { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; }
    .purify-hint { font-size: 11px; letter-spacing: 4px; color: var(--color-text-secondary); margin-top: 12px; }
    .crystal-wrap {
      position: relative; width: 240px; height: 240px;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent); --charge: 0;
      touch-action: none; user-select: none;
    }
    .crystal-glow { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .crystal-glow circle {
      fill: currentColor;
      opacity: calc(0.08 + var(--charge) * 0.28);
      filter: blur(28px); transition: opacity 0.15s;
    }
    .crystal-svg {
      position: relative; z-index: 2; color: var(--color-accent);
      filter: drop-shadow(0 0 calc(6px + var(--charge) * 16px) currentColor);
      animation: crystalFloat 5s ease-in-out infinite;
    }
    @keyframes crystalFloat { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-6px) rotate(2deg); } }
    .crystal-outer { animation: crystalOuterSpin 40s linear infinite; transform-origin: 60px 60px; }
    .crystal-inner { animation: crystalInnerPulse 4s ease-in-out infinite; transform-origin: 60px 60px; }
    @keyframes crystalOuterSpin { to { transform: rotate(360deg); } }
    @keyframes crystalInnerPulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.06); opacity: 1; } }
    .charge-ring {
      position: absolute; inset: 50% auto auto 50%;
      transform: translate(-50%, -50%);
      color: var(--color-accent); pointer-events: none; z-index: 3;
    }
    .charge-ring-fill { transition: stroke-dashoffset 0.15s linear; }
    .mist-layer { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
    .mist-particle {
      position: absolute; left: 50%; top: 50%;
      width: var(--size, 10px); height: var(--size, 10px);
      margin-left: calc(var(--size, 10px) * -0.5);
      margin-top:  calc(var(--size, 10px) * -0.5);
      border-radius: 50%;
      background: radial-gradient(circle, currentColor 0%, transparent 70%);
      color: var(--color-accent); opacity: 0;
      animation: mistFly 1.4s ease-out var(--delay, 0s) forwards;
    }
    @keyframes mistFly {
      0%   { transform: translate(0, 0) scale(0.4); opacity: 0.9; }
      100% { transform: translate(var(--dx), var(--dy)) scale(1.4); opacity: 0; }
    }
    .flash-overlay { position: fixed; inset: 0; z-index: 60; background: #ffffff; opacity: 0; pointer-events: none; }
    .flash-overlay.is-flash { animation: flashSoft 0.7s ease-out; }
    .flash-overlay.is-final { animation: flashFinal 0.9s ease-out; }
    @keyframes flashSoft { 0% { opacity: 0; } 30% { opacity: 0.35; } 100% { opacity: 0; } }
    @keyframes flashFinal { 0% { opacity: 0; } 35% { opacity: 0.8; } 100% { opacity: 0; } }
    .purify-tabs { display: inline-flex; gap: 6px; padding: 4px; border-radius: 999px;
      background: var(--color-bg-secondary); border: 1px solid var(--color-border); }
    .purify-tab { padding: 8px 18px; border-radius: 999px;
      font-size: 11px; letter-spacing: 3px; color: var(--color-text-secondary);
      background: transparent; border: none; cursor: pointer;
      transition: color 0.2s, background 0.2s; }
    .purify-tab[data-on="1"] { color: var(--color-bg-primary); background: var(--color-accent); }

    /* ============ 卡牌 swiper ============ */
    .deck { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 18px; }
    .deck-caption { font-size: 11px; letter-spacing: 4px; color: var(--color-text-secondary); margin-top: 8px; }
    .deck-stage {
      position: relative; width: 100%; height: 400px;
      perspective: 1200px; --drag: 0px;
      touch-action: pan-y; user-select: none;
    }
    .deck-card {
      position: absolute; left: 50%; top: 50%;
      width: 220px; height: 320px;
      margin-left: -110px; margin-top: -160px;
      transition: transform 0.42s cubic-bezier(.4,.1,.2,1), opacity 0.42s, filter 0.42s;
      transform-style: preserve-3d;
      cursor: pointer; color: var(--color-accent);
    }
    .deck-card[data-pos="active"]    { transform: translateX(calc(var(--drag) * 0.5)) translateZ(60px) scale(1.02); z-index: 5; opacity: 1; }
    .deck-card[data-pos="prev"]      { transform: translateX(calc(-140px + var(--drag) * 0.5)) translateZ(0) rotateY(20deg) scale(0.86); z-index: 3; opacity: 0.55; filter: blur(0.4px); }
    .deck-card[data-pos="next"]      { transform: translateX(calc(140px + var(--drag) * 0.5))  translateZ(0) rotateY(-20deg) scale(0.86); z-index: 3; opacity: 0.55; filter: blur(0.4px); }
    .deck-card[data-pos="far-left"]  { transform: translateX(-260px) scale(0.7); opacity: 0; z-index: 1; }
    .deck-card[data-pos="far-right"] { transform: translateX(260px) scale(0.7);  opacity: 0; z-index: 1; }
    .deck-card[data-pos="hidden"]    { opacity: 0; pointer-events: none; }
    .deck-card-inner {
      position: relative; width: 100%; height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.7s cubic-bezier(.5,.05,.1,1);
    }
    .deck-card.is-flipping .deck-card-inner { transform: rotateY(180deg); }
    .deck-card-back, .deck-card-face {
      position: absolute; inset: 0;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
      border-radius: 14px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 16px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      box-shadow: 0 12px 40px var(--color-shadow);
    }
    .deck-card-face { transform: rotateY(180deg); background: var(--color-bg-tertiary); }
    .deck-card[data-pos="active"] .deck-card-back {
      box-shadow: 0 14px 44px var(--color-shadow), 0 0 0 1px var(--color-accent) inset;
      animation: cardBreath 3.6s ease-in-out infinite;
    }
    @keyframes cardBreath { 0%,100% { filter: drop-shadow(0 0 0 transparent); } 50% { filter: drop-shadow(0 0 12px currentColor); } }
    .deck-card-svg { width: 84%; height: auto; color: var(--color-accent); opacity: 0.85; margin-bottom: 12px; }
    .deck-card-title { font-size: 15px; letter-spacing: 4px; color: var(--color-text-primary); margin-bottom: 6px; }
    .deck-card-sub { font-size: 10px; letter-spacing: 3px; color: var(--color-text-tertiary); text-align: center; }
    .deck-dots { display: flex; gap: 8px; margin-top: 8px; }
    .deck-dot { width: 6px; height: 6px; border-radius: 999px;
      background: var(--color-text-tertiary); opacity: 0.4; cursor: pointer;
      transition: opacity 0.2s, width 0.2s; }
    .deck-dot[data-on="1"] { opacity: 1; width: 18px; background: var(--color-accent); }
    .deck-hint { font-size: 10px; letter-spacing: 3px; color: var(--color-text-tertiary); margin-top: 6px; }
    .spread-back { padding: 14px; }
    .spread-map { position: relative; width: 92%; aspect-ratio: 3 / 2; margin-bottom: 12px;
      border: 1px dashed var(--color-border); border-radius: 8px; }
    .spread-pt { position: absolute; width: 22px; height: 30px;
      transform: translate(-50%, -50%);
      background: var(--color-accent); color: var(--color-bg-primary);
      border-radius: 3px; display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px; box-shadow: 0 2px 6px var(--color-shadow); }
    .spread-pt em { font-style: normal; letter-spacing: 0; }
    .spread-desc { padding: 0 6px; line-height: 1.6; white-space: normal; }

    /* ============ 起意 ============ */
    .intent { flex: 1; display: flex; flex-direction: column; gap: 22px; }
    .intent-tabs { display: flex; gap: 6px; padding: 4px; border-radius: 999px;
      background: var(--color-bg-secondary); border: 1px solid var(--color-border); align-self: center; }
    .intent-tab { padding: 10px 20px; border-radius: 999px;
      font-size: 12px; letter-spacing: 4px; color: var(--color-text-secondary);
      background: transparent; border: none; transition: color 0.2s, background 0.2s; }
    .intent-tab[data-on="1"] { color: var(--color-bg-primary); background: var(--color-accent); }
    .intent-body { min-height: 220px; }
    .intent-question { display: flex; flex-direction: column; gap: 12px; }
    .intent-hint { font-size: 11px; letter-spacing: 3px; color: var(--color-text-tertiary); text-align: center; }
    .intent-textarea {
      width: 100%; min-height: 160px; padding: 16px;
      background: var(--color-bg-secondary); border: 1px solid var(--color-border);
      border-radius: 14px; color: var(--color-text-primary);
      font-size: 15px; line-height: 1.8; letter-spacing: 1px;
      resize: none; transition: border-color 0.2s;
    }
    .intent-textarea:focus { border-color: var(--color-accent); outline: none; }
    .intent-meditation { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 12px 0; }
    .breath-wrap { position: relative; width: 180px; height: 180px;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent); }
    .breath-ring { position: absolute; inset: 0; border-radius: 50%;
      border: 1px solid currentColor; opacity: 0.25;
      animation: breathRing 6s ease-in-out infinite; }
    .breath-core { width: 90px; height: 90px; border-radius: 50%;
      background: radial-gradient(circle, currentColor 0%, transparent 70%);
      opacity: 0.4; animation: breathCore 6s ease-in-out infinite; }
    .breath-text { position: absolute; font-size: 10px; letter-spacing: 4px; color: var(--color-text-secondary); }
    @keyframes breathRing { 0%,100% { transform: scale(0.6); opacity: 0.15; } 50% { transform: scale(1); opacity: 0.5; } }
    @keyframes breathCore { 0%,100% { transform: scale(0.6); opacity: 0.2; } 50% { transform: scale(1.1); opacity: 0.55; } }
    .meditation-remain { font-size: 11px; letter-spacing: 4px; color: var(--color-text-tertiary); min-height: 16px; }
    .intent-section-title { font-size: 10px; letter-spacing: 4px; color: var(--color-text-tertiary); text-align: center; margin-bottom: 10px; }
    .focus-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .focus-card { padding: 16px 12px; background: var(--color-bg-secondary);
      border: 1px solid var(--color-border); border-radius: 14px;
      text-align: center; display: flex; flex-direction: column; gap: 6px;
      cursor: pointer; transition: border-color 0.2s, transform 0.15s; }
    .focus-card:active { transform: scale(0.97); }
    .focus-card[data-on="1"] { border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent) inset; }
    .focus-name { font-size: 13px; letter-spacing: 3px; color: var(--color-text-primary); }
    .focus-sub { font-size: 10px; letter-spacing: 1px; color: var(--color-text-tertiary); line-height: 1.6; }
    .intent-go { align-self: center; }

    /* ============ 洗牌 · 抽牌 ============ */
    .shuffle { flex: 1; display: flex; flex-direction: column; gap: 16px; }
    .mini-spread {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 12px 14px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .mini-info { display: flex; justify-content: space-between; align-items: baseline; }
    .mini-name { font-size: 12px; letter-spacing: 4px; color: var(--color-text-primary); }
    .mini-progress { font-size: 11px; letter-spacing: 2px; color: var(--color-text-secondary); }
    .mini-map {
      position: relative; width: 100%;
      aspect-ratio: 3 / 1.4;
      border: 1px dashed var(--color-border);
      border-radius: 10px;
    }
    .mini-slot {
      position: absolute; width: 26px; height: 36px;
      transform: translate(-50%, -50%);
      border: 1px dashed var(--color-border);
      border-radius: 4px;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--color-text-tertiary);
      font-size: 10px;
      transition: border-color 0.2s, color 0.2s;
    }
    .mini-slot em { font-style: normal; }
    .mini-slot[data-active="1"] {
      border-color: var(--color-accent);
      color: var(--color-accent);
      animation: slotPulse 1.6s ease-in-out infinite;
    }
    @keyframes slotPulse { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 3px rgba(255,255,255,0.08); } }
    .mini-slot[data-on="1"] {
      border-style: solid;
      border-color: var(--color-accent);
      background: var(--color-bg-tertiary);
    }
    .mini-card {
      display: inline-flex; align-items: center; justify-content: center;
      width: 100%; height: 100%;
      color: var(--color-accent);
      animation: miniCardDrop 0.4s ease both;
    }
    .mini-card.is-reversed { transform: rotate(180deg); }
    @keyframes miniCardDrop { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .mini-card .mini-back { width: 80%; height: 88%; }

    .pile-phase, .fan-phase {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 22px; position: relative; min-height: 380px;
    }
    .pile-hint, .fan-hint { font-size: 11px; letter-spacing: 4px; color: var(--color-text-secondary); }

    .deck-pile {
      position: relative; width: 160px; height: 220px;
      color: var(--color-accent);
    }
    .pile-card {
      position: absolute; left: 50%; top: 50%;
      width: 120px; height: 168px;
      margin-left: -60px; margin-top: -84px;
      border-radius: 10px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      box-shadow: 0 6px 18px var(--color-shadow);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent);
      transform: translate(calc(var(--i) * -1.2px), calc(var(--i) * -1.2px)) rotate(calc(var(--i) * -0.6deg));
      transition: transform 0.4s ease;
    }
    .pile-card .mini-back { width: 70%; height: 76%; opacity: 0.7; }
    .deck-pile.is-shuffling .pile-card {
      animation: shuffleFly 1.5s cubic-bezier(.55,.1,.35,1) both;
    }
    @keyframes shuffleFly {
      0%   { transform: translate(0, 0) rotate(0); }
      35%  { transform: translate(calc((var(--i) - 4.5) * 26px), -60px) rotate(calc((var(--i) - 4.5) * 12deg)); }
      70%  { transform: translate(calc((var(--i) - 4.5) * 14px), 30px) rotate(calc((var(--i) - 4.5) * -8deg)); }
      100% { transform: translate(calc(var(--i) * -1.2px), calc(var(--i) * -1.2px)) rotate(calc(var(--i) * -0.6deg)); }
    }

    .fan {
      position: relative; width: 100%; height: 300px;
      color: var(--color-accent);
      touch-action: manipulation;
    }
    .fan-card {
      position: absolute; left: 50%; bottom: 0;
      width: 80px; height: 120px;
      margin-left: -40px;
      border-radius: 8px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      box-shadow: 0 4px 12px var(--color-shadow);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent);
      cursor: pointer;
      transform-origin: 50% 260px;
      transform: rotate(var(--angle));
      transition: transform 0.35s cubic-bezier(.3,.1,.2,1), opacity 0.4s, filter 0.3s;
      animation: fanEnter 0.6s ease both;
      animation-delay: calc(var(--i) * 30ms);
    }
    .fan-card .mini-back { width: 68%; height: 78%; opacity: 0.7; }
    .fan-card:hover, .fan-card:active {
      transform: rotate(var(--angle)) translateY(-14px);
      filter: drop-shadow(0 0 10px currentColor);
    }
    .fan-card.is-flying {
      transition: transform 0.7s cubic-bezier(.4,.1,.2,1), opacity 0.6s ease;
      transform: translate(var(--fly-dx, 0px), var(--fly-dy, 0px)) scale(var(--fly-scale, 0.3)) rotate(0deg);
      z-index: 20;
      pointer-events: none;
      filter: drop-shadow(0 0 14px currentColor);
    }
    .fan-card.is-taken { opacity: 0; pointer-events: none; }
    @keyframes fanEnter {
      from { opacity: 0; transform: rotate(0deg) translateY(30px); }
      to   { opacity: 1; transform: rotate(var(--angle)); }
    }

    /* ============ 骰子投掷 ============ */
    .cast {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 24px;
      touch-action: none; user-select: none;
      padding-top: 20px;
    }
    .cast-hint { font-size: 11px; letter-spacing: 4px; color: var(--color-text-secondary); }
    .dice-stage {
      display: flex; align-items: center; justify-content: center;
      gap: 18px;
      perspective: 800px;
      min-height: 160px;
    }
    .die {
      --charge: 0;
      width: 84px; height: 84px;
      border-radius: 14px;
      background: linear-gradient(155deg, var(--color-bg-tertiary), var(--color-bg-secondary));
      border: 1px solid var(--color-border);
      box-shadow: 0 6px 20px var(--color-shadow), inset 0 0 0 1px rgba(255,255,255,0.03);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent);
      transform-style: preserve-3d;
      transition: transform 0.25s ease, box-shadow 0.25s;
      filter: drop-shadow(0 0 calc(var(--charge) * 12px) currentColor);
    }
    .die span {
      font-size: 34px;
      line-height: 1;
      letter-spacing: 0;
      color: var(--color-text-primary);
    }
    .die-3 span { font-size: 26px; letter-spacing: 1px; }
    .die.is-rolling {
      animation: dieRoll 0.32s linear infinite;
    }
    .die-1.is-rolling { animation-duration: 0.28s; }
    .die-2.is-rolling { animation-duration: 0.34s; }
    .die-3.is-rolling { animation-duration: 0.30s; }
    @keyframes dieRoll {
      0%   { transform: rotateX(0)   rotateY(0)   translateY(0); }
      25%  { transform: rotateX(180deg) rotateY(90deg) translateY(-12px); }
      50%  { transform: rotateX(360deg) rotateY(180deg) translateY(0); }
      75%  { transform: rotateX(540deg) rotateY(270deg) translateY(-8px); }
      100% { transform: rotateX(720deg) rotateY(360deg) translateY(0); }
    }
    .die.is-settled {
      animation: dieSettle 0.6s cubic-bezier(.3,1.4,.5,1) both;
    }
    @keyframes dieSettle {
      0%   { transform: scale(1.3) rotate(-8deg); box-shadow: 0 0 30px currentColor, 0 6px 20px var(--color-shadow); }
      60%  { transform: scale(0.94) rotate(2deg); }
      100% { transform: scale(1) rotate(0); box-shadow: 0 6px 20px var(--color-shadow), 0 0 0 1px var(--color-accent) inset; }
    }
    .cast-charge-wrap { width: 220px; }
    .cast-charge-bar {
      width: 100%; height: 3px; border-radius: 999px;
      background: var(--color-border);
      overflow: hidden;
    }
    .cast-charge-fill {
      height: 100%; width: 0%;
      background: var(--color-accent);
      transition: width 0.1s linear;
    }
    .cast-line {
      font-size: 13px; letter-spacing: 4px;
      color: var(--color-text-primary);
      min-height: 20px;
      animation: fadeInSlide 0.6s ease both;
    }
    @keyframes fadeInSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    /* ============ 翻牌 ============ */
    .reveal-page {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .reveal-hint {
      font-size: 11px;
      letter-spacing: 4px;
      color: var(--color-text-secondary);
      text-align: center;
    }
    .reveal-map {
      position: relative;
      width: 100%;
      aspect-ratio: 3 / 2.3;
      border: 1px dashed var(--color-border);
      border-radius: 14px;
      background: rgba(0,0,0,0.12);
      margin: 16px 0;
      box-sizing: border-box;
    }
    .reveal-card-slot {
      position: absolute;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .reveal-card {
      width: 72px;
      height: 108px;
      perspective: 600px;
      cursor: pointer;
    }
    .reveal-card-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.6s cubic-bezier(.4, 0, .2, 1);
    }
    .reveal-card.is-flipped .reveal-card-inner {
      transform: rotateY(180deg);
    }
    .reveal-card-back, .reveal-card-face {
      position: absolute;
      inset: 0;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      border-radius: 8px;
      border: 1px solid var(--color-border);
      box-shadow: 0 4px 12px var(--color-shadow);
    }
    .reveal-card-back {
      background: var(--color-bg-secondary);
      color: var(--color-accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .reveal-card-back .mini-back {
      width: 70%;
      height: 80%;
      opacity: 0.8;
    }
    .reveal-card-face {
      background: var(--color-bg-tertiary);
      transform: rotateY(180deg);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .reveal-card-face-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4px;
      box-sizing: border-box;
      text-align: center;
    }
    .reveal-card-face-inner.is-reversed {
      transform: rotate(180deg);
    }
    .reveal-card-face-symbol {
      width: 24px;
      height: 34px;
      opacity: 0.25;
      color: var(--color-accent);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .reveal-card-face-symbol svg {
      width: 100%;
      height: 100%;
    }
    .reveal-card-face-name {
      font-size: 11px;
      letter-spacing: 1px;
      color: var(--color-text-primary);
      margin-top: 4px;
      font-weight: 500;
    }
    .reveal-card-face-dir {
      font-size: 8px;
      letter-spacing: 1px;
      color: var(--color-text-tertiary);
      margin-top: 2px;
    }
    .reveal-card-pos-name {
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--color-text-tertiary);
    }
    .reveal-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-top: auto;
    }
    .btn-reveal-all {
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      padding: 8px 18px;
      border-radius: 999px;
      background: transparent;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    }
    .btn-reveal-all:active {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }

    /* ============ 结果与解读 ============ */
    .result-page {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .result-header {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .result-title {
      font-size: 16px;
      letter-spacing: 6px;
      color: var(--color-text-primary);
    }
    .result-meta {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .result-meta span {
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      font-size: 10px;
      letter-spacing: 1px;
      color: var(--color-text-secondary);
    }
    .result-intent {
      padding: 12px 16px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--color-text-tertiary);
      text-align: center;
      letter-spacing: 1px;
      max-width: 90%;
      margin: 0 auto;
    }
    .result-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .result-cards-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .result-card-item {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: resultCardFadeIn 0.5s ease both;
    }
    @keyframes resultCardFadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .result-card-item-header {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .result-card-mini-view {
      width: 36px;
      height: 52px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-tertiary);
      color: var(--color-accent);
      flex-shrink: 0;
    }
    .result-card-mini-view.is-reversed {
      transform: rotate(180deg);
    }
    .result-card-mini-view .mini-back {
      width: 70%;
      height: 80%;
      opacity: 0.8;
    }
    .result-card-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .result-card-pos {
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--color-text-tertiary);
    }
    .result-card-title {
      font-size: 14px;
      letter-spacing: 2px;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .result-card-dir {
      font-size: 10px;
      letter-spacing: 1px;
      color: var(--color-accent);
      opacity: 0.8;
    }
    .result-card-keywords {
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--color-text-secondary);
      border-bottom: 1px solid rgba(255,255,255,0.04);
      padding-bottom: 8px;
    }
    .result-card-body {
      font-size: 13px;
      line-height: 1.8;
      color: var(--color-text-primary);
      letter-spacing: 1px;
    }
    .result-card-whisper {
      font-style: italic;
      color: var(--color-text-primary);
      border-left: 2px solid var(--color-accent);
      padding: 8px 12px;
      padding-left: 10px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 4px;
    }
    .result-card-meaning {
      color: var(--color-text-secondary);
    }

    /* 占星骰子结果 */
    .result-dice-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .result-dice-card {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: resultCardFadeIn 0.5s ease both;
    }
    .result-dice-card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .result-dice-label {
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--color-text-tertiary);
    }
    .result-dice-name {
      font-size: 14px;
      letter-spacing: 2px;
      color: var(--color-text-primary);
    }
    .result-dice-meaning {
      font-size: 13px;
      line-height: 1.8;
      color: var(--color-text-secondary);
      letter-spacing: 1px;
    }
    .result-actions {
      display: flex;
      justify-content: center;
      margin-top: 10px;
    }
  `;
}
