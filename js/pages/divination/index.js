import { goBack } from '../../router.js';
import { toast, haptic, escapeHtml, sleep } from '../../utils.js';

let state = null;
let rootRef = null;
let purifyRAF = 0;
let purifyLastTs = 0;
let meditationTimer = 0;
let pressState = null;

/* ============ 常量 ============ */

const PURIFY_HOLD_MS = 2400;  // 长按满值所需时间
const MEDITATION_MS = 30000;  // 冥想 30 秒
const SWIPE_THRESHOLD = 40;   // 卡牌滑动切换阈值 (px)

const CARD_TYPES = [
  { id: 'tarot',     name: '塔  罗',    sub: '78 张 · 象征之语', symbol: 'tarot' },
  { id: 'lenormand', name: '雷 诺 曼',  sub: '36 张 · 直白之言', symbol: 'lenormand' },
  { id: 'astroDice', name: '占 星 骰',  sub: '3 骰 · 星轨落定',  symbol: 'dice' },
];

const BUILT_IN_SPREADS = [
  {
    id: 'single',
    name: '单 牌',
    description: '当下最需要知道的那一句。',
    positions: [{ index: 1, name: '此刻', x: 50, y: 50 }],
  },
  {
    id: 'three',
    name: '三 牌 阵',
    description: '过去、现在与未来的流向。',
    positions: [
      { index: 1, name: '过去', x: 20, y: 50 },
      { index: 2, name: '现在', x: 50, y: 50 },
      { index: 3, name: '未来', x: 80, y: 50 },
    ],
  },
  {
    id: 'crossroad',
    name: '心 之 岔 路',
    description: '心之所向、身之所往，以及两者之间的桥梁。',
    positions: [
      { index: 1, name: '心声', x: 30, y: 30 },
      { index: 2, name: '行动', x: 70, y: 30 },
      { index: 3, name: '桥梁', x: 50, y: 72 },
    ],
  },
  {
    id: 'celtic',
    name: '凯 尔 特 十 字',
    description: '深入而立体的十位剖析。',
    positions: [
      { index: 1, name: '当前',   x: 40, y: 50 },
      { index: 2, name: '阻碍',   x: 40, y: 50 },
      { index: 3, name: '意识',   x: 40, y: 20 },
      { index: 4, name: '过去',   x: 15, y: 50 },
      { index: 5, name: '潜意识', x: 40, y: 80 },
      { index: 6, name: '未来',   x: 65, y: 50 },
      { index: 7, name: '自我',   x: 88, y: 82 },
      { index: 8, name: '环境',   x: 88, y: 60 },
      { index: 9, name: '希望',   x: 88, y: 38 },
      { index: 10, name: '结局',  x: 88, y: 16 },
    ],
  },
];

const FOCUS_OPTIONS = [
  { id: 'meaning', name: '解 读 牌 意', sub: '专注于牌本身的象征与讯息' },
  { id: 'message', name: '传 达 信 息', sub: '让 TA 借由牌面对你说些什么' },
];

/* ============ 生命周期 ============ */

export async function render(root) {
  rootRef = root;
  state = createInitialState();
  root.innerHTML = renderShell();
  attachPageEvents();
  renderStep();
}

export function destroy() {
  cancelAnimationFrame(purifyRAF);
  if (meditationTimer) { clearInterval(meditationTimer); meditationTimer = 0; }
  window.removeEventListener('pointerup', onGlobalPointerUp);
  window.removeEventListener('pointercancel', onGlobalPointerUp);
  window.removeEventListener('pointermove', onGlobalPointerMove);
  rootRef = null;
  state = null;
  pressState = null;
}

function createInitialState() {
  return {
    step: 'purify',
    purifyMode: 'crystal',
    purifyCharge: 0,
    purifyDone: false,
    type: null,
    typeIndex: 1,
    spread: null,
    spreadIndex: 1,
    spreads: BUILT_IN_SPREADS.slice(),
    intentMode: 'question',
    question: '',
    meditationRemain: MEDITATION_MS / 1000,
    meditationDone: false,
    focus: 'meaning',
  };
}

/* ============ 骨架 & 步骤切换 ============ */

