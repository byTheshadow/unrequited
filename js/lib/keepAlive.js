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

  // 性能优化：使用 TypedArray.fill 高效初始化静音字节，避免大循环阻塞主线程
  // 8位无符号 WAV 文件的静音中心值（中值）是 128
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
  try { await audio.play(); return true; }
  catch (e) { return false; }
}

async function startAudioElement() {
  if (!audio) {
    // 1. 为什么改成 10 分钟（600 秒）？
    //    当网页退到后台时，JS 引擎和事件循环会被浏览器严重限流或暂停。如果音频太短（比如 1 秒），
    //    音频频繁地在“结束-重新播放”之间循环（Loop），这种循环切换极易因为后台限流而中断挂起。
    //    生成 10 分钟的音频后，10分钟内只需要正常播放即可，不需要频繁触发循环重播，大大降低了后台中断的概率。
    //
    // 2. 内存开销大吗？
    //    在 8000Hz 采样率、单声道、8位深度下，10分钟的文件仅约 4.8 MB，在现代手机内存中几乎可以忽略不计。
    objectUrl = URL.createObjectURL(makeSilentWavBlob(600));
    audio = new Audio(objectUrl);
    audio.loop = true;
    
    // 3. 为什么 volume 设置为 0.01 而不是 0？
    //    部分浏览器（如 iOS Safari 或部分安卓系统）一旦检测到 <audio> 标签音量设为 0，
    //    会为了省电而触发静音优化，从而将该音频进程挂起或杀掉。
    //    由于我们生成的 WAV 物理波形数据本身就是纯静音的（全为 128 振幅），即使你把系统音量开到最大，
    //    它也完全不会发出任何声响，因此将 volume 设为 0.01 可以绕过浏览器的“零音量挂起检测”，更加安全。
    audio.volume = 0.01;
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
    try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
  }
  started = false;
}

export function dispose() {
  stop();
  if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (e) {} objectUrl = null; }
  audio = null;
}
