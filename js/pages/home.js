import { getMoonPhase, getMoonPhaseName, haptic, toast } from '../utils.js';
import { navigate } from '../router.js';

function moonSVG(phase) {
  const size = 22, r = 9, cx = size / 2, cy = size / 2;
  const offset = Math.cos(phase * Math.PI * 2) * r * 2;
  const maskId = 'moon-mask-' + Math.random().toString(36).slice(2, 8);
  return `
    <svg viewBox="0 0 ${size} ${size}" width="18" height="18" aria-hidden="true">
      <defs>
        <mask id="${maskId}">
          <rect width="${size}" height="${size}" fill="black"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/>
          <circle cx="${cx + offset}" cy="${cy}" r="${r}" fill="black"/>
        </mask>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" opacity="0.18"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" mask="url(#${maskId})"/>
    </svg>
  `;
}

const settingsIcon = `
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
`;

const cardsGlyph = `
  <svg viewBox="0 0 60 60" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
    <rect x="10" y="14" width="24" height="34" rx="3" transform="rotate(-9 22 31)"/>
    <rect x="22" y="12" width="24" height="34" rx="3" transform="rotate(7 34 29)"/>
    <line x1="28" y1="24" x2="42" y2="24" opacity="0.55"/>
    <line x1="28" y1="30" x2="39" y2="30" opacity="0.55"/>
    <line x1="28" y1="36" x2="41" y2="36" opacity="0.55"/>
  </svg>
`;

const divinationGlyph = `
  <svg viewBox="0 0 60 60" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
    <circle cx="30" cy="30" r="18" opacity="0.55"/>
    <path d="M30 14 L34 26 L46 27 L37 35 L40 47 L30 40 L20 47 L23 35 L14 27 L26 26 Z"/>
    <circle cx="30" cy="30" r="2" fill="currentColor"/>
  </svg>
`;

let tiltCleanups = [];

function attachTilt(el) {
  let raf = null;
  const onMove = (e) => {
    const rect = el.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const x = (t.clientX - rect.left) / rect.width - 0.5;
    const y = (t.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.transform = `perspective(700px) rotateX(${-y * 6}deg) rotateY(${x * 6}deg)`;
    });
  };
  const onLeave = () => { cancelAnimationFrame(raf); el.style.transform = ''; };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointercancel', onLeave);
  el.addEventListener('touchend', onLeave);
  tiltCleanups.push(() => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('pointercancel', onLeave);
    el.removeEventListener('touchend', onLeave);
  });
}

// 已实装页面：这里补上 /divination
const IMPLEMENTED = ['/home', '/cards', '/divination', '/settings'];

export function render(root) {
  const phase = getMoonPhase();
  const phaseName = getMoonPhaseName(phase);

  root.innerHTML = `
    <div class="home-page page">
      <header class="home-top">
        <div class="moon-widget" title="当前月相：${phaseName}">
          <span class="moon-svg">${moonSVG(phase)}</span>
          <span class="moon-name">${phaseName}</span>
        </div>
      </header>
      <main class="home-main">
        <div class="brand-wrap">
          <div class="brand">Unrequited</div>
          <div class="brand-sub">恋 恋 不 忘</div>
        </div>
        <div class="entries">
          <button class="entry" data-nav="/cards" type="button">
            <div class="entry-glyph">${cardsGlyph}</div>
            <div class="entry-body">
              <div class="entry-title">字 卡</div>
              <div class="entry-sub">碎片拼接，一场陪伴</div>
            </div>
            <div class="entry-chev">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
          <button class="entry" data-nav="/divination" type="button">
            <div class="entry-glyph">${divinationGlyph}</div>
            <div class="entry-body">
              <div class="entry-title">占 卜</div>
              <div class="entry-sub">塔罗　雷诺曼　占星骰</div>
            </div>
            <div class="entry-chev">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        </div>
      </main>
      <footer class="home-bottom">
        <button class="icon-btn" data-nav="/settings" type="button" aria-label="设置">${settingsIcon}</button>
      </footer>
      <style>
        .home-page { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh;
          padding: 16px 20px; padding-top: calc(16px + env(safe-area-inset-top));
          padding-bottom: calc(16px + env(safe-area-inset-bottom)); animation: fadeInPlain 0.5s ease; }
        .home-top { display: flex; justify-content: flex-end; }
        .moon-widget { display: inline-flex; align-items: center; gap: 8px;
          padding: 7px 14px; border-radius: 999px;
          color: var(--color-text-secondary); font-size: 11px; letter-spacing: 3px;
          background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur)); border: 1px solid var(--color-border); }
        .moon-svg { display: inline-flex; }
        .home-main { flex: 1; display: flex; flex-direction: column; justify-content: center;
          gap: 40px; padding: 24px 0; }
        .brand-wrap { text-align: center; }
        .brand { font-size: 28px; letter-spacing: 8px; font-weight: 300; color: var(--color-text-primary); }
        .brand-sub { margin-top: 10px; font-size: 11px; letter-spacing: 8px; color: var(--color-text-tertiary); }
        .entries { display: flex; flex-direction: column; gap: 16px; }
        .entry { display: flex; align-items: center; gap: 16px; width: 100%;
          padding: 22px 20px; background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--color-border); border-radius: var(--radius-lg);
          color: var(--color-text-primary); text-align: left;
          box-shadow: 0 4px 24px var(--color-shadow);
          transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.3s;
          will-change: transform; }
        .entry:active { transform: scale(0.985) !important; box-shadow: 0 2px 12px var(--color-shadow); }
        .entry-glyph { flex-shrink: 0; width: 54px; height: 54px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-md); color: var(--color-accent);
          background: var(--color-bg-secondary); }
        .entry-body { flex: 1; min-width: 0; }
        .entry-title { font-size: 19px; letter-spacing: 6px; font-weight: 400; margin-bottom: 4px; }
        .entry-sub { font-size: 11px; color: var(--color-text-tertiary); letter-spacing: 2px; }
        .entry-chev { color: var(--color-text-tertiary); flex-shrink: 0; }
        .home-bottom { display: flex; justify-content: center; padding-top: 12px; }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 999px;
          color: var(--color-text-secondary); transition: color 0.2s, transform 0.2s; }
        .icon-btn:active { color: var(--color-accent); transform: rotate(30deg); }
        @media (max-height: 640px) {
          .brand { font-size: 24px; } .home-main { gap: 24px; }
          .entry { padding: 18px 18px; } .entry-glyph { width: 46px; height: 46px; }
          .entry-title { font-size: 17px; }
        }
      </style>
    </div>
  `;

  root.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      haptic(8);
      const path = el.getAttribute('data-nav');
      if (!IMPLEMENTED.includes(path)) {
        const name = path === '/divination' ? '占卜' : path === '/settings' ? '设置' : '';
        toast(`「${name}」将在后续阶段实装`);
        return;
      }
      navigate(path);
    });
  });

  root.querySelectorAll('.entry').forEach(attachTilt);
}

export function destroy() {
  tiltCleanups.forEach((fn) => { try { fn(); } catch (e) {} });
  tiltCleanups = [];
}
