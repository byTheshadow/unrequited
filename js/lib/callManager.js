import { db } from '../db.js';
import { ICON, avatarHTML } from '../utils.js';

let audioCtx = null;
let soundInterval = null;
let soundOsc = null;
let soundGain = null;

const SVG_MINIMIZE = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 14 10 14 10 20"/>
    <polyline points="20 10 14 10 14 4"/>
    <line x1="14" y1="10" x2="21" y2="3"/>
    <line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
`;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playIncomingRing() {
  stopSound();
  const ctx = getAudioContext();
  if (!ctx) return;

  soundGain = ctx.createGain();
  soundGain.gain.setValueAtTime(0, ctx.currentTime);
  soundGain.connect(ctx.destination);

  let step = 0;
  soundInterval = setInterval(() => {
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const localGain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      if (step % 2 === 0) {
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(880, now);
      } else {
        osc1.frequency.setValueAtTime(480, now);
        osc2.frequency.setValueAtTime(960, now);
      }
      localGain.gain.setValueAtTime(0, now);
      localGain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      localGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc1.connect(localGain);
      osc2.connect(localGain);
      localGain.connect(soundGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
      step++;
    } catch (err) {}
  }, 1000);

  soundGain.gain.setValueAtTime(0, ctx.currentTime);
  soundGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
}

function playDialingTone() {
  stopSound();
  const ctx = getAudioContext();
  if (!ctx) return;

  soundGain = ctx.createGain();
  soundGain.connect(ctx.destination);
  soundGain.gain.setValueAtTime(0, ctx.currentTime);

  let isBeeping = false;
  soundInterval = setInterval(() => {
    try {
      const now = ctx.currentTime;
      if (!isBeeping) {
        soundOsc = ctx.createOscillator();
        soundOsc.type = 'sine';
        soundOsc.frequency.setValueAtTime(450, now);
        soundGain.gain.cancelScheduledValues(now);
        soundGain.gain.setValueAtTime(0, now);
        soundGain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        soundGain.gain.setValueAtTime(0.1, now + 0.8);
        soundGain.gain.linearRampToValueAtTime(0, now + 0.85);
        soundOsc.connect(soundGain);
        soundOsc.start(now);
        soundOsc.stop(now + 0.9);
        soundOsc.onended = () => {
          try { soundOsc.disconnect(); } catch (e) {}
          soundOsc = null;
        };
        isBeeping = true;
      } else {
        isBeeping = false;
      }
    } catch (err) {}
  }, 1000);
}

function stopSound() {
  if (soundInterval) { clearInterval(soundInterval); soundInterval = null; }
  if (soundOsc) {
    try { soundOsc.stop(); } catch (e) {}
    try { soundOsc.disconnect(); } catch (e) {}
    soundOsc = null;
  }
  if (soundGain) {
    try { if (audioCtx) soundGain.gain.cancelScheduledValues(audioCtx.currentTime); } catch (e) {}
    try { soundGain.disconnect(); } catch (e) {}
    soundGain = null;
  }
}

function formatDuration(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeCssUrl(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function renderWaveBarsHTML(elapsedSeconds, isConnected) {
  const totalBars = 18;
  const progressPercent = isConnected ? Math.min(100, (elapsedSeconds % 60) / 60 * 100) : 0;
  const activeCount = Math.round((progressPercent / 100) * totalBars);
  let html = '';
  for (let i = 0; i < totalBars; i++) {
    const active = i < activeCount ? ' is-active' : '';
    const h = isConnected ? (Math.floor(Math.random() * 18) + 3) : 3;
    html += `<span class="call-player-bar${active}" style="height:${h}px"></span>`;
  }
  return html;
}

export const CallManager = {
  state: 'idle',
  viewMode: 'full',
  conversationId: null,
  characterId: null,
  characterName: '',
  characterAvatar: '',
  isUserInitiator: false,
  startTime: null,
  timerInterval: null,
  autoAnswerTimeout: null,
  particleInterval: null,
  overlay: null,
  minimized: false,

  floatingPos: {
    player: { x: null, y: null },
    ball: { x: null, y: null },
  },

  dragState: {
    active: false,
    moved: false,
    suppressClick: false,
    pointerId: null,
    mode: null,
  },

  init() {
    this.overlay = document.getElementById('global-call-overlay');
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'global-call-overlay';
      document.body.appendChild(this.overlay);
    }
    this.render();
  },

  startCall(conversationId, characterId, characterName, characterAvatar, isUserInitiator = true) {
    if (this.state !== 'idle') return;
    this.conversationId = conversationId;
    this.characterId = characterId;
    this.characterName = characterName;
    this.characterAvatar = characterAvatar;
    this.isUserInitiator = isUserInitiator;
    this.viewMode = 'full';
    this.minimized = false;

    if (isUserInitiator) {
      this.state = 'dialing';
      playDialingTone();
      this.render();
      this.simulateCharacterAnswer();
    } else {
      this.state = 'incoming';
      playIncomingRing();
      this.render();
    }
  },

  minimize() { if (this.state === 'idle') return; this.viewMode = 'player'; this.minimized = true; this.render(); },
  expand() { if (this.state === 'idle') return; this.viewMode = 'full'; this.minimized = false; this.render(); },
  showPlayer() { if (this.state === 'idle') return; this.viewMode = 'player'; this.minimized = true; this.render(); },
  showBall() { if (this.state === 'idle') return; this.viewMode = 'ball'; this.minimized = true; this.render(); },
  toggleMinimize() { if (this.viewMode === 'full') this.showPlayer(); else this.expand(); },

  simulateCharacterAnswer() {
    const delay = Math.floor(Math.random() * 5000) + 3000;
    this.autoAnswerTimeout = setTimeout(async () => {
      if (this.state !== 'dialing') return;
      const rand = Math.random();
      if (rand < 0.8) this.acceptCall();
      else if (rand < 0.95) await this.endCall('busy');
      else await this.endCall('missed');
    }, delay);
  },

  acceptCall() {
    if (this.state !== 'dialing' && this.state !== 'incoming') return;
    stopSound();
    this.state = 'connected';
    this.startTime = Date.now();
    this.render();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  },

  async declineCall() { if (this.state !== 'incoming') return; await this.endCall('declined'); },

  async endCall(statusReason = 'finished') {
    stopSound();
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    if (this.autoAnswerTimeout) { clearTimeout(this.autoAnswerTimeout); this.autoAnswerTimeout = null; }

    let duration = 0;
    if (this.startTime && this.state === 'connected') duration = Math.floor((Date.now() - this.startTime) / 1000);
    const finalStatus = this.state === 'connected' ? 'finished' : statusReason;

    if (this.conversationId) {
      try {
        await db.messages.add({
          conversationId: this.conversationId,
          timestamp: Date.now(),
          sender: this.isUserInitiator ? 'user' : 'character',
          type: 'call',
          content: JSON.stringify({ status: finalStatus, duration }),
        });
        window.dispatchEvent(new CustomEvent('call-history-updated', { detail: { conversationId: this.conversationId } }));
      } catch (err) { console.error('Failed to log call history', err); }
    }

    this.state = 'idle';
    this.viewMode = 'full';
    this.conversationId = null;
    this.characterId = null;
    this.characterName = '';
    this.characterAvatar = '';
    this.isUserInitiator = false;
    this.startTime = null;
    this.minimized = false;
    this.render();
  },

  getStatusText() {
    if (this.state === 'incoming') return '向你发起通话邀请';
    if (this.state === 'connected') return '正在通话';
    if (this.state === 'dialing') return '正在呼叫';
    return '';
  },

  getScreenStatusText() {
    if (this.state === 'incoming') return 'INCOMING VOICE';
    if (this.state === 'connected') return 'VOICE CONNECTED';
    if (this.state === 'dialing') return 'CALLING';
    return '';
  },

  getPlayerKickerText() {
    if (this.state === 'incoming') return 'INCOMING';
    if (this.state === 'connected') return 'NOW PLAYING';
    if (this.state === 'dialing') return 'CALLING';
    return 'CALL';
  },

  getElapsedSeconds() {
    if (!this.startTime || this.state !== 'connected') return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  },

  updateTimer() {
    if (!this.overlay) return;
    const elapsed = this.getElapsedSeconds();
    const timeText = formatDuration(elapsed);

    const fullTimerEl = this.overlay.querySelector('.global-call-time');
    if (fullTimerEl) fullTimerEl.textContent = this.state === 'connected' ? timeText : '00:00';

    const playerTimeEl = this.overlay.querySelector('.call-player-time');
    if (playerTimeEl) playerTimeEl.textContent = this.state === 'connected' ? timeText : '00:00';

    const track = this.overlay.querySelector('.call-player-track');
    if (track) track.innerHTML = renderWaveBarsHTML(elapsed, this.state === 'connected');
  },

  // ---- 飘字粒子系统 ----
  startParticles() {
    if (this.particleInterval) return;
    if (!this.overlay) return;
    const container = this.overlay.querySelector('#particle-container');
    if (!container) return;

    const phrases = [
      '思念是链接的钥匙',
      '跨越时间的爱恋',
      '倾听风的呓语',
      '在这个夜里回响',
      '你在听吗',
      '电流传递着心跳',
      '爱是没有终点的旋律',
      '声音是唯一的线索',
      '哪怕相隔万里',
      '心动有迹可循',
      '呼吸落在耳边',
      '这一刻很近',
      '别让声音熄灭',
      '沉默也有回音',
      '频率正在靠近',
    ];

    const emitPhrase = () => {
      if (this.viewMode !== 'full' || this.state === 'idle') return;
      const c = this.overlay ? this.overlay.querySelector('#particle-container') : null;
      if (!c) return;

      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      
      // 改为在屏幕中下部（50vh 到 75vh 之间）安全区域生成，避免被最底部的动作按钮遮挡
      const baseX = 10 + Math.random() * 70;
      const baseY = 50 + Math.random() * 25; 

      for (let i = 0; i < phrase.length; i++) {
        const delay = i * 220; // 逐字飘浮间隔

        setTimeout(() => {
          if (this.viewMode !== 'full' || this.state === 'idle') return;
          const cont = this.overlay ? this.overlay.querySelector('#particle-container') : null;
          if (!cont) return;

          const el = document.createElement('span');
          el.className = 'float-char';
          el.textContent = phrase[i];

          const x = baseX + (i * 2.2); 
          const size = 16 + Math.random() * 14; 
          const dur = 4.5 + Math.random() * 3.5; 
          const rise = -(200 + Math.random() * 200); // 往上飘的像素距离
          const drift = Math.random() * 60 - 30; // 左右飘移扰动
          const r = Math.random() * 16 - 8; 
          const rr = Math.random() * 20 - 10; 
          const alpha = 0.4 + Math.random() * 0.4; 

          // 将变量传入 CSS
          el.style.cssText = `
            --fc-x: ${Math.max(5, Math.min(95, x))}%;
            --fc-y: ${baseY}%;
            --fc-size: ${size}px;
            --fc-dur: ${dur}s;
            --fc-rise: ${rise}px;
            --fc-drift: ${drift}px;
            --fc-r: ${r}deg;
            --fc-rr: ${rr}deg;
            --fc-alpha: ${alpha};
          `;

          cont.appendChild(el);
          setTimeout(() => { if (el.parentNode) el.remove(); }, (dur + 0.5) * 1000);
        }, delay);
      }
    };

    // 初始化即发射几组文字
    for (let i = 0; i < 3; i++) {
      setTimeout(emitPhrase, i * 800);
    }
    this.particleInterval = setInterval(emitPhrase, 3000);
  },

  stopParticles() {
    if (this.particleInterval) { clearInterval(this.particleInterval); this.particleInterval = null; }
    const c = this.overlay ? this.overlay.querySelector('#particle-container') : null;
    if (c) c.innerHTML = '';
  },

  // ---- 拖拽核心功能（重构绑定在 document，防止移动端断连） ----
  makeElementDraggable(targetEl, handleEl, mode) {
    if (!targetEl) return;
    const dragHandle = handleEl || targetEl;
    const posStore = this.floatingPos[mode] || this.floatingPos.player;

    targetEl.style.touchAction = 'none';
    dragHandle.style.touchAction = 'none';

    if (posStore.x !== null && posStore.y !== null) {
      targetEl.style.left = posStore.x + 'px';
      targetEl.style.top = posStore.y + 'px';
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';
    }

    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let hasMoved = false;

    const onPointerMove = (e) => {
      if (!this.dragState.active || this.dragState.mode !== mode) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.dragState.moved = true;
        this.dragState.suppressClick = true;
        hasMoved = true;
      }
      if (!hasMoved) return;

      const rect = targetEl.getBoundingClientRect();
      const m = 16;
      const maxX = Math.max(m, window.innerWidth - rect.width - m);
      const maxY = Math.max(m, window.innerHeight - rect.height - m);
      const nx = Math.max(m, Math.min(initialX + dx, maxX));
      const ny = Math.max(m, Math.min(initialY + dy, maxY));

      targetEl.style.left = nx + 'px';
      targetEl.style.top = ny + 'px';
      posStore.x = nx;
      posStore.y = ny;

      if (e.cancelable) e.preventDefault();
    };

    const onPointerUp = (e) => {
      // 结束拖拽后卸载全局监听器
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);

      if (!this.dragState.active || this.dragState.mode !== mode) return;

      this.dragState.active = false;
      this.dragState.pointerId = null;
      this.dragState.mode = null;

      if (hasMoved) {
        const rect = targetEl.getBoundingClientRect();
        const m = 16;
        let tx, ty = Math.max(m, Math.min(rect.top, window.innerHeight - rect.height - m));
        
        // 磁吸贴边
        if (rect.left + rect.width / 2 < window.innerWidth / 2) {
          tx = m;
        } else {
          tx = window.innerWidth - rect.width - m;
        }

        targetEl.style.transition = 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        targetEl.style.left = tx + 'px';
        targetEl.style.top = ty + 'px';
        posStore.x = tx;
        posStore.y = ty;

        setTimeout(() => { if (targetEl) targetEl.style.transition = 'none'; }, 320);
      }

      if (this.dragState.suppressClick) {
        setTimeout(() => { this.dragState.suppressClick = false; this.dragState.moved = false; }, 200);
      } else {
        this.dragState.moved = false;
      }
    };

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      this.dragState.active = true;
      this.dragState.moved = false;
      this.dragState.suppressClick = false;
      this.dragState.pointerId = e.pointerId;
      this.dragState.mode = mode;
      hasMoved = false;

      const rect = targetEl.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      targetEl.style.left = initialX + 'px';
      targetEl.style.top = initialY + 'px';
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transition = 'none';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';

      // 绑定全局 document 级别监听器，防止滑动过快移出元素丢失追踪
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);

      if (e.cancelable) e.preventDefault();
    };

    dragHandle.addEventListener('pointerdown', onPointerDown, { passive: false });
  },

  wasJustDragged() {
    return this.dragState.suppressClick || this.dragState.moved;
  },

  renderPlayer() {
    this.stopParticles();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state !== 'idle';
    const isConnected = this.state === 'connected';

    this.overlay.className = 'global-call-active global-call-player';
    this.overlay.innerHTML = `
      <div class="global-call-floating call-player-widget" id="global-call-player">
        <div class="call-player-inner">
          <button class="call-player-mini-btn" id="call-btn-to-ball" type="button" aria-label="最小化"><span></span></button>
          <div class="call-player-drag-handle" id="call-player-drag-handle">
            <div class="call-player-cover">${avatarHTML(this.characterAvatar, this.characterName, 48)}</div>
            <div class="call-player-meta">
              <div class="call-player-kicker">
                <span class="call-player-live-dot" style="${!isConnected ? 'background:#f59e0b;box-shadow:0 0 5px #f59e0b;' : ''}"></span>
                ${escapeHtml(this.getPlayerKickerText())}
              </div>
              <div class="call-player-name">${escapeHtml(this.characterName || 'Unknown')}</div>
              <div class="call-player-subtitle">${escapeHtml(isConnected ? '正在通话 · 声音是唯一的线索' : this.getStatusText())}</div>
            </div>
          </div>
          <div class="call-player-progress-bar">
            <span class="call-player-time">${isConnected ? timeText : '00:00'}</span>
            <div class="call-player-track">${renderWaveBarsHTML(this.getElapsedSeconds(), isConnected)}</div>
            <span class="call-player-live-label">${isConnected ? 'LIVE' : '···'}</span>
          </div>
          <div class="call-player-bottom">
            <div class="call-player-eq ${isPlaying ? 'playing' : ''}"><span></span><span></span><span></span><span></span></div>
            <div class="call-player-hint">拖动移动</div>
          </div>
        </div>
      </div>
    `;

    const player = this.overlay.querySelector('#global-call-player');
    const handle = this.overlay.querySelector('#call-player-drag-handle');
    const toBallBtn = this.overlay.querySelector('#call-btn-to-ball');

    if (player) {
      this.makeElementDraggable(player, handle || player, 'player');
      player.addEventListener('click', (e) => {
        if (this.wasJustDragged()) { e.preventDefault(); e.stopPropagation(); return; }
        this.expand();
      });
    }
    if (toBallBtn) {
      toBallBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this.wasJustDragged()) return;
        this.showBall();
      });
    }
    this.updateTimer();
  },

  renderBall() {
    this.stopParticles();
    this.overlay.className = 'global-call-active global-call-ball';
    this.overlay.innerHTML = `
      <div class="global-call-floating call-ball-widget" id="global-call-ball">
        <div class="call-ball-ring"></div>
        <div class="call-ball-avatar">${avatarHTML(this.characterAvatar, this.characterName, 48)}</div>
        <div class="call-ball-status-dot"></div>
      </div>
    `;

    const ball = this.overlay.querySelector('#global-call-ball');
    if (ball) {
      this.makeElementDraggable(ball, ball, 'ball');
      ball.addEventListener('click', (e) => {
        if (this.wasJustDragged()) { e.preventDefault(); e.stopPropagation(); return; }
        this.showPlayer();
      });
    }
  },

  renderFull() {
    this.overlay.className = 'global-call-active global-call-full';

    const statusText = this.getScreenStatusText();
    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 140);
    const timeText = formatDuration(this.getElapsedSeconds());

    let actionButtons = '';
    // 渲染动作按钮，剥离无用的 span 包裹，将 SVG 直接放在 call-btn 节点下
    if (this.state === 'incoming') {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-decline" id="call-btn-decline" type="button">${ICON.phoneHangup}</button>
            <span class="call-action-label">拒接</span>
          </div>
          <div class="call-action-col">
            <button class="call-btn btn-accept" id="call-btn-accept" type="button">${ICON.phone}</button>
            <span class="call-action-label">接听</span>
          </div>
        </div>`;
    } else if (this.state === 'dialing') {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-hangup" id="call-btn-hangup" type="button">${ICON.phoneHangup}</button>
            <span class="call-action-label">挂断</span>
          </div>
        </div>`;
    } else {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-utility" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>
            </button>
            <span class="call-action-label">静音</span>
          </div>
          <div class="call-action-col">
            <button class="call-btn btn-hangup" id="call-btn-hangup" type="button">${ICON.phoneHangup}</button>
            <span class="call-action-label">挂断</span>
          </div>
          <div class="call-action-col">
            <button class="call-btn btn-utility" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            </button>
            <span class="call-action-label">免提</span>
          </div>
        </div>`;
    }

    const bgStyle = this.characterAvatar ? `background-image:url('${safeCssUrl(this.characterAvatar)}')` : '';

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="${bgStyle}"></div>
        <div class="global-call-mask"></div>
        <div id="particle-container"></div>
        <button class="global-call-minimize-btn" id="call-btn-minimize" type="button">${SVG_MINIMIZE}</button>
        <div class="global-call-content">
          <div class="global-call-info-group">
            <div class="global-call-avatar-wrapper">
              <div class="avatar-inner">${avatarHtmlStr}</div>
            </div>
            <h2 class="global-call-name">${escapeHtml(this.characterName || '')}</h2>
            <p class="global-call-status">
              ${this.state === 'connected' ? '<span class="status-dot"></span>' : ''}
              ${escapeHtml(statusText)}
            </p>
            ${this.state === 'connected' ? `<div class="global-call-time">${timeText}</div>` : ''}
          </div>
          <div class="global-call-actions">${actionButtons}</div>
        </div>
      </div>
    `;

    const minimizeBtn = this.overlay.querySelector('#call-btn-minimize');
    const acceptBtn = this.overlay.querySelector('#call-btn-accept');
    const declineBtn = this.overlay.querySelector('#call-btn-decline');
    const hangupBtn = this.overlay.querySelector('#call-btn-hangup');

    if (minimizeBtn) minimizeBtn.onclick = () => this.showPlayer();
    if (acceptBtn) acceptBtn.onclick = () => this.acceptCall();
    if (declineBtn) declineBtn.onclick = () => this.declineCall();
    if (hangupBtn) hangupBtn.onclick = () => this.endCall();

    setTimeout(() => this.startParticles(), 100);
    this.updateTimer();
  },

  render() {
    if (!this.overlay) return;
    if (this.state === 'idle') {
      this.stopParticles();
      this.overlay.className = '';
      this.overlay.innerHTML = '';
      return;
    }
    if (this.viewMode === 'ball') { this.renderBall(); return; }
    if (this.viewMode === 'player') { this.renderPlayer(); return; }
    this.renderFull();
  },
};
