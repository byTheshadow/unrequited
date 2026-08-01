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
  viewMode: 'full', // 'full' | 'player' | 'ball'

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

  // 兼容你原先可能用到的 minimized 字段
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

  minimize() {
    if (this.state === 'idle') return;

    this.viewMode = 'player';
    this.minimized = true;
    this.render();
  },

  expand() {
    if (this.state === 'idle') return;

    this.viewMode = 'full';
    this.minimized = false;
    this.render();
  },

  showPlayer() {
    if (this.state === 'idle') return;

    this.viewMode = 'player';
    this.minimized = true;
    this.render();
  },

  showBall() {
    if (this.state === 'idle') return;

    this.viewMode = 'ball';
    this.minimized = true;
    this.render();
  },

  toggleMinimize() {
    if (this.viewMode === 'full') {
      this.showPlayer();
    } else {
      this.expand();
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

    const fullTimerEl = this.overlay.querySelector('.global-call-time');
    if (fullTimerEl) {
      fullTimerEl.textContent = timeText;
    }

    const playerTimeEl = this.overlay.querySelector('.call-player-time');
    if (playerTimeEl) {
      playerTimeEl.textContent = this.state === 'connected' ? timeText : '00:00';
    }

    const progressFill = this.overlay.querySelector('.call-player-fill');
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
      '频率正在靠近',
      '别让声音熄灭',
    ];

    const createParticle = () => {
      if (this.viewMode !== 'full' || this.state === 'idle') return;

      const currentContainer = this.overlay.querySelector('#particle-container');
      if (!currentContainer) return;

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

      currentContainer.appendChild(el);

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

  makeElementDraggable(targetEl, handleEl, mode) {
    if (!targetEl) return;

    const dragHandle = handleEl || targetEl;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    const posStore = this.floatingPos[mode] || this.floatingPos.player;

    targetEl.style.pointerEvents = 'auto';
    targetEl.style.touchAction = 'none';
    targetEl.style.userSelect = 'none';
    targetEl.style.webkitUserSelect = 'none';

    dragHandle.style.touchAction = 'none';
    dragHandle.style.userSelect = 'none';
    dragHandle.style.webkitUserSelect = 'none';

    if (posStore.x !== null && posStore.y !== null) {
      targetEl.style.left = `${posStore.x}px`;
      targetEl.style.top = `${posStore.y}px`;
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';
    }

    const moveTo = (x, y) => {
      const rect = targetEl.getBoundingClientRect();

      const maxX = Math.max(0, window.innerWidth - rect.width);
      const maxY = Math.max(0, window.innerHeight - rect.height);

      const nextX = Math.max(0, Math.min(x, maxX));
      const nextY = Math.max(0, Math.min(y, maxY));

      targetEl.style.left = `${nextX}px`;
      targetEl.style.top = `${nextY}px`;
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';

      posStore.x = nextX;
      posStore.y = nextY;
    };

    const getPoint = (e) => {
      if (e.touches && e.touches[0]) {
        return {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }

      if (e.changedTouches && e.changedTouches[0]) {
        return {
          x: e.changedTouches[0].clientX,
          y: e.changedTouches[0].clientY,
        };
      }

      return {
        x: e.clientX,
        y: e.clientY,
      };
    };

    const onStart = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return;

      this.dragState.active = true;
      this.dragState.moved = false;
      this.dragState.suppressClick = false;
      this.dragState.mode = mode;

      const point = getPoint(e);
      const rect = targetEl.getBoundingClientRect();

      startX = point.x;
      startY = point.y;
      initialX = rect.left;
      initialY = rect.top;

      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd, { passive: false });
      document.addEventListener('touchcancel', onEnd, { passive: false });

      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const onMove = (e) => {
      if (!this.dragState.active || this.dragState.mode !== mode) return;

      const point = getPoint(e);
      const dx = point.x - startX;
      const dy = point.y - startY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        this.dragState.moved = true;
        this.dragState.suppressClick = true;
      }

      if (!this.dragState.moved) return;

      moveTo(initialX + dx, initialY + dy);

      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const onEnd = () => {
      if (!this.dragState.active || this.dragState.mode !== mode) return;

      this.dragState.active = false;
      this.dragState.mode = null;

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);

      if (this.dragState.suppressClick) {
        setTimeout(() => {
          this.dragState.suppressClick = false;
          this.dragState.moved = false;
        }, 160);
      } else {
        this.dragState.moved = false;
      }
    };

    dragHandle.addEventListener('mousedown', onStart);
    dragHandle.addEventListener('touchstart', onStart, { passive: false });
  },

  wasJustDragged() {
    return this.dragState.suppressClick || this.dragState.moved;
  },

  renderPlayer() {
    this.stopParticles();

    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';
    const progress = this.state === 'connected'
      ? Math.max(3, Math.min(100, ((this.getElapsedSeconds() % 180) / 180) * 100))
      : 0;

    this.overlay.className = 'global-call-active global-call-player';

    this.overlay.innerHTML = `
      <div class="global-call-floating call-player-widget" id="global-call-player" role="button" aria-label="展开通话">
        <button class="call-player-mini-btn" id="call-btn-to-ball" type="button" aria-label="最小化为悬浮球">
          <span></span>
        </button>

        <div class="call-player-inner">
          <div class="call-player-drag-handle" id="call-player-drag-handle">
            <div class="call-player-cover">
              ${avatarHTML(this.characterAvatar, this.characterName, 62)}
            </div>

            <div class="call-player-meta">
              <div class="call-player-name">${escapeHtml(this.characterName || 'Unknown')}</div>
              <div class="call-player-subtitle">${escapeHtml(this.state === 'connected' ? '正在通话...' : statusText)}</div>
            </div>

            <div class="call-player-eq ${isPlaying ? 'playing' : ''}" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div class="call-player-progress">
            <span class="call-player-time">${this.state === 'connected' ? timeText : '00:00'}</span>

            <div class="call-player-track">
              <div class="call-player-fill" style="width: ${progress}%;"></div>
            </div>

            <span class="call-player-live">${this.state === 'connected' ? 'LIVE' : '...'}</span>
          </div>

          <div class="call-player-controls" aria-hidden="true">
            <div class="call-player-control">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18.5 3.5 12 11 5.5v13Zm9 0L12.5 12 20 5.5v13Z"/>
              </svg>
            </div>

            <div class="call-player-control pause">
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

            <div class="call-player-control">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 5.5 20.5 12 13 18.5v-13Zm-9 0L11.5 12 4 18.5v-13Z"/>
              </svg>
            </div>
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
        if (this.wasJustDragged()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        this.expand();
      });
    }

    if (toBallBtn) {
      toBallBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.wasJustDragged()) return;

        this.showBall();
      });
    }

    this.updateTimer();
  },

  renderBall() {
    this.stopParticles();

    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';

    this.overlay.className = 'global-call-active global-call-ball';

    this.overlay.innerHTML = `
      <div class="global-call-floating call-ball-widget" id="global-call-ball" role="button" aria-label="展开音乐通话窗口">
        <div class="call-ball-ring"></div>

        <div class="call-ball-avatar">
          ${avatarHTML(this.characterAvatar, this.characterName, 58)}
        </div>

        <div class="call-ball-status-dot"></div>

        <div class="call-ball-eq ${isPlaying ? 'playing' : ''}" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;

    const ball = this.overlay.querySelector('#global-call-ball');

    if (ball) {
      this.makeElementDraggable(ball, ball, 'ball');

      ball.addEventListener('click', (e) => {
        if (this.wasJustDragged()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        this.showPlayer();
      });
    }
  },

  renderFull() {
    this.overlay.className = 'global-call-active global-call-full';

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
            <div class="global-call-avatar-wrapper">
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
      minimizeBtn.onclick = () => this.showPlayer();
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

    if (this.viewMode === 'ball') {
      this.renderBall();
      return;
    }

    if (this.viewMode === 'player') {
      this.renderPlayer();
      return;
    }

    this.renderFull();
  },
};