function renderShell() {
  return `
    <div class="div-page page">
      <button class="div-nav div-nav-back" data-act="nav-back" type="button" aria-label="返回">${iconBack()}</button>
      <button class="div-nav div-nav-restart" data-act="nav-restart" type="button" aria-label="重来">${iconRestart()}</button>
      <div class="div-step-label" data-role="step-label">净  化</div>
      <div class="div-stage" data-role="stage"></div>
      <style>${pageCSS()}</style>
    </div>
  `;
}

function attachPageEvents() {
  rootRef.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.getAttribute('data-act');
    if (act === 'nav-back')    onNavBack();
    if (act === 'nav-restart') onNavRestart();
  });
  window.addEventListener('pointerup', onGlobalPointerUp);
  window.addEventListener('pointercancel', onGlobalPointerUp);
  window.addEventListener('pointermove', onGlobalPointerMove);
}

function onNavBack() {
  haptic(6);
  const order = ['purify', 'pickType', 'pickSpread', 'setIntent', 'draw'];
  const idx = order.indexOf(state.step);
  if (idx <= 0) {
    goBack('/home');
    return;
  }
  const prev = order[idx - 1];
  // 骰子跳过 pickSpread：若从 setIntent 回退且当前是骰子，则回到 pickType
  if (state.step === 'setIntent' && state.type === 'astroDice') {
    goTo('pickType');
    return;
  }
  goTo(prev);
}

function onNavRestart() {
  haptic(8);
  state = createInitialState();
  goTo('purify');
}

function goTo(step) {
  cancelAnimationFrame(purifyRAF);
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
    purify: '净  化',
    pickType: '选  类',
    pickSpread: '设  阵',
    setIntent: '起  意',
    draw: '抽  牌',
  };
  label.textContent = labels[state.step] || '';

  // 净化步骤不显示"重来"
  restart.style.opacity = state.step === 'purify' ? '0' : '1';
  restart.style.pointerEvents = state.step === 'purify' ? 'none' : 'auto';

  if (state.step === 'purify')       renderPurify(stage);
  else if (state.step === 'pickType')   renderPickType(stage);
  else if (state.step === 'pickSpread') renderPickSpread(stage);
  else if (state.step === 'setIntent')  renderSetIntent(stage);
  else if (state.step === 'draw')       renderDraw(stage);
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
        <svg class="crystal-glow" viewBox="0 0 200 200"><circle cx="100" cy="100" r="82" /></svg>
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
      <div class="flash-overlay" data-role="flash"></div>
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
  const tabs = stage.querySelectorAll('[data-act="purify-mode"]');
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      if (state.purifyDone) return;
      state.purifyMode = t.getAttribute('data-val');
      state.purifyCharge = 0;
      renderPurify(stage);
    });
  });

  const crystal = stage.querySelector('[data-role="crystal"]');
  crystal.addEventListener('pointerdown', onCrystalDown);
}

function onCrystalDown(e) {
  if (!state || state.step !== 'purify' || state.purifyDone) return;
  e.preventDefault();
  haptic(10);
  if (state.purifyMode === 'crystal') {
    startCrystalCharge();
  } else {
    burstMist();
  }
}

