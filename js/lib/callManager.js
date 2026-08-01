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

const SVG_EXPAND = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="15 3 21 3 21 9"/>
    <polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/>
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

// 拨号音 (嘟——嘟——)
function playDialingTone() {
  stopSound();

  const ctx = getAudioContext();
  if (!ctx) return;

  soundGain = ctx.createGain();
  soundGain.gain.setValueAtTime(0, ctx.currentTime);
  soundGain.connect(ctx.destination);

  soundInterval = setInterval(() => {
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const localGain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(425, now);
      osc2.frequency.setValueAtTime(425, now);

      localGain.gain.setValueAtTime(0, now);
      localGain.gain.linearRampToValueAtTime(0.1, now + 0.05);
      localGain.gain.setValueAtTime(0.1, now + 1.0);
      localGain.gain.linearRampToValueAtTime(0, now + 1.05);

      osc1.connect(localGain);
      osc2.connect(localGain);
      localGain.connect(soundGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.05);
      osc2.stop(now + 1.05);
    } catch (err) {
      console.warn('playDialingTone error:', err);
    }
  }, 2000);

  soundGain.gain.setValueAtTime(0, ctx.currentTime);
  soundGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
}

function stopSound() {
  if (soundInterval) {
    clearInterval(soundInterval);
    soundInterval = null;
  }
  if (soundGain) {
    try {
      soundGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
      setTimeout(() => {
        if (soundGain) {
          soundGain.disconnect();
          soundGain = null;
        }
      }, 150);
    } catch (e) {
      soundGain.disconnect();
      soundGain = null;
    }
  }
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const callManager = {
  overlay: null,
  state: 'idle', // 'idle' | 'dialing' | 'incoming' | 'connected'
  minimized: false,

  conversationId: null,
  characterId: null,
  characterName: '',
  characterAvatar: '',
  isUserInitiator: false,

  startTime: null,
  timerInterval: null,
  autoAnswerTimeout: null,
  particleInterval: null,
  
  // 存储拖拽后的位置
  floatingPos: { x: null, y: null },
  wasDragged: false,

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
    if (this.state === 'connected') return '通话中';
    if (this.state === 'dialing') return '正在呼叫...';
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
  },

  // 粒子动画生成器
  startParticles() {
    if (this.particleInterval) return;
    const container = this.overlay.querySelector('#particle-container');
    if (!container) return;

    const phrases = ["思念是链接的钥匙", "跨越时间的爱恋", "倾听微风中的呢喃", "命运的频率在此共鸣"];
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
      const moveY = - (40 + Math.random() * 40) + 'vh';
      const rot = (Math.random() * 40 - 20) + 'deg';

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

  // 拖动监听实现
  makeElementDraggable(el) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    // 如果存有之前的拖动坐标，直接应用
    if (this.floatingPos.x !== null && this.floatingPos.y !== null) {
      el.style.left = this.floatingPos.x + 'px';
      el.style.top = this.floatingPos.y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    }

    const dragStart = (e) => {
      this.wasDragged = false;
      isDragging = false;

      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      const rect = el.getBoundingClientRect();

      startX = clientX;
      startY = clientY;
      initialX = rect.left;
      initialY = rect.top;

      document.addEventListener('mousemove', dragMove, { passive: false });
      document.addEventListener('mouseup', dragEnd);
      document.addEventListener('touchmove', dragMove, { passive: false });
      document.addEventListener('touchend', dragEnd);
    };

    const dragMove = (e) => {
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      const dx = clientX - startX;
      const dy = clientY - startY;

      // 判定移动位移，防止防抖误触
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isDragging = true;
        this.wasDragged = true;
        if (e.cancelable) e.preventDefault();
      }

      if (isDragging) {
        let newX = initialX + dx;
        let newY = initialY + dy;

        const rect = el.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
        newY = Math.max(0, Math.min(newY, window.innerHeight - rect.height));

        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';

        this.floatingPos.x = newX;
        this.floatingPos.y = newY;
      }
    };

    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      document.removeEventListener('touchmove', dragMove);
      document.removeEventListener('touchend', dragEnd);
      
      // 添加极短延迟确保 click 事件能读取到 wasDragged 状态
      setTimeout(() => {
        if (!isDragging) {
          this.wasDragged = false;
        }
      }, 50);
    };

    el.addEventListener('mousedown', dragStart);
    el.addEventListener('touchstart', dragStart, { passive: false });
  },

  renderMinimized() {
    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';

    this.overlay.className = 'global-call-active global-call-minimized';

    this.overlay.innerHTML = `
      <div class="global-call-floating music-style" id="call-btn-expand" role="button" aria-label="展开通话">
        <div class="music-header">
          <div class="music-cover">
            ${avatarHTML(this.characterAvatar, this.characterName, 54)}
          </div>
          <div class="music-info">
            <div class="music-title">${this.characterName || 'Unknown'}</div>
            <div class="music-subtitle">${this.state === 'connected' ? '正在通话...' : statusText}</div>
          </div>
          <div class="music-eq ${isPlaying ? 'playing' : ''}">
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
            <span class="eq-bar"></span>
          </div>
        </div>
        
        <div class="music-controls">
          <span class="progress-time left global-call-mini-time">${this.state === 'connected' ? timeText : '00:00'}</span>
          <div class="progress-track">
            <div class="progress-fill ${this.state === 'connected' ? 'active' : ''}"></div>
          </div>
          <span class="progress-time right duration-total">${this.state === 'connected' ? '-Live' : '--:--'}</span>
        </div>

        <div class="music-actions">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
          <div class="play-btn">
            ${isPlaying ? 
              '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' : 
              '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
            }
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
        </div>
      </div>
    `;

    const expandBtn = this.overlay.querySelector('#call-btn-expand');
    if (expandBtn) {
      // 开启挂件拖动逻辑
      this.makeElementDraggable(expandBtn);

      expandBtn.onclick = (e) => {
        if (this.wasDragged) {
          this.wasDragged = false;
          return; // 若是拖拽手势，打断点击展开逻辑
        }
        this.expand();
      };
    }
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
      // 用户拨打给角色时，仅保留单挂断按钮
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
      // 正常通话中
      actionButtons = `
        <div class="call-action-grid">
          <div class="call-action-col">
            <button class="call-btn btn-utility" type="button" aria-label="静音">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <span class="call-action-label">免提</span>
          </div>
        </div>
      `;
    }

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="background-image: url('${this.characterAvatar || ''}')"></div>
        <div class="global-call-mask"></div>

        <!-- 逐字漂浮特效容器 -->
        <div id="particle-container"></div>

        <button class="global-call-minimize-btn" id="call-btn-minimize" type="button" aria-label="缩小通话">
          ${SVG_MINIMIZE}
        </button>

        <div class="global-call-visual-layer">
          ${this.state === 'dialing' ? `
            <div class="global-call-wave-wrap">
              <div class="global-call-wave wave-1"></div>
              <div class="global-call-wave wave-2"></div>
              <div class="global-call-wave wave-3"></div>
            </div>
          ` : ''}
        </div>

        <div class="global-call-content">
          <div class="global-call-info-group">
            <div class="global-call-avatar-wrapper ${this.state === 'connected' ? 'pulse' : 'breath'}">
              ${avatarHtmlStr}
            </div>

            <h2 class="global-call-name">${this.characterName || ''}</h2>
            <p class="global-call-status">
              ${this.state === 'connected' ? '<span class="status-dot"></span>' : ''}
              ${statusText}
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

    if (minimizeBtn) minimizeBtn.onclick = () => this.minimize();
    if (acceptBtn) acceptBtn.onclick = () => this.acceptCall();
    if (declineBtn) declineBtn.onclick = () => this.declineCall();
    if (hangupBtn) hangupBtn.onclick = () => this.endCall();

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
