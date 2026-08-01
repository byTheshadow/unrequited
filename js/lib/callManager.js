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
          try { soundOsc.disconnect(); } catch (e) {}
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
    try { soundOsc.stop(); } catch (e) {}
    try { soundOsc.disconnect(); } catch (e) {}
    soundOsc = null;
  }

  if (soundGain) {
    try {
      if (audioCtx) {
        soundGain.gain.cancelScheduledValues(audioCtx.currentTime);
      }
    } catch (e) {}

    try { soundGain.disconnect(); } catch (e) {}
    soundGain = null;
  }
}

function formatDuration(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
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

  renderMinimized() {
    const statusText = this.getStatusText();
    const timeText = formatDuration(this.getElapsedSeconds());
    
    // 是否正在“发声”阶段（拨号音或通话中）以启动EQ动效
    const isPlaying = this.state === 'connected' || this.state === 'dialing' || this.state === 'incoming';

    this.overlay.className = 'global-call-active global-call-minimized';

    this.overlay.innerHTML = `
      <div class="global-call-floating music-style" id="call-btn-expand" role="button" aria-label="展开通话">
        <div class="music-header">
          <div class="music-cover">
            ${avatarHTML(this.characterAvatar, this.characterName, 56)}
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
          </div>
        </div>
        
        <div class="music-progress">
          <span class="progress-time global-call-mini-time">${this.state === 'connected' ? timeText : '00:00'}</span>
          <div class="progress-track">
            <div class="progress-fill ${this.state === 'connected' ? 'active' : ''}"></div>
          </div>
          <span class="progress-time status-text">${this.state === 'connected' ? 'Live' : '...'}</span>
        </div>
      </div>
    `;

    const expandBtn = this.overlay.querySelector('#call-btn-expand');
    if (expandBtn) {
      expandBtn.onclick = () => this.expand();
    }
  },

  renderFull() {
    this.overlay.className = 'global-call-active';

    const statusText = this.getStatusText();
    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 100);
    const timeText = formatDuration(this.getElapsedSeconds());

    let actionButtons = '';

    if (this.state === 'incoming') {
      actionButtons = `
        <button class="call-btn btn-decline" id="call-btn-decline" type="button" aria-label="拒接">
          <span class="call-icon-heartbeat">${ICON.phoneHangup}</span>
        </button>
        <button class="call-btn btn-accept" id="call-btn-accept" type="button" aria-label="接听">
          <span class="call-icon-heartbeat">${ICON.phone}</span>
        </button>
      `;
    } else {
      actionButtons = `
        <button class="call-btn btn-hangup" id="call-btn-hangup" type="button" aria-label="挂断">
          <span class="call-icon-heartbeat">${ICON.phoneHangup}</span>
        </button>
      `;
    }

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="background-image: url('${this.characterAvatar || ''}')"></div>
        <div class="global-call-mask"></div>

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

            <div class="global-call-ecg">
              <svg viewBox="0 0 240 60" class="global-call-ecg-svg" aria-hidden="true">
                <path d="M0 30 H35 L45 18 L58 44 L72 30 H96 L108 12 L120 48 L134 30 H162 L174 22 L186 38 L198 30 H240" />
              </svg>
            </div>
          ` : ''}
        </div>

        <div class="global-call-content">
          <div class="global-call-avatar-wrapper ${this.state === 'connected' ? 'pulse' : 'breath'}">
            ${avatarHtmlStr}
          </div>

          <h2 class="global-call-name">${this.characterName || ''}</h2>
          <p class="global-call-status">${statusText}</p>

          ${this.state === 'connected' ? `<div class="global-call-time">${timeText}</div>` : ''}

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
  },

  render() {
    if (!this.overlay) return;

    if (this.state === 'idle') {
      this.overlay.className = '';
      this.overlay.innerHTML = '';
      return;
    }

    if (this.minimized) {
      this.renderMinimized();
    } else {
      this.renderFull();
    }
  },
};
