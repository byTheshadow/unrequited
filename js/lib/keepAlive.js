// 后台保活（实验，多手段并用）
// 手段一：无声 WAV 循环播放（Audio 元素）
// 手段二：AudioContext 极低音量振荡器（辅助告诉浏览器有音频输出）
// 手段三：MediaSession API（声明本页面为媒体会话，锁屏栏可能显示）
// 手段四：visibilitychange 自动重试 play
//
// 效果（实测经验，非承诺）：
//   Android Chrome：明显延缓后台冻结
//   iOS Safari PWA：短时后台可保持，锁屏或长时间后台仍会被系统暂停
//   桌面浏览器：无需保活
//
// 需要用户交互后才能启动，浏览器策略限制。

import { db } from '../db.js';

let audio = null;
let objectUrl = null;
let ctx = null;
let osc = null;
let gain = null;
let started = false;
let onVisibility = null;

// 将默认时长修改为 600 秒（10分钟），大幅提升后台保活的稳定性
function makeSilentWavBlob(seconds = 600) {
  const sampleRate = 8000;
  const numSamples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const setStr = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  setStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  setStr(8, 'WAVE');
  setStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  setStr(36, 'data');
  view.setUint32(40, numSamples, true);

  // 性能优化：使用 TypedArray.fill 高效初始化静音字节
  const samples = new Uint8Array(buffer, 44, numSamples);
  samples.fill(128);

  return new Blob([buffer], { type: 'audio/wav' });
}

export function isRunning() { return started; }

export async function loadEnabled() {
  const rec = await db.settings.get('keepAlive.enabled');
  return !!(rec && rec.value);
}

export async function saveEnabled(v) {
  await db.settings.put({ key: 'keepAlive.enabled', value: !!v });
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Unrequited',
      artist: '恋恋不忘',
      album: '静默陪伴',
      // 添加封面图片有助于手机系统正常渲染锁屏播放小工具
      artwork: [
        { src: './icons/icon.svg', sizes: '512x512', type: 'image/svg+xml' }
      ]
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('play', () => { tryPlay(); });
    // 拦截暂停：不主动响应系统暂停指令
    navigator.mediaSession.setActionHandler('pause', () => { tryPlay(); });
    navigator.mediaSession.setActionHandler('stop', () => {});
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
  } catch (e) { /* 忽略 */ }
}

async function tryPlay() {
  if (!audio) return false;
  try { 
    await audio.play(); 
    // 成功播放后，明确将系统媒体会话设为播放状态
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    return true; 
  }
  catch (e) { return false; }
}

async function startAudioElement() {
  if (!audio) {
    objectUrl = URL.createObjectURL(makeSilentWavBlob(600));
    audio = new Audio(objectUrl);
    audio.loop = true;
    
    // 【关键修改点】：音量改回 1.0 (最大音量)
    // 物理音频数据是 100% 静音波形，用户听不到声音，但系统会正常显示锁屏卡片
    audio.volume = 1.0; 
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
  }
  return tryPlay();
}

function startOscillator() {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!osc) {
      osc = ctx.createOscillator();
      gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc.frequency.value = 20;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
    }
    return true;
  } catch (e) { return false; }
}

function stopOscillator() {
  try { if (osc) osc.stop(); } catch (e) {}
  try { if (osc) osc.disconnect(); } catch (e) {}
  try { if (gain) gain.disconnect(); } catch (e) {}
  osc = null;
  gain = null;
  try { if (ctx) ctx.close(); } catch (e) {}
  ctx = null;
}

export async function start() {
  const ok = await startAudioElement();
  startOscillator();
  setupMediaSession();
  started = ok;

  if (!onVisibility) {
    onVisibility = async () => {
      if (!started) return;
      if (document.visibilityState === 'visible' && audio && audio.paused) {
        await tryPlay();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
  }
  return ok;
}

export function stop() {
  try { if (audio) audio.pause(); } catch (e) {}
  stopOscillator();
  if (onVisibility) {
    document.removeEventListener('visibilitychange', onVisibility);
    onVisibility = null;
  }
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {}
  }
  started = false;
}

export function dispose() {
  stop();
  if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} objectUrl = null; }
  audio = null;
}

