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

  if (!AudioContextClass) {
    console.warn('Web Audio API is not supported in this browser.');
    return null;
  }

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

// 来电铃声
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
    } catch (err) {
      console.warn('playIncomingRing error:', err);
    }
  }, 1000);

  soundGain.gain.setValueAtTime(0, ctx.currentTime);
  soundGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
}

// 拨号音
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
          try {
            soundOsc.disconnect();
          } catch (e) {}
          soundOsc = null;
        };

        isBeeping = true;
      } else {
        isBeeping = false;
      }
    } catch (err) {
      console.warn('playDialingTone error:', err);
    }
  }, 1000);
}

function stopSound() {
  if (soundInterval) {
    clearInterval(soundInterval);
    soundInterval = null;
  }

  if (soundOsc) {
    try {
      soundOsc.stop();
    } catch (e) {}

    try {
      soundOsc.disconnect();
    } catch (e) {}

    soundOsc = null;
  }

  if (soundGain) {
    try {
      if (audioCtx) {
        soundGain.gain.cancelScheduledValues(audioCtx.currentTime);
      }
    } catch (e) {}

    try {
      soundGain.disconnect();
    } catch (e) {}

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

export const CallManager = {
  state: 'idle', // 'idle' | 'dialing' | 'incoming' | 'connected'
  conversationId: null,
  characterId: null,
  characterName: '',
  characterAvatar: '',
  isUserInitiator: false,
  startTime: null,
  timerInterval: null,
  autoAnswerTimeout: null,
  overlay: null,
  minimized: false,
  particleInterval: null,

  // 最小化挂件位置
  floatingPos: {
    x: null,
    y: null,
  },

  // 拖动状态
  dragState: {
    active: false,
    moved: false,
    suppressClick: false,
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

  minimize() {
    if (this.state === 'idle') return;

    this.minimized = true;
    this.render();
  },

  expand() {
    if (this.state === 'idle') return;

    this.minimized = false;
    this.render();
  },

  toggleMinimize() {
    if (this.minimized) {
      this.expand();
    } else {
      this.minimize();
    }
  },

  simulateCharacterAnswer() {
    const delay = Math.floor(Math.random() * 5000) + 3000;

    this.autoAnswerTimeout = setTimeout(async () => {
      if (this.state !== 'dialing') return;

      const rand = Math.random();

      if (rand < 0.8) {
        this.acceptCall();
      } else if (rand < 0.95) {
        await this.endCall('busy');
      } else {
        await this.endCall('missed');
      }
    }, delay);
  },

  acceptCall() {
    if (this.state !== 'dialing' && this.state !== 'incoming') return;

    stopSound();

    this.state = 'connected';
    this.startTime = Date.now();

    this.render();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
  },

  async declineCall() {
    if (this.state !== 'incoming') return;

    await this.endCall('declined');
  },

  async endCall(statusReason = 'finished') {
    stopSound();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.autoAnswerTimeout) {
      clearTimeout(this.autoAnswerTimeout);
      this.autoAnswerTimeout = null;
    }

    let duration = 0;

    if (this.startTime && this.state === 'connected') {
      duration = Math.floor((Date.now() - this.startTime) / 1000);
    }

    const finalStatus = this.state === 'connected' ? 'finished' : statusReason;

    if (this.conversationId) {
      try {
        await db.messages.add({
          conversationId: this.conversationId,
          timestamp: Date.now(),
          sender: this.isUserInitiator ? 'user' : 'character',
          type: 'call',
          content: JSON.stringify({
            status: finalStatus,
            duration,
          }),
        });

        window.dispatchEvent(
          new CustomEvent('call-history-updated', {
            detail: {
              conversationId: this.conversationId,
            },
          })
        );
      } catch (err) {
        console.error('Failed to log call history', err);
      }
    }

    this.state = 'idle';
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
    if (this.state === 'incoming') return '来电邀请';
    if (this.state === 'connected') return '正在通话';
    if (this.state === 'dialing') return '正在呼叫';
    return '';
  },

  getElapsedSeconds() {
    if (!this.startTime || this.state !== 'connected') return 0;

    return Math.floor((Date.now() - this.startTime) / 1000);
  },

  updateTimer() {
    if (!this.overlay) return;

    const timeText = formatDuration(this.getElapsedSeconds());

    const timerEl = this.overlay.querySelector('.global-call-time');
    if (timerEl) {
      timerEl.textContent = timeText;
    }

    const miniTimeEl = this.overlay.querySelector('.global-call-mini-time');
    if (miniTimeEl) {
      miniTimeEl.textContent = timeText;
    }

    const progressFill = this.overlay.querySelector('.music-progress-fill');
    if (progressFill && this.state === 'connected') {
      const elapsed = this.getElapsedSeconds();

      // 只是视觉进度，不代表真实总时长。
      // 180 秒循环一次，避免进度条静止。
      const percent = Math.min(100, ((elapsed % 180) / 180) * 100);
      progressFill.style.width = `${percent}%`;
    }
  },

  startParticles() {
    if (this.particleInterval) return;
    if (!this.overlay) return;

    const container = this.overlay.querySelector('#particle-container');
    if (!container) return;

    const phrases = ['思念是链接的钥匙', '跨越时间的爱恋', '倾听微风中的呢喃', '命运的频率在此共鸣'];
    const allChars = phrases.join('').split('');

    const createParticle = () => {
      if (this.minimized || this.state === 'idle') return;

      const char = allChars[Math.floor(Math.random() * allChars.length)];
      const el = document.createElement('div');

      el.className = 'float-char';
      el.innerText = char;

      const startX = 5 + Math.random() * 90;
      const fontSize = 14 + Math.random() * 14;
      const duration = 6 + Math.random() * 6;
      const moveY = -(40 + Math.random() * 40) + 'vh';
      const rot = Math.random() * 40 - 20 + 'deg';

      el.style.left = `${startX}%`;
      el.style.fontSize = `${fontSize}px`;
      el.style.animationDuration = `${duration}s`;
      el.style.setProperty('--move-y', moveY);
      el.style.setProperty('--rot', rot);

      container.appendChild(el);

      setTimeout(() => {
        if (el.parentNode) el.remove();
      }, duration * 1000);
    };

    for (let i = 0; i < 5; i++) {
      setTimeout(createParticle, i * 200);
    }

    this.particleInterval = setInterval(createParticle, 450);
  },

  stopParticles() {
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }

    const container = this.overlay ? this.overlay.querySelector('#particle-container') : null;
    if (container) {
      container.innerHTML = '';
    }
  },

  makeElementDraggable(el) {
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let pointerId = null;

    // 强制保证挂件可接收事件
    el.style.pointerEvents = 'auto';
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.webkitUserSelect = 'none';

    const applySavedPosition = () => {
      if (this.floatingPos.x !== null && this.floatingPos.y !== null) {
        el.style.left = `${this.floatingPos.x}px`;
        el.style.top = `${this.floatingPos.y}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        el.style.margin = '0';
      }
    };

    const moveTo = (x, y) => {
      const rect = el.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - rect.width);
      const maxY = Math.max(0, window.innerHeight - rect.height);

      const nextX = Math.max(0, Math.min(x, maxX));
      const nextY = Math.max(0, Math.min(y, maxY));

      el.style.left = `${nextX}px`;
      el.style.top = `${nextY}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      el.style.margin = '0';

      this.floatingPos.x = nextX;
      this.floatingPos.y = nextY;
    };

    applySavedPosition();

    const onPointerDown = (e) => {
      // 只处理鼠标左键
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      pointerId = e.pointerId;

      this.dragState.active = true;
      this.dragState.moved = false;
      this.dragState.suppressClick = false;

      const rect = el.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      try {
        el.setPointerCapture(pointerId);
      } catch (err) {}

      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!this.dragState.active) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        this.dragState.moved = true;
        this.dragState.suppressClick = true;
      }

      if (this.dragState.moved) {
        moveTo(initialX + dx, initialY + dy);
        e.preventDefault();
      }
    };

    const onPointerUp = (e) => {
      if (!this.dragState.active) return;
      if (pointerId !== null && e.pointerId !== pointerId) return;

      this.dragState.active = false;

      try {
        el.releasePointerCapture(pointerId);
      } catch (err) {}

      pointerId = null;

      // 关键：拖动结束后短时间屏蔽 click，防止误触发展开。
      if (this.dragState.suppressClick) {
        setTimeout(() => {
          this.dragState.suppressClick = false;
          this.dragState.moved = false;
        }, 180);
      } else {
        this.dragState.moved = false;
      }
    };

    const onClick = (e) => {
      if (this.dragState.suppressClick || this.dragState.moved) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      this.expand();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('lostpointercapture', onPointerUp);
    el.addEventListener('click', onClick);
  },

  renderMinimized() {
    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';

    this.overlay.className = 'global-call-active global-call-minimized';

    const safeName = escapeHtml(this.characterName || 'Unknown');

    this.overlay.innerHTML = `
      <div class="global-call-floating music-style compact-mode" id="call-btn-expand" role="button" aria-label="展开通话">
        <div class="music-compact-main">
          <div class="music-cover">
            ${avatarHTML(this.characterAvatar, this.characterName, 42)}
          </div>

          <div class="music-info">
            <div class="music-title">${safeName}</div>
            <div class="music-subtitle">${this.state === 'connected' ? '正在通话...' : escapeHtml(statusText)}</div>
          </div>

          <div class="music-side">
            <div class="music-eq ${isPlaying ? 'playing' : ''}" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>

            <div class="global-call-mini-time">${this.state === 'connected' ? timeText : '00:00'}</div>
          </div>
        </div>

        <div class="music-progress-line" aria-hidden="true">
          <div class="music-progress-fill ${this.state === 'connected' ? 'active' : ''}" style="width: ${
            this.state === 'connected' ? '3%' : '0%'
          };"></div>
        </div>
      </div>
    `;

    const expandBtn = this.overlay.querySelector('#call-btn-expand');

    if (expandBtn) {
      this.makeElementDraggable(expandBtn);
    }

    this.updateTimer();
  },

  renderFull() {
    this.overlay.className = 'global-call-active global-call-expanded';

    const statusText = this.getStatusText();
    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 130);
    const timeText = formatDuration(this.getElapsedSeconds());

    let actionButtons = '';

    if (this.state === 'incoming') {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-decline" id="call-btn-decline" type="button" aria-label="拒接">
              <span class="call-icon-heartbeat">${ICON.phoneHangup}</span>
            </button>
            <span class="call-action-label">拒接</span>
          </div>

          <div class="call-action-col">
            <button class="call-btn btn-accept" id="call-btn-accept" type="button" aria-label="接听">
              <span class="call-icon-heartbeat">${ICON.phone}</span>
            </button>
            <span class="call-action-label">接听</span>
          </div>
        </div>
      `;
    } else if (this.state === 'dialing') {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-hangup" id="call-btn-hangup" type="button" aria-label="挂断">
              <span class="call-icon-heartbeat">${ICON.phoneHangup}</span>
            </button>
            <span class="call-action-label">挂断</span>
          </div>
        </div>
      `;
    } else {
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-utility" type="button" aria-label="静音">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>
              </svg>
            </button>
            <span class="call-action-label">静音</span>
          </div>

          <div class="call-action-col">
            <button class="call-btn btn-hangup" id="call-btn-hangup" type="button" aria-label="挂断">
              <span class="call-icon-heartbeat">${ICON.phoneHangup}</span>
            </button>
            <span class="call-action-label">挂断</span>
          </div>

          <div class="call-action-col">
            <button class="call-btn btn-utility" type="button" aria-label="免提">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <span class="call-action-label">免提</span>
          </div>
        </div>
      `;
    }

    const bgImage = this.characterAvatar ? `background-image: url('${String(this.characterAvatar).replaceAll("'", "\\'")}')` : '';

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="${bgImage}"></div>
        <div class="global-call-mask"></div>

        <div id="particle-container"></div>

        <button class="global-call-minimize-btn" id="call-btn-minimize" type="button" aria-label="缩小通话">
          ${SVG_MINIMIZE}
        </button>

        <div class="global-call-visual-layer">
          ${
            this.state === 'dialing'
              ? `
                <div class="global-call-wave-wrap">
                  <div class="global-call-wave wave-1"></div>
                  <div class="global-call-wave wave-2"></div>
                  <div class="global-call-wave wave-3"></div>
                </div>
              `
              : ''
          }
        </div>

        <div class="global-call-content">
          <div class="global-call-info-group">
            <div class="global-call-avatar-wrapper ${this.state === 'connected' ? 'pulse' : 'breath'}">
              ${avatarHtmlStr}
            </div>

            <h2 class="global-call-name">${escapeHtml(this.characterName || '')}</h2>

            <p class="global-call-status">
              ${this.state === 'connected' ? '<span class="status-dot"></span>' : ''}
              ${escapeHtml(statusText)}
            </p>

            ${this.state === 'connected' ? `<div class="global-call-time">${timeText}</div>` : ''}
          </div>

          <div class="global-call-actions">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;

    const minimizeBtn = this.overlay.querySelector('#call-btn-minimize');
    const acceptBtn = this.overlay.querySelector('#call-btn-accept');
    const declineBtn = this.overlay.querySelector('#call-btn-decline');
    const hangupBtn = this.overlay.querySelector('#call-btn-hangup');

    if (minimizeBtn) {
      minimizeBtn.onclick = () => this.minimize();
    }

    if (acceptBtn) {
      acceptBtn.onclick = () => this.acceptCall();
    }

    if (declineBtn) {
      declineBtn.onclick = () => this.declineCall();
    }

    if (hangupBtn) {
      hangupBtn.onclick = () => this.endCall();
    }

    this.startParticles();
  },

  render() {
    if (!this.overlay) return;

    if (this.state === 'idle') {
      this.stopParticles();
      this.overlay.className = '';
      this.overlay.innerHTML = '';
      return;
    }

    if (this.minimized) {
      this.stopParticles();
      this.renderMinimized();
    } else {
      this.renderFull();
    }
  },
};
