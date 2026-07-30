// 月相：返回 0-1，0=新月，0.5=满月
export function getMoonPhase(date = new Date()) {
  const synodic = 29.53058867;
  // 参考新月 2000-01-06 18:14 UTC
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0) / 1000;
  const now = date.getTime() / 1000;
  const days = (now - ref) / 86400;
  let phase = (days % synodic) / synodic;
  if (phase < 0) phase += 1;
  return phase;
}

export function getMoonPhaseName(phase) {
  if (phase < 0.03 || phase >= 0.97) return '新月';
  if (phase < 0.22) return '娥眉月';
  if (phase < 0.28) return '上弦月';
  if (phase < 0.47) return '盈凸月';
  if (phase < 0.53) return '满月';
  if (phase < 0.72) return '亏凸月';
  if (phase < 0.78) return '下弦月';
  return '残月';
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function haptic(ms = 8) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }
}

// 简易 toast，全局挂载在 body
export function toast(text, duration = 1800) {
  let el = document.getElementById('__toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '__toast';
    el.style.cssText = `
      position: fixed; left: 50%; bottom: 14%; transform: translate(-50%, 10px);
      padding: 10px 18px; border-radius: 999px;
      background: var(--glass-bg); backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary); font-size: 13px;
      z-index: 9999; letter-spacing: 1px;
      opacity: 0; pointer-events: none;
      transition: opacity 0.25s, transform 0.25s;
      max-width: 80vw; text-align: center;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, 0)';
  });
  clearTimeout(el.__t);
  el.__t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 10px)';
  }, duration);
}
