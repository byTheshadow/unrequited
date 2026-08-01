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

function safeCssUrl(value) {
  return String(value || '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
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

  floatingPos: {
    x: null,
    y: null,
  },

  dragState: {
    active: false,
    moved: false,
    suppressClick: false,
    pointerId: null,
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

        window.dispatchEvent(new CustomEvent('call-history-updated', {
          detail: {
            conversationId: this.conversationId,
          },
        }));
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
    if (this.state === 'incoming') return '向你发起通话邀请';
    if (this.state === 'connected') return '正在通话...';
    if (this.state === 'dialing') return '正在呼叫...';
    return '';
  },

  getScreenStatusText() {
    if (this.state === 'incoming') return 'INCOMING VOICE';
    if (this.state === 'connected') return 'VOICE CONNECTED';
    if (this.state === 'dialing') return 'CALLING';
    return '';
  },

  getElapsedSeconds() {
    if (!this.startTime || this.state !== 'connected') return 0;

    return Math.floor((Date.now() - this.startTime) / 1000);
  },

  updateTimer() {
    if (!this.overlay) return;

    const elapsed = this.getElapsedSeconds();
    const timeText = formatDuration(elapsed);

    const timerEl = this.overlay.querySelector('.global-call-time');
    if (timerEl) {
      timerEl.textContent = timeText;
    }

    const miniTimeEl = this.overlay.querySelector('.global-call-mini-time');
    if (miniTimeEl) {
      miniTimeEl.textContent = this.state === 'connected' ? timeText : '00:00';
    }

    const progressFill = this.overlay.querySelector('.progress-fill');
    if (progressFill) {
      const percent = this.state === 'connected'
        ? Math.max(3, Math.min(100, ((elapsed % 180) / 180) * 100))
        : 0;

      progressFill.style.width = `${percent}%`;
    }
  },

  startParticles() {
    if (this.particleInterval) return;
    if (!this.overlay) return;

    const container = this.overlay.querySelector('#particle-container');
    if (!container) return;

    const phrases = [
      '你听见了吗',
      '声音从远处醒来',
      '思念在空气里浮动',
      '每一个字都在靠近你',
      '通话仍在继续',
      '心跳与电流重叠',
      '我在这里',
      '别挂断',
      '时间正在发光',
      '沉默也有回音',
    ];

    const createParticle = () => {
      if (this.minimized || this.state === 'idle') return;

      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const char = phrase[Math.floor(Math.random() * phrase.length)];

      const el = document.createElement('span');
      el.className = 'float-char';
      el.textContent = char;

      const x = 8 + Math.random() * 84;
      const size = 14 + Math.random() * 22;
      const duration = 5.2 + Math.random() * 4.8;
      const rise = -(48 + Math.random() * 46);
      const drift = Math.random() * 120 - 60;
      const rotate = Math.random() * 36 - 18;
      const rotateMore = Math.random() * 80 - 40;
      const alpha = 0.28 + Math.random() * 0.48;
      const blur = Math.random() > 0.72 ? '1.5px' : '0px';

      el.style.setProperty('--x', `${x}%`);
      el.style.setProperty('--size', `${size}px`);
      el.style.setProperty('--duration', `${duration}s`);
      el.style.setProperty('--rise', `${rise}vh`);
      el.style.setProperty('--drift', `${drift}px`);
      el.style.setProperty('--r', `${rotate}deg`);
      el.style.setProperty('--rr', `${rotateMore}deg`);
      el.style.setProperty('--alpha', alpha);
      el.style.setProperty('--blur', blur);

      container.appendChild(el);

      setTimeout(() => {
        if (el.parentNode) {
          el.remove();
        }
      }, duration * 1000);
    };

    for (let i = 0; i < 38; i++) {
      setTimeout(createParticle, i * 70);
    }

    this.particleInterval = setInterval(() => {
      const count = 2 + Math.floor(Math.random() * 3);

      for (let i = 0; i < count; i++) {
        setTimeout(createParticle, i * 120);
      }
    }, 520);
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
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      this.dragState.active = true;
      this.dragState.moved = false;
      this.dragState.suppressClick = false;
      this.dragState.pointerId = e.pointerId;

      const rect = el.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}

      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!this.dragState.active) return;
      if (this.dragState.pointerId !== e.pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        this.dragState.moved = true;
        this.dragState.suppressClick = true;
      }

      if (!this.dragState.moved) return;

      moveTo(initialX + dx, initialY + dy);

      e.preventDefault();
    };

    const onPointerEnd = (e) => {
      if (!this.dragState.active) return;
      if (this.dragState.pointerId !== e.pointerId) return;

      this.dragState.active = false;

      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {}

      this.dragState.pointerId = null;

      if (this.dragState.suppressClick) {
        setTimeout(() => {
          this.dragState.suppressClick = false;
          this.dragState.moved = false;
        }, 140);
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
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('lostpointercapture', onPointerEnd);
    el.addEventListener('click', onClick);
  },

  renderMinimized() {
    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';
    const progress = this.state === 'connected'
      ? Math.max(3, Math.min(100, ((this.getElapsedSeconds() % 180) / 180) * 100))
      : 0;

    this.overlay.className = 'global-call-active global-call-minimized';

    this.overlay.innerHTML = `
      <div class="global-call-floating music-style" id="call-btn-expand" role="button" aria-label="展开通话">
        <div class="music-player-inner">
          <div class="music-header">
            <div class="music-cover">
              ${avatarHTML(this.characterAvatar, this.characterName, 62)}
            </div>

            <div class="music-info">
              <div class="music-title">${escapeHtml(this.characterName || 'Unknown')}</div>
              <div class="music-subtitle">${escapeHtml(this.state === 'connected' ? '正在通话...' : statusText)}</div>
            </div>

            <div class="music-eq ${isPlaying ? 'playing' : ''}" aria-hidden="true">
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
              <span class="eq-bar"></span>
            </div>
          </div>

          <div class="music-progress">
            <span class="progress-time global-call-mini-time">${this.state === 'connected' ? timeText : '00:00'}</span>

            <div class="progress-track">
              <div class="progress-fill" style="width: ${progress}%;"></div>
            </div>

            <span class="duration-total">${this.state === 'connected' ? 'LIVE' : '...'}</span>
          </div>

          <div class="music-actions" aria-hidden="true">
            <div class="music-action">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18.5 3.5 12 11 5.5v13Zm9 0L12.5 12 20 5.5v13Z"/>
              </svg>
            </div>

            <div class="music-action pause">
              ${
                isPlaying
                  ? `
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6.2" y="4.2" width="4.7" height="15.6" rx="1.5"/>
                      <rect x="13.1" y="4.2" width="4.7" height="15.6" rx="1.5"/>
                    </svg>
                  `
                  : `
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 4.8v14.4L18.5 12 7 4.8z"/>
                    </svg>
                  `
              }
            </div>

            <div class="music-action">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 5.5 20.5 12 13 18.5v-13Zm-9 0L11.5 12 4 18.5v-13Z"/>
              </svg>
            </div>
          </div>
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

    const statusText = this.getScreenStatusText();
    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 132);
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

    const bgStyle = this.characterAvatar
      ? `background-image: url('${safeCssUrl(this.characterAvatar)}')`
      : '';

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="${bgStyle}"></div>
        <div class="global-call-mask"></div>

        <div id="particle-container"></div>

        <button class="global-call-minimize-btn" id="call-btn-minimize" type="button" aria-label="缩小通话">
          ${SVG_MINIMIZE}
        </button>

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