function startCrystalCharge() {
  pressState = { kind: 'purify' };
  purifyLastTs = performance.now();
  const loop = (ts) => {
    if (!pressState || pressState.kind !== 'purify') return;
    const dt = ts - purifyLastTs;
    purifyLastTs = ts;
    state.purifyCharge = Math.min(1, state.purifyCharge + dt / PURIFY_HOLD_MS);
    updateChargeRing();
    if (state.purifyCharge >= 1) {
      pressState = null;
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
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const p = document.createElement('span');
    p.className = 'mist-particle';
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    p.style.setProperty('--delay', (Math.random() * 0.15) + 's');
    p.style.setProperty('--size', (6 + Math.random() * 10) + 'px');
    mist.appendChild(p);
  }
  // 全屏微光
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

function onGlobalPointerUp() {
  if (pressState && pressState.kind === 'purify') {
    pressState = null;
    cancelAnimationFrame(purifyRAF);
    // 松手回落
    const decay = () => {
      if (!state || state.step !== 'purify' || state.purifyDone) return;
      state.purifyCharge = Math.max(0, state.purifyCharge - 0.02);
      updateChargeRing();
      if (state.purifyCharge > 0) purifyRAF = requestAnimationFrame(decay);
    };
    purifyRAF = requestAnimationFrame(decay);
  }
  if (pressState && pressState.kind === 'swipe') {
    finishSwipe();
  }
}

/* ============ 步骤 2 · 选类（卡牌 swiper） ============ */

function renderPickType(stage) {
  stage.innerHTML = `
    <div class="deck">
      <div class="deck-caption">选  择  你  想  倾  听  的  语  言</div>
      <div class="deck-stage" data-role="deck-stage">
        ${CARD_TYPES.map((c, i) => `
          <div class="deck-card" data-idx="${i}" data-type="${c.id}">
            <div class="deck-card-inner">
              <div class="deck-card-back">
                ${cardBackSVG(c.symbol)}
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
      <div class="deck-dots">
        ${CARD_TYPES.map((_, i) => `<span class="deck-dot" data-idx="${i}"></span>`).join('')}
      </div>
      <div class="deck-hint">左  右  滑  动  ·  轻  触  中  央  卡  以  确  认</div>
    </div>
  `;
  updateDeckPositions();
  bindDeckSwipe(stage);
}

function updateDeckPositions() {
  const cards = rootRef.querySelectorAll('.deck-card');
  cards.forEach((c) => {
    const idx = Number(c.getAttribute('data-idx'));
    const diff = idx - state.typeIndex;
    let pos = 'hidden';
    if (diff === -1) pos = 'prev';
    else if (diff === 0) pos = 'active';
    else if (diff === 1) pos = 'next';
    else pos = diff < 0 ? 'far-left' : 'far-right';
    c.setAttribute('data-pos', pos);
  });
  rootRef.querySelectorAll('.deck-dot').forEach((d, i) => {
    d.setAttribute('data-on', i === state.typeIndex ? '1' : '0');
  });
}

function bindDeckSwipe(stage) {
  const deckStage = stage.querySelector('[data-role="deck-stage"]');
  deckStage.addEventListener('pointerdown', (e) => {
    pressState = {
      kind: 'swipe',
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      target: 'pickType',
    };
  });
  // 中间卡点击 → 确认
  deckStage.addEventListener('click', (e) => {
    if (pressState && pressState.moved) return;
    const card = e.target.closest('.deck-card');
    if (!card) return;
    const idx = Number(card.getAttribute('data-idx'));
    if (idx !== state.typeIndex) {
      state.typeIndex = idx;
      updateDeckPositions();
      haptic(6);
      return;
    }
    confirmTypeCard(card);
  });
  // 点圆点跳转
  stage.querySelectorAll('.deck-dot').forEach((d) => {
    d.addEventListener('click', () => {
      state.typeIndex = Number(d.getAttribute('data-idx'));
      updateDeckPositions();
      haptic(6);
    });
  });
}

function onGlobalPointerMove(e) {
  if (!pressState || pressState.kind !== 'swipe') return;
  const dx = e.clientX - pressState.startX;
  const dy = e.clientY - pressState.startY;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pressState.moved = true;
  const stage = rootRef && rootRef.querySelector('[data-role="deck-stage"]');
  if (stage) stage.style.setProperty('--drag', dx + 'px');
}

function finishSwipe() {
  if (!pressState) return;
  const stage = rootRef && rootRef.querySelector('[data-role="deck-stage"]');
  if (stage) stage.style.setProperty('--drag', '0px');
  if (!pressState.moved) { pressState = null; return; }
  const dx = (parseFloat(stage && stage.style.getPropertyValue('--drag')) || 0);
  // 使用 pressState 里最新差
  // 由于我们已把 --drag 清零，改用另一路径：直接比 startX 与最后 clientX 不可得
  pressState = null;
  // 简化：改用外层记录最后 dx
}

// 使用一个更直接的 swipe 结束逻辑：pointerup 时读取 --drag 之前的值
function swipeCommit(dx) {
  if (Math.abs(dx) < SWIPE_THRESHOLD) return;
  const dir = dx > 0 ? -1 : 1;
  if (state.step === 'pickType') {
    const next = Math.max(0, Math.min(CARD_TYPES.length - 1, state.typeIndex + dir));
    if (next !== state.typeIndex) {
      state.typeIndex = next;
      updateDeckPositions();
      haptic(6);
    }
  } else if (state.step === 'pickSpread') {
    const next = Math.max(0, Math.min(state.spreads.length - 1, state.spreadIndex + dir));
    if (next !== state.spreadIndex) {
      state.spreadIndex = next;
      updateSpreadPositions();
      haptic(6);
    }
  }
}

// 覆盖 onGlobalPointerUp / onGlobalPointerMove 里 swipe 分支
// 重写手势状态：更简单可靠的做法 —— 在 pointermove 里直接累积 dx，pointerup 里用它 commit
function onGlobalPointerUpSwipe(e) {
  if (pressState && pressState.kind === 'swipe') {
    const dx = e.clientX - pressState.startX;
    const stage = rootRef && rootRef.querySelector('[data-role="deck-stage"], [data-role="spread-stage"]');
    if (stage) stage.style.setProperty('--drag', '0px');
    const moved = pressState.moved;
    pressState = null;
    if (moved) swipeCommit(dx);
  }
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
  stage.innerHTML = `
    <div class="deck">
      <div class="deck-caption">为  这  次  提  问  选  一  个  牌  阵</div>
      <div class="deck-stage" data-role="spread-stage">
        ${state.spreads.map((s, i) => `
          <div class="deck-card spread-card" data-idx="${i}" data-spread="${s.id}">
            <div class="deck-card-inner">
              <div class="deck-card-back spread-back">
                <div class="spread-map">
                  ${s.positions.map(p => `
                    <span class="spread-pt" style="left:${p.x}%;top:${p.y}%">
                      <em>${p.index}</em>
                    </span>
                  `).join('')}
                </div>
                <div class="deck-card-title">${s.name}</div>
                <div class="deck-card-sub spread-desc">${escapeHtml(s.description)}</div>
              </div>
              <div class="deck-card-face"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="deck-dots">
        ${state.spreads.map((_, i) => `<span class="deck-dot" data-idx="${i}"></span>`).join('')}
      </div>
      <button class="div-primary" data-act="confirm-spread" type="button">选  择  此  牌  阵</button>
    </div>
  `;
  updateSpreadPositions();
  bindSpreadEvents(stage);
}

function updateSpreadPositions() {
  const cards = rootRef.querySelectorAll('.spread-card');
  cards.forEach((c) => {
    const idx = Number(c.getAttribute('data-idx'));
    const diff = idx - state.spreadIndex;
    let pos = 'hidden';
    if (diff === -1) pos = 'prev';
    else if (diff === 0) pos = 'active';
    else if (diff === 1) pos = 'next';
    else pos = diff < 0 ? 'far-left' : 'far-right';
    c.setAttribute('data-pos', pos);
  });
  rootRef.querySelectorAll('.deck-dot').forEach((d, i) => {
    d.setAttribute('data-on', i === state.spreadIndex ? '1' : '0');
  });
}

function bindSpreadEvents(stage) {
  const spreadStage = stage.querySelector('[data-role="spread-stage"]');
  spreadStage.addEventListener('pointerdown', (e) => {
    pressState = { kind: 'swipe', startX: e.clientX, startY: e.clientY, moved: false, target: 'pickSpread' };
  });
  spreadStage.addEventListener('click', (e) => {
    if (pressState && pressState.moved) return;
    const card = e.target.closest('.spread-card');
    if (!card) return;
    const idx = Number(card.getAttribute('data-idx'));
    if (idx !== state.spreadIndex) {
      state.spreadIndex = idx;
      updateSpreadPositions();
      haptic(6);
    }
  });
  stage.querySelectorAll('.deck-dot').forEach((d) => {
    d.addEventListener('click', () => {
      state.spreadIndex = Number(d.getAttribute('data-idx'));
      updateSpreadPositions();
      haptic(6);
    });
  });
  stage.querySelector('[data-act="confirm-spread"]').addEventListener('click', () => {
    state.spread = state.spreads[state.spreadIndex];
    haptic(10);
    goTo('setIntent');
  });
}

/* ============ 步骤 4 · 起意 ============ */

function renderSetIntent(stage) {
  const intentBody = state.intentMode === 'question' ? renderIntentQuestion() : renderIntentMeditation();
  stage.innerHTML = `
    <div class="intent">
      <div class="intent-tabs">
        <button class="intent-tab" data-act="intent-mode" data-val="question"
          data-on="${state.intentMode === 'question' ? '1' : '0'}" type="button">写  下  问  题</button>
        <button class="intent-tab" data-act="intent-mode" data-val="meditation"
          data-on="${state.intentMode === 'meditation' ? '1' : '0'}" type="button">冥  想  开  始</button>
      </div>
      <div class="intent-body">${intentBody}</div>

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
        <div class="breath-text" data-role="breath-text">
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
    goTo('draw');
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
    const textEl = rootRef && rootRef.querySelector('[data-role="breath-text"]');
    if (state.meditationRemain <= 0) {
      clearInterval(meditationTimer);
      meditationTimer = 0;
      state.meditationDone = true;
      if (remainEl) remainEl.textContent = '';
      if (textEl) textEl.textContent = '心  已  就  绪';
      updateIntentGoState();
      haptic(18);
    } else {
      if (remainEl) remainEl.textContent = `剩  余  ${state.meditationRemain}  秒`;
    }
  }, 1000);
}

/* ============ 步骤 5 · 抽牌（占位） ============ */

function renderDraw(stage) {
  const typeName = (CARD_TYPES.find(c => c.id === state.type) || {}).name || '';
  const spreadName = state.spread ? state.spread.name : '';
  const intentTxt = state.intentMode === 'question'
    ? (state.question || '未填写问题')
    : '以冥想为引';
  const focusName = (FOCUS_OPTIONS.find(f => f.id === state.focus) || {}).name || '';

  stage.innerHTML = `
    <div class="draw-placeholder">
      <div class="ph-title">仪  式  就  绪</div>
      <div class="ph-list">
        <div class="ph-row"><span>占  卜  类  型</span><em>${typeName}</em></div>
        ${state.spread ? `<div class="ph-row"><span>牌  阵</span><em>${spreadName}</em></div>` : ''}
        <div class="ph-row"><span>意  图</span><em>${escapeHtml(intentTxt)}</em></div>
        <div class="ph-row"><span>侧  重</span><em>${focusName}</em></div>
      </div>
      <div class="ph-note">抽  牌  与  翻  牌  将  在  下  一  批  次  接  入</div>
      <button class="div-primary" data-act="ph-restart" type="button">重  新  开  始</button>
    </div>
  `;
  stage.querySelector('[data-act="ph-restart"]').addEventListener('click', () => {
    state = createInitialState();
    goTo('purify');
  });
}

/* ============ SVG 图腾（卡背） ============ */

function cardBackSVG(kind) {
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
  // dice
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
    <g transform="translate(50 108)" opacity="0.5">
      <path d="M-24,0 L24,0" stroke="currentColor" stroke-width="0.4"/>
      <path d="M-16,-6 L16,6" stroke="currentColor" stroke-width="0.4"/>
    </g>
  </svg>`;
}

function iconBack() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}
function iconRestart() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15A9 9 0 1 0 6 5.29L1 10"/></svg>`;
}

/* ============ 修正手势 up 事件的实际绑定 ============ */
// 用替身 wrap，把默认 onGlobalPointerUp 里的 swipe 分支替换成 onGlobalPointerUpSwipe
const _origUp = onGlobalPointerUp;
function _combinedUp(e) {
  onGlobalPointerUpSwipe(e);
  _origUp(e);
}
// 覆盖 attachPageEvents 时用的 handler
window.addEventListener('pointerup', _combinedUp, { passive: true });
window.addEventListener('pointercancel', _combinedUp, { passive: true });

/* ============ CSS ============ */

function pageCSS() {
  return `
    .div-page {
      position: relative;
      min-height: 100vh; min-height: 100dvh;
      overflow: hidden;
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
      position: absolute;
      top: calc(20px + env(safe-area-inset-top));
      left: 0; right: 0;
      text-align: center;
      font-size: 10px; letter-spacing: 8px;
      color: var(--color-text-tertiary);
      pointer-events: none;
      z-index: 20;
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
      margin-top: 24px;
    }
    .div-primary:active { transform: scale(0.97); }
    .div-primary[disabled] { opacity: 0.32; pointer-events: none; }

    /* ============ 净化 ============ */
    .purify {
      flex: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 32px;
      position: relative;
    }
    .purify-hint {
      font-size: 11px; letter-spacing: 4px;
      color: var(--color-text-secondary);
      margin-top: 12px;
    }
    .crystal-wrap {
      position: relative;
      width: 240px; height: 240px;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent);
      --charge: 0;
      touch-action: none;
      user-select: none;
    }
    .crystal-glow {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    .crystal-glow circle {
      fill: currentColor;
      opacity: calc(0.08 + var(--charge) * 0.28);
      filter: blur(28px);
      transition: opacity 0.15s;
    }
    .crystal-svg {
      position: relative; z-index: 2;
      color: var(--color-accent);
      filter: drop-shadow(0 0 calc(6px + var(--charge) * 16px) currentColor);
      animation: crystalFloat 5s ease-in-out infinite;
    }
    @keyframes crystalFloat {
      0%,100% { transform: translateY(0) rotate(0); }
      50% { transform: translateY(-6px) rotate(2deg); }
    }
    .crystal-outer { animation: crystalOuterSpin 40s linear infinite; transform-origin: 60px 60px; }
    .crystal-inner { animation: crystalInnerPulse 4s ease-in-out infinite; transform-origin: 60px 60px; }
    @keyframes crystalOuterSpin { to { transform: rotate(360deg); } }
    @keyframes crystalInnerPulse {
      0%,100% { transform: scale(1); opacity: 0.85; }
      50%     { transform: scale(1.06); opacity: 1; }
    }
    .charge-ring {
      position: absolute; inset: 50% auto auto 50%;
      transform: translate(-50%, -50%);
      color: var(--color-accent);
      pointer-events: none;
      z-index: 3;
      transition: filter 0.2s;
    }
    .charge-ring-fill { transition: stroke-dashoffset 0.15s linear; }

    .mist-layer {
      position: absolute; inset: 0;
      pointer-events: none;
      z-index: 4;
    }
    .mist-particle {
      position: absolute; left: 50%; top: 50%;
      width: var(--size, 10px); height: var(--size, 10px);
      margin-left: calc(var(--size, 10px) * -0.5);
      margin-top:  calc(var(--size, 10px) * -0.5);
      border-radius: 50%;
      background: radial-gradient(circle, currentColor 0%, transparent 70%);
      color: var(--color-accent);
      opacity: 0;
      animation: mistFly 1.4s ease-out var(--delay, 0s) forwards;
    }
    @keyframes mistFly {
      0%   { transform: translate(0, 0) scale(0.4); opacity: 0.9; }
      100% { transform: translate(var(--dx), var(--dy)) scale(1.4); opacity: 0; }
    }

    .flash-overlay {
      position: fixed; inset: 0; z-index: 60;
      background: #ffffff;
      opacity: 0; pointer-events: none;
    }
    .flash-overlay.is-flash { animation: flashSoft 0.7s ease-out; }
    .flash-overlay.is-final { animation: flashFinal 0.9s ease-out; }
    @keyframes flashSoft {
      0%   { opacity: 0; }
      30%  { opacity: 0.35; }
      100% { opacity: 0; }
    }
    @keyframes flashFinal {
      0%   { opacity: 0; }
      35%  { opacity: 0.8; }
      100% { opacity: 0; }
    }

    .purify-tabs {
      display: inline-flex; gap: 6px;
      padding: 4px;
      border-radius: 999px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
    }
    .purify-tab {
      padding: 8px 18px;
      border-radius: 999px;
      font-size: 11px; letter-spacing: 3px;
      color: var(--color-text-secondary);
      background: transparent;
      border: none; cursor: pointer;
      transition: color 0.2s, background 0.2s;
    }
    .purify-tab[data-on="1"] {
      color: var(--color-bg-primary);
      background: var(--color-accent);
    }

    /* ============ 卡牌 swiper ============ */
    .deck {
      flex: 1;
      display: flex; flex-direction: column; align-items: center;
      gap: 18px;
      position: relative;
    }
    .deck-caption {
      font-size: 11px; letter-spacing: 4px;
      color: var(--color-text-secondary);
      margin-top: 8px;
    }
    .deck-stage {
      position: relative;
      width: 100%;
      height: 400px;
      perspective: 1200px;
      --drag: 0px;
      touch-action: pan-y;
      user-select: none;
    }
    .deck-card {
      position: absolute;
      left: 50%; top: 50%;
      width: 220px; height: 320px;
      margin-left: -110px; margin-top: -160px;
      transition: transform 0.42s cubic-bezier(.4,.1,.2,1), opacity 0.42s, filter 0.42s;
      transform-style: preserve-3d;
      cursor: pointer;
      color: var(--color-accent);
    }
    .deck-card[data-pos="active"]    { transform: translateX(calc(var(--drag) * 0.5)) translateZ(60px) scale(1.02); z-index: 5; opacity: 1; }
    .deck-card[data-pos="prev"]      { transform: translateX(calc(-140px + var(--drag) * 0.5)) translateZ(0) rotateY(20deg) scale(0.86); z-index: 3; opacity: 0.55; filter: blur(0.4px); }
    .deck-card[data-pos="next"]      { transform: translateX(calc(140px + var(--drag) * 0.5))  translateZ(0) rotateY(-20deg) scale(0.86); z-index: 3; opacity: 0.55; filter: blur(0.4px); }
    .deck-card[data-pos="far-left"]  { transform: translateX(-260px) scale(0.7); opacity: 0; z-index: 1; }
    .deck-card[data-pos="far-right"] { transform: translateX(260px) scale(0.7);  opacity: 0; z-index: 1; }
    .deck-card[data-pos="hidden"]    { opacity: 0; pointer-events: none; }

    .deck-card-inner {
      position: relative;
      width: 100%; height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.7s cubic-bezier(.5,.05,.1,1);
    }
    .deck-card.is-flipping .deck-card-inner { transform: rotateY(180deg); }
    .deck-card-back, .deck-card-face {
      position: absolute; inset: 0;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      border-radius: 14px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 16px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      box-shadow: 0 12px 40px var(--color-shadow);
    }
    .deck-card-face {
      transform: rotateY(180deg);
      background: var(--color-bg-tertiary);
    }
    .deck-card[data-pos="active"] .deck-card-back {
      box-shadow: 0 14px 44px var(--color-shadow),
        0 0 0 1px var(--color-accent) inset;
      animation: cardBreath 3.6s ease-in-out infinite;
    }
    @keyframes cardBreath {
      0%,100% { filter: drop-shadow(0 0 0 transparent); }
      50%     { filter: drop-shadow(0 0 12px currentColor); }
    }
    .deck-card-svg {
      width: 84%; height: auto;
      color: var(--color-accent);
      opacity: 0.85;
      margin-bottom: 12px;
    }
    .deck-card-title {
      font-size: 15px; letter-spacing: 4px;
      color: var(--color-text-primary);
      margin-bottom: 6px;
    }
    .deck-card-sub {
      font-size: 10px; letter-spacing: 3px;
      color: var(--color-text-tertiary);
      text-align: center;
    }
    .deck-dots {
      display: flex; gap: 8px;
      margin-top: 8px;
    }
    .deck-dot {
      width: 6px; height: 6px; border-radius: 999px;
      background: var(--color-text-tertiary);
      opacity: 0.4;
      cursor: pointer;
      transition: opacity 0.2s, width 0.2s;
    }
    .deck-dot[data-on="1"] { opacity: 1; width: 18px; background: var(--color-accent); }
    .deck-hint {
      font-size: 10px; letter-spacing: 3px;
      color: var(--color-text-tertiary);
      margin-top: 6px;
    }

    /* ============ 牌阵专属 ============ */
    .spread-back { padding: 14px; }
    .spread-map {
      position: relative;
      width: 92%; aspect-ratio: 3 / 2;
      margin-bottom: 12px;
      border: 1px dashed var(--color-border);
      border-radius: 8px;
    }
    .spread-pt {
      position: absolute;
      width: 22px; height: 30px;
      transform: translate(-50%, -50%);
      background: var(--color-accent);
      color: var(--color-bg-primary);
      border-radius: 3px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px;
      box-shadow: 0 2px 6px var(--color-shadow);
    }
    .spread-pt em { font-style: normal; letter-spacing: 0; }
    .spread-desc {
      padding: 0 6px;
      line-height: 1.6;
      white-space: normal;
    }

    /* ============ 意图 ============ */
    .intent {
      flex: 1;
      display: flex; flex-direction: column;
      gap: 22px;
    }
    .intent-tabs {
      display: flex; gap: 6px;
      padding: 4px;
      border-radius: 999px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      align-self: center;
    }
    .intent-tab {
      padding: 10px 20px;
      border-radius: 999px;
      font-size: 12px; letter-spacing: 4px;
      color: var(--color-text-secondary);
      background: transparent; border: none;
      transition: color 0.2s, background 0.2s;
    }
    .intent-tab[data-on="1"] {
      color: var(--color-bg-primary);
      background: var(--color-accent);
    }
    .intent-body { min-height: 220px; }

    .intent-question {
      display: flex; flex-direction: column; gap: 12px;
      align-items: stretch;
    }
    .intent-hint {
      font-size: 11px; letter-spacing: 3px;
      color: var(--color-text-tertiary);
      text-align: center;
    }
    .intent-textarea {
      width: 100%; min-height: 160px;
      padding: 16px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      color: var(--color-text-primary);
      font-size: 15px; line-height: 1.8;
      letter-spacing: 1px;
      resize: none;
      transition: border-color 0.2s;
    }
    .intent-textarea:focus { border-color: var(--color-accent); outline: none; }

    .intent-meditation {
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      padding: 12px 0;
    }
    .breath-wrap {
      position: relative;
      width: 180px; height: 180px;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent);
    }
    .breath-ring {
      position: absolute; inset: 0;
      border-radius: 50%;
      border: 1px solid currentColor;
      opacity: 0.25;
      animation: breathRing 6s ease-in-out infinite;
    }
    .breath-core {
      width: 90px; height: 90px;
      border-radius: 50%;
      background: radial-gradient(circle, currentColor 0%, transparent 70%);
      opacity: 0.4;
      animation: breathCore 6s ease-in-out infinite;
    }
    .breath-text {
      position: absolute;
      font-size: 10px; letter-spacing: 4px;
      color: var(--color-text-secondary);
    }
    @keyframes breathRing {
      0%,100% { transform: scale(0.6); opacity: 0.15; }
      50%     { transform: scale(1);   opacity: 0.5; }
    }
    @keyframes breathCore {
      0%,100% { transform: scale(0.6); opacity: 0.2; }
      50%     { transform: scale(1.1); opacity: 0.55; }
    }
    .meditation-remain {
      font-size: 11px; letter-spacing: 4px;
      color: var(--color-text-tertiary);
      min-height: 16px;
    }

    .intent-section-title {
      font-size: 10px; letter-spacing: 4px;
      color: var(--color-text-tertiary);
      text-align: center;
      margin-bottom: 10px;
    }
    .focus-list {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    }
    .focus-card {
      padding: 16px 12px;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      text-align: center;
      display: flex; flex-direction: column; gap: 6px;
      cursor: pointer;
      transition: border-color 0.2s, transform 0.15s;
    }
    .focus-card:active { transform: scale(0.97); }
    .focus-card[data-on="1"] {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent) inset;
    }
    .focus-name {
      font-size: 13px; letter-spacing: 3px;
      color: var(--color-text-primary);
    }
    .focus-sub {
      font-size: 10px; letter-spacing: 1px;
      color: var(--color-text-tertiary);
      line-height: 1.6;
    }
    .intent-go { align-self: center; }

    /* ============ 抽牌占位 ============ */
    .draw-placeholder {
      flex: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 18px;
      text-align: center;
    }
    .ph-title {
      font-size: 15px; letter-spacing: 6px;
      color: var(--color-text-primary);
    }
    .ph-list {
      width: 100%;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 14px;
      padding: 8px 4px;
    }
    .ph-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
    }
    .ph-row:last-child { border-bottom: none; }
    .ph-row span {
      font-size: 11px; letter-spacing: 3px;
      color: var(--color-text-tertiary);
      flex-shrink: 0;
    }
    .ph-row em {
      font-style: normal;
      font-size: 13px; letter-spacing: 1px;
      color: var(--color-text-primary);
      text-align: right;
      max-width: 66%;
      word-break: break-word;
    }
    .ph-note {
      font-size: 11px; letter-spacing: 3px;
      color: var(--color-text-tertiary);
    }
  `;
}
