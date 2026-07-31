import { db } from '../db.js';
import { ICON, avatarHTML } from '../utils.js';

let audioCtx = null;
let soundInterval = null;
let soundOsc = null;
let soundGain = null;

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

// 模拟 Web Audio 来电铃声（微电子风双音高环形合成声）
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

      // 交替频率制造空灵感
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

// 模拟 Web Audio 等待音（450Hz 嘟... 嘟...）
function playDialingTone() {
  stopSound();

  const ctx = getAudioContext();
  if (!ctx) return;

  soundGain = ctx.createGain();

  // 修复点：
  // soundGain 是 GainNode，可以 connect；
  // soundGain.gain 是 AudioParam，不能 connect。
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
      soundGain.gain.cancelScheduledValues(audioCtx ? audioCtx.currentTime : 0);
    } catch (e) {}

    try {
      soundGain.disconnect();
    } catch (e) {}

    soundGain = null;
  }
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

  init() {
    this.overlay = document.getElementById('global-call-overlay');

    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'global-call-overlay';
      document.body.appendChild(this.overlay);
    }

    this.render();
  },

  // 发起或收到通话
  startCall(conversationId, characterId, characterName, characterAvatar, isUserInitiator = true) {
    if (this.state !== 'idle') return;

    this.conversationId = conversationId;
    this.characterId = characterId;
    this.characterName = characterName;
    this.characterAvatar = characterAvatar;
    this.isUserInitiator = isUserInitiator;

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

  // 模拟角色接听或挂断
  simulateCharacterAnswer() {
    const delay = Math.floor(Math.random() * 5000) + 3000; // 3-8秒

    this.autoAnswerTimeout = setTimeout(async () => {
      if (this.state !== 'dialing') return;

      // 概率：80%接听，15%对方拒接(忙)，5%无人接听
      const rand = Math.random();

      if (rand < 0.8) {
        this.acceptCall();
      } else if (rand < 0.95) {
        await this.endCall('busy'); // 对方忙
      } else {
        await this.endCall('missed'); // 无人接听
      }
    }, delay);
  },

  // 接听
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

  // 主动拒接（当角色呼叫时）
  async declineCall() {
    if (this.state !== 'incoming') return;

    await this.endCall('declined');
  },

  // 结束/挂断通话
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

    // 写入数据库
    if (this.conversationId) {
      try {
        await db.messages.add({
          conversationId: this.conversationId,
          timestamp: Date.now(),
          sender: this.isUserInitiator ? 'user' : 'character',
          type: 'call',
          content: JSON.stringify({
            status: finalStatus,
            duration: duration,
          }),
        });

        // 触发自定义事件，使聊天室能感知更新
        window.dispatchEvent(new CustomEvent('call-history-updated', {
          detail: {
            conversationId: this.conversationId,
          },
        }));
      } catch (err) {
        console.error('Failed to log call history', err);
      }
    }

    // 重置状态
    this.state = 'idle';
    this.conversationId = null;
    this.characterId = null;
    this.characterName = '';
    this.characterAvatar = '';
    this.isUserInitiator = false;
    this.startTime = null;

    this.render();
  },

  updateTimer() {
    if (!this.overlay) return;

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');

    const timerEl = this.overlay.querySelector('.global-call-time');

    if (timerEl) {
      timerEl.textContent = `${mm}:${ss}`;
    }
  },

  render() {
    if (!this.overlay) return;

    if (this.state === 'idle') {
      this.overlay.className = '';
      this.overlay.innerHTML = '';
      return;
    }

    this.overlay.className = 'global-call-active';

    let statusText = '正在呼叫...';

    if (this.state === 'incoming') {
      statusText = '向你发起通话邀请';
    }

    if (this.state === 'connected') {
      statusText = '通话中';
    }

    const avatarHtmlStr = avatarHTML(this.characterAvatar, this.characterName, 100);

    let actionButtons = '';

    if (this.state === 'incoming') {
      actionButtons = `
        <button class="call-btn btn-decline" id="call-btn-decline">
          ${ICON.phoneHangup}
        </button>
        <button class="call-btn btn-accept" id="call-btn-accept">
          ${ICON.phone}
        </button>
      `;
    } else {
      actionButtons = `
        <button class="call-btn btn-hangup" id="call-btn-hangup">
          ${ICON.phoneHangup}
        </button>
      `;
    }

    this.overlay.innerHTML = `
      <div class="global-call-container">
        <div class="global-call-bg" style="background-image: url('${this.characterAvatar || ''}')"></div>
        <div class="global-call-mask"></div>

        <div class="global-call-content">
          <div class="global-call-avatar-wrapper ${this.state === 'connected' ? 'pulse' : 'breath'}">
            ${avatarHtmlStr}
          </div>

          <h2 class="global-call-name">${this.characterName}</h2>
          <p class="global-call-status">${statusText}</p>

          ${this.state === 'connected' ? '<div class="global-call-time">00:00</div>' : ''}

          <div class="global-call-actions">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;

    // 绑定事件
    const acceptBtn = this.overlay.querySelector('#call-btn-accept');
    const declineBtn = this.overlay.querySelector('#call-btn-decline');
    const hangupBtn = this.overlay.querySelector('#call-btn-hangup');

    if (acceptBtn) {
      acceptBtn.onclick = () => this.acceptCall();
    }

    if (declineBtn) {
      declineBtn.onclick = () => this.declineCall();
    }

    if (hangupBtn) {
      hangupBtn.onclick = () => this.endCall();
    }
  },
};
