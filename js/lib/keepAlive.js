// 后台保活（实验）
// 原理：循环播放一段无声音频，尝试让浏览器把页面视为"正在播放媒体"，从而减少节流。
// 实际效果：
//   Android Chrome 有一定作用，能延缓后台冻结；
//   iOS Safari PWA 通常仍会在锁屏或长时间后台后被系统暂停，仅能延缓；
//   非常费电。用户可自行开关。
// 必须由用户交互（点击）触发首次 play，否则浏览器会拒绝。

import { db } from '../db.js';

let audio = null;
let started = false;
let objectUrl = null;

function makeSilentWavBlob(seconds = 1) {
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
  view.setUint16(20, 1, true);       // PCM
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);       // 8-bit
  setStr(36, 'data');
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // silence
  return new Blob([buffer], { type: 'audio/wav' });
}

export function isRunning() {
  return started;
}

export async function loadEnabled() {
  const rec = await db.settings.get('keepAlive.enabled');
  return !!(rec && rec.value);
}

export async function saveEnabled(v) {
  await db.settings.put({ key: 'keepAlive.enabled', value: !!v });
}

export async function start() {
  if (started && audio && !audio.paused) return true;
  try {
    if (!audio) {
      objectUrl = URL.createObjectURL(makeSilentWavBlob(1));
      audio = new Audio(objectUrl);
      audio.loop = true;
      audio.volume = 0;
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
    }
    await audio.play();
    started = true;
    return true;
  } catch (e) {
    console.warn('[keepAlive] start failed:', e && e.message);
    started = false;
    return false;
  }
}

export function stop() {
  if (audio) {
    try { audio.pause(); } catch (e) {}
  }
  started = false;
}

export function dispose() {
  stop();
  if (objectUrl) {
    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
    objectUrl = null;
  }
  audio = null;
}
