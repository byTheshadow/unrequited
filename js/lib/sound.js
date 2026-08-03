import { db } from '../db.js';

let ctx = null;
let masterGain = null;
let cache = {
  volume: 0.6,
  muted: false,
  builtin: 'bell',
  customUrl: null,
  loaded: false,
};
let customBuffer = null;
let customBufferKey = null;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = cache.muted ? 0 : cache.volume;
    masterGain.connect(ctx.destination);
  } catch (e) {
    console.warn('[sound] 无法创建 AudioContext:', e);
    ctx = null;
  }
  return ctx;
}

// 用户手势里调用一次，解锁 iOS 音频上下文
export async function unlock() {
  const c = ensureCtx();
  if (!c) return false;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch (e) {}
  }
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (e) {}
  return c.state === 'running';
}

export async function loadConfig() {
  if (cache.loaded) return { ...cache };
  const keys = ['sound.volume', 'sound.muted', 'sound.builtin', 'sound.customUrl'];
  const rows = await Promise.all(keys.map((k) => db.settings.get(k)));
  if (rows[0] && typeof rows[0].value === 'number') cache.volume = rows[0].value;
  if (rows[1]) cache.muted = !!rows[1].value;
  if (rows[2] && rows[2].value) cache.builtin = rows[2].value;
  if (rows[3]) cache.customUrl = rows[3].value || null;
  cache.loaded = true;
  if (masterGain) masterGain.gain.value = cache.muted ? 0 : cache.volume;
  return { ...cache };
}

export async function saveConfig(patch) {
  Object.assign(cache, patch);
  const entries = [];
  if ('volume' in patch) entries.push({ key: 'sound.volume', value: patch.volume });
  if ('muted' in patch) entries.push({ key: 'sound.muted', value: !!patch.muted });
  if ('builtin' in patch) entries.push({ key: 'sound.builtin', value: patch.builtin });
  if ('customUrl' in patch) entries.push({ key: 'sound.customUrl', value: patch.customUrl });
  await Promise.all(entries.map((e) => db.settings.put(e)));
  if (masterGain) masterGain.gain.value = cache.muted ? 0 : cache.volume;
  if ('customUrl' in patch) {
    customBuffer = null;
    customBufferKey = null;
  }
  return { ...cache };
}

export function getConfig() { return { ...cache }; }

function playBell(gainScale = 1, destination = null) {
  const c = ensureCtx();
  if (!c) return;
  const dest = destination || masterGain;
  if (!dest) return;

  const now = c.currentTime;
  const harmonics = [
    { f: 880, g: 1.0 },
    { f: 1760, g: 0.4 },
    { f: 2640, g: 0.15 },
  ];
  harmonics.forEach(({ f, g }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(g * gainScale, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.55);
  });
}

function playChime(gainScale = 1, destination = null) {
  const c = ensureCtx();
  if (!c) return;
  const dest = destination || masterGain;
  if (!dest) return;

  const now = c.currentTime;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3000;
  filter.connect(dest);

  const harmonics = [
    { f: 523.25, g: 1.0 },
    { f: 1046.5, g: 0.3 },
  ];
  harmonics.forEach(({ f, g }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(g * gainScale, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(gain);
    gain.connect(filter);
    osc.start(now);
    osc.stop(now + 0.95);
  });

  // 一点点延迟叠加，制造空灵感
  const delay = c.createDelay(0.5);
  delay.delayTime.value = 0.14;
  const delayGain = c.createGain();
  delayGain.gain.value = 0.18 * gainScale;
  filter.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(dest);
}

async function loadCustomBuffer(url) {
  if (customBuffer && customBufferKey === url) return customBuffer;
  const c = ensureCtx();
  if (!c) return null;
  try {
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const buf = await c.decodeAudioData(ab);
    customBuffer = buf;
    customBufferKey = url;
    return buf;
  } catch (e) {
    return null;
  }
}

async function playCustom(url, gainScale = 1, destination = null) {
  const c = ensureCtx();
  if (!c) return;
  const dest = destination || masterGain;
  if (!dest) return;

  const buf = await loadCustomBuffer(url);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = gainScale;
  src.connect(gain);
  gain.connect(dest);
  src.start(0);
}

// which: 'user' | 'character'
// convOption: 'inherit' | 'silent' | 'bell' | 'chime' | 'custom' | undefined
// convCustomUrl: string | null | undefined
export function play(which, convOption, convCustomUrl) {
  if (document.visibilityState !== 'visible') return;

  const opt = convOption || 'inherit';
  if (opt === 'silent') return;

  // 1. 同步获取并激活 AudioContext，锁死手势响应
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try { c.resume().catch(() => {}); } catch (e) {}
  }

  const triggerPlay = () => {
    if (cache.muted) return;

    let type = cache.builtin;
    let customUrl = cache.customUrl;
    if (opt !== 'inherit') {
      type = opt;
      if (opt === 'custom') customUrl = convCustomUrl || cache.customUrl;
    }
    if (type === 'none' || !type) return;

    const gainScale = which === 'user' ? 0.6 : 1.0;
    if (type === 'bell') playBell(gainScale);
    else if (type === 'chime') playChime(gainScale);
    else if (type === 'custom') {
      if (!customUrl) return;
      playCustom(customUrl, gainScale).catch(() => {});
    }
  };

  // 2. 如果配置已加载，同步触发播放（防止产生微任务丢失手势）
  if (cache.loaded) {
    triggerPlay();
  } else {
    // 降级兼容：如果尚未加载则异步加载后播放
    loadConfig().then(() => {
      triggerPlay();
    }).catch(() => {});
  }
}

export async function preview(type, customUrl) {
  // 试听直连 c.destination，彻底绕过 masterGain 的静音和音量限制
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try { await c.resume(); } catch (e) {}
  }

  if (type === 'bell') {
    playBell(1, c.destination);
  } else if (type === 'chime') {
    playChime(1, c.destination);
  } else if (type === 'custom' && customUrl) {
    await playCustom(customUrl, 1, c.destination);
  }
}
