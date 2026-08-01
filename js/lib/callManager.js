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

// 渲染音乐波形跳动条
function renderWaveBarsHTML(elapsedSeconds, isConnected) {
  const totalBars = 18;
  const progressPercent = isConnected ? Math.min(100, (elapsedSeconds % 60) / 60 * 100) : 0;
  const activeCount = Math.round((progressPercent / 100) * totalBars);

  let html = '';
  for (let i = 0; i < totalBars; i++) {
    const isActive = i < activeCount ? ' is-active' : '';
    // 如果已连接，随机设定高度产生动态跳动频谱，如果未连接则是最低静态条
    const height = isConnected ? Math.floor(Math.random() * 20) + 6 : 6;
    html += `<span class="call-player-bar${isActive}" style="height: ${height}px;"></span>`;
  }
  return html;
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

  // 兼容原先可能用到的 minimized 字段
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
    if (this.state === 'connected') return 'LIVE CALL';
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
    if (fullTimerEl) {
      fullTimerEl.textContent = this.state === 'connected' ? timeText : '00:00';
    }

    const playerTimeEl = this.overlay.querySelector('.call-player-time');
    if (playerTimeEl) {
      playerTimeEl.textContent = this.state === 'connected' ? timeText : '00:00';
    }

    const track = this.overlay.querySelector('.call-player-track');
    if (track) {
      track.innerHTML = renderWaveBarsHTML(elapsed, this.state === 'connected');
    }
  },

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
      '频率正在靠近'
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

      const x = 5 + Math.random() * 90;
      const size = 16 + Math.random() * 26;
      const duration = 6.0 + Math.random() * 5.0;
      const rise = -(60 + Math.random() * 35);
      const drift = Math.random() * 140 - 70;
      const rotate = Math.random() * 40 - 20;
      const rotateMore = Math.random() * 90 - 45;
      const alpha = 0.25 + Math.random() * 0.55;
      const blur = Math.random() > 0.72 ? '2px' : '0px';

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

    // 初始密集粒子
    for (let i = 0; i < 25; i++) {
      setTimeout(createParticle, i * 150);
    }

    this.particleInterval = setInterval(() => {
      const count = 1 + Math.floor(Math.random() * 2);

      for (let i = 0; i < count; i++) {
        setTimeout(createParticle, i * 200);
      }
    }, 700);
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
      const margin = 16;
      const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

      const nextX = Math.max(margin, Math.min(x, maxX));
      const nextY = Math.max(margin, Math.min(y, maxY));

      targetEl.style.left = `${nextX}px`;
      targetEl.style.top = `${nextY}px`;
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transform = 'none';
      targetEl.style.margin = '0';

      posStore.x = nextX;
      posStore.y = nextY;
    };

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;

      this.dragState.active = true;
      this.dragState.moved = false;
      this.dragState.suppressClick = false;
      this.dragState.pointerId = e.pointerId;
      this.dragState.mode = mode;

      const rect = targetEl.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      // 覆盖 CSS 的初始固定定位
      targetEl.style.left = `${initialX}px`;
      targetEl.style.top = `${initialY}px`;
      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.transition = 'none';

      try {
        dragHandle.setPointerCapture(e.pointerId);
      } catch (err) {}

      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const onPointerMove = (e) => {
      if (!this.dragState.active || this.dragState.mode !== mode) return;
      if (this.dragState.pointerId !== null && e.pointerId !== this.dragState.pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

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

    const onPointerEnd = (e) => {
      if (!this.dragState.active || this.dragState.mode !== mode) return;

      try {
        dragHandle.releasePointerCapture(e.pointerId);
      } catch (err) {}

      this.dragState.active = false;
      this.dragState.pointerId = null;
      this.dragState.mode = null;

      // 拖拽释放吸附逻辑
      if (this.dragState.moved) {
        const rect = targetEl.getBoundingClientRect();
        const margin = 16;
        let targetX = rect.left;
        let targetY = rect.top;

        // 左右边缘智能吸附
        if (rect.left + rect.width / 2 < window.innerWidth / 2) {
          targetX = margin;
        } else {
          targetX = window.innerWidth - rect.width - margin;
        }

        // 越界校验保护
        targetY = Math.max(margin, Math.min(targetY, window.innerHeight - rect.height - margin));

        targetEl.style.transition = 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
        targetEl.style.left = `${targetX}px`;
        targetEl.style.top = `${targetY}px`;

        posStore.x = targetX;
        posStore.y = targetY;

        setTimeout(() => {
          targetEl.style.transition = 'none';
        }, 300);
      }

      if (this.dragState.suppressClick) {
        setTimeout(() => {
          this.dragState.suppressClick = false;
          this.dragState.moved = false;
        }, 160);
      } else {
        this.dragState.moved = false;
      }
    };

    dragHandle.addEventListener('pointerdown', onPointerDown);
    dragHandle.addEventListener('pointermove', onPointerMove);
    dragHandle.addEventListener('pointerup', onPointerEnd);
    dragHandle.addEventListener('pointercancel', onPointerEnd);
  },

  wasJustDragged() {
    return this.dragState.suppressClick || this.dragState.moved;
  },

  renderPlayer() {
    this.stopParticles();

    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';
    const isConnected = this.state === 'connected';

    this.overlay.className = 'global-call-active global-call-player';

    this.overlay.innerHTML = `
      <div class="global-call-floating call-player-widget" id="global-call-player" role="button" aria-label="展开通话">
        <button class="call-player-mini-btn" id="call-btn-to-ball" type="button" aria-label="最小化为悬浮球">
          <span></span>
        </button>

        <div class="call-player-inner">
          <div class="call-player-drag-handle" id="call-player-drag-handle">
            <div class="call-player-cover">
              ${avatarHTML(this.characterAvatar, this.characterName, 68)}
            </div>

            <div class="call-player-meta">
              <div class="call-player-kicker">
                <span class="call-player-live-dot" style="${!isConnected ? 'background:#f59e0b;box-shadow:0 0 8px #f59e0b;' : ''}"></span>
                ${escapeHtml(this.getPlayerKickerText())}
              </div>

              <div class="call-player-name">${escapeHtml(this.characterName || 'Unknown')}</div>
              <div class="call-player-subtitle">${escapeHtml(isConnected ? '正在通话 · 像一首正在播放的歌' : statusText)}</div>
            </div>
          </div>

          <div class="call-player-progress-bar">
            <span class="call-player-time">${isConnected ? timeText : '00:00'}</span>

            <div class="call-player-track" aria-hidden="true">
              ${renderWaveBarsHTML(this.getElapsedSeconds(), isConnected)}
            </div>

            <span class="call-player-live-label">${isConnected ? 'LIVE' : '...'}</span>
          </div>

          <div class="call-player-bottom" aria-hidden="true">
            <div class="call-player-eq ${isPlaying ? 'playing' : ''}">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="call-player-hint">拖动此处移动</div>
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
        // 防止拖拽完成后触发点击展开全屏
        if (player.style.transition !== '' && player.style.transition !== 'none') return;
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
        if (ball.style.transition !== '' && ball.style.transition !== 'none') return;
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
    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 140);
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
              <div class="avatar-inner">
                ${avatarHtmlStr}
              </div>
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
