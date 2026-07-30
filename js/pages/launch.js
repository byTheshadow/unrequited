import { pick, haptic } from '../utils.js';
import { navigate } from '../router.js';

const TAROT_CARDS = [
  {
    name: '星星', subtitle: 'THE STAR',
    svg: `
      <circle cx="55" cy="45" r="1.5" fill="currentColor" opacity="0.9"/>
      <circle cx="95" cy="55" r="2" fill="currentColor" opacity="0.9"/>
      <circle cx="45" cy="70" r="1.2" fill="currentColor" opacity="0.7"/>
      <circle cx="105" cy="90" r="1.5" fill="currentColor" opacity="0.8"/>
      <circle cx="35" cy="105" r="1" fill="currentColor" opacity="0.6"/>
      <path d="M75 55 l3 8 l8 1 l-6 5 l2 8 l-7 -4 l-7 4 l2 -8 l-6 -5 l8 -1 z" fill="currentColor"/>
      <path d="M60 100 q15 -8 30 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      <path d="M55 115 q20 -6 40 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
    `
  },
  {
    name: '月亮', subtitle: 'THE MOON',
    svg: `
      <path d="M78 45 a30 30 0 1 0 18 55 a24 24 0 1 1 -18 -55 z" fill="currentColor" opacity="0.92"/>
      <circle cx="45" cy="55" r="1" fill="currentColor" opacity="0.7"/>
      <circle cx="105" cy="80" r="1" fill="currentColor" opacity="0.6"/>
      <path d="M50 125 q25 -10 50 0" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    `
  },
  {
    name: '太阳', subtitle: 'THE SUN',
    svg: `
      <circle cx="75" cy="80" r="20" fill="currentColor" opacity="0.92"/>
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="75" y1="42" x2="75" y2="52"/>
        <line x1="75" y1="108" x2="75" y2="118"/>
        <line x1="37" y1="80" x2="47" y2="80"/>
        <line x1="103" y1="80" x2="113" y2="80"/>
        <line x1="48" y1="53" x2="55" y2="60"/>
        <line x1="95" y1="100" x2="102" y2="107"/>
        <line x1="48" y1="107" x2="55" y2="100"/>
        <line x1="95" y1="60" x2="102" y2="53"/>
      </g>
    `
  },
  {
    name: '恋人', subtitle: 'THE LOVERS',
    svg: `
      <circle cx="55" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M46 76 q9 16 18 0 v40 h-18 z" fill="currentColor" opacity="0.5"/>
      <circle cx="95" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M86 76 q9 16 18 0 v40 h-18 z" fill="currentColor" opacity="0.5"/>
      <path d="M75 92 l-6 -7 a4 4 0 0 1 6 -3 a4 4 0 0 1 6 3 z" fill="currentColor"/>
    `
  },
  {
    name: '愚人', subtitle: 'THE FOOL',
    svg: `
      <circle cx="75" cy="55" r="8" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M70 65 l-14 28 l9 5 l10 -18 l10 18 l9 -5 l-14 -28" fill="currentColor" opacity="0.55"/>
      <line x1="65" y1="102" x2="60" y2="128" stroke="currentColor" stroke-width="1.3"/>
      <line x1="85" y1="102" x2="90" y2="128" stroke="currentColor" stroke-width="1.3"/>
      <path d="M100 62 l14 -8 v10 z" fill="currentColor"/>
    `
  },
  {
    name: '女祭司', subtitle: 'THE HIGH PRIESTESS',
    svg: `
      <line x1="52" y1="50" x2="52" y2="130" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <line x1="98" y1="50" x2="98" y2="130" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <circle cx="75" cy="60" r="9" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M64 78 l11 -4 l11 4 v50 h-22 z" fill="currentColor" opacity="0.5"/>
      <circle cx="75" cy="42" r="3" fill="currentColor"/>
    `
  },
  {
    name: '世界', subtitle: 'THE WORLD',
    svg: `
      <ellipse cx="75" cy="85" rx="30" ry="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>
      <circle cx="75" cy="85" r="10" fill="currentColor" opacity="0.85"/>
      <path d="M75 50 l3 6 l-3 -1 l-3 1 z" fill="currentColor" opacity="0.6"/>
      <path d="M75 120 l3 -6 l-3 1 l-3 -1 z" fill="currentColor" opacity="0.6"/>
    `
  },
  {
    name: '隐者', subtitle: 'THE HERMIT',
    svg: `
      <path d="M75 45 a10 10 0 0 1 10 10 v20 l10 40 h-40 l10 -40 v-20 a10 10 0 0 1 10 -10 z" fill="currentColor" opacity="0.7"/>
      <circle cx="75" cy="52" r="4" fill="var(--color-bg-primary)"/>
      <circle cx="98" cy="80" r="5" fill="currentColor"/>
      <circle cx="98" cy="80" r="2.5" fill="var(--color-bg-primary)"/>
    `
  }
];

function cardHTML(card) {
  return `
    <div class="lc-wrap">
      <svg class="lc-card" viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lc-border" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.6"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0.2"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="146" height="196" rx="10" fill="none"
              stroke="url(#lc-border)" stroke-width="1.4"/>
        <rect x="8" y="8" width="134" height="184" rx="7" fill="none"
              stroke="currentColor" stroke-width="0.5" opacity="0.35"/>
        ${card.svg}
        <text x="75" y="158" text-anchor="middle" font-size="10"
              fill="currentColor" opacity="0.75" letter-spacing="2">${card.name}</text>
        <text x="75" y="174" text-anchor="middle" font-size="5.5"
              fill="currentColor" opacity="0.45" letter-spacing="2.5">${card.subtitle}</text>
      </svg>
    </div>
  `;
}

let timers = [];
let clickTarget = null;
let clickHandler = null;
let didGo = false;

export function render(root) {
  const card = pick(TAROT_CARDS);

  root.innerHTML = `
    <div class="launch-page page" id="launch-root">
      <div class="lp-bg"></div>
      <div class="lp-content">
        ${cardHTML(card)}
        <div class="lp-quote" id="lp-quote">&nbsp;</div>
        <div class="lp-hint" id="lp-hint">轻 触 继 续</div>
      </div>
      <style>
        .launch-page {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          min-height: 100dvh;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
        }
        .lp-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 30%, var(--color-bg-primary) 90%);
          pointer-events: none;
        }
        .lp-content {
          position: relative;
          display: flex; flex-direction: column;
          align-items: center; gap: 28px;
          padding: 32px;
        }
        .lc-wrap {
          width: 132px; height: 176px;
          color: var(--color-accent);
          perspective: 900px;
        }
        .lc-card {
          width: 100%; height: 100%;
          display: block;
          filter: drop-shadow(0 10px 30px var(--color-shadow));
          animation: launchFlip 1.5s cubic-bezier(.2,.7,.2,1) both;
          transform-origin: center;
        }
        .lp-quote {
          max-width: 300px;
          text-align: center;
          font-size: 14px;
          line-height: 2;
          letter-spacing: 1px;
          color: var(--color-text-secondary);
          opacity: 0;
          animation: launchQuoteIn 1s ease 0.9s forwards;
          min-height: 3em;
        }
        .lp-hint {
          font-size: 10px;
          letter-spacing: 4px;
          color: var(--color-text-tertiary);
          opacity: 0;
          animation: launchQuoteIn 0.8s ease 2s forwards;
        }
      </style>
    </div>
  `;

  // 加载治愈语
  fetch('./data/healingQuotes.json')
    .then((r) => r.json())
    .catch(() => ['在你看不见的地方，光也在发生'])
    .then((quotes) => {
      const el = document.getElementById('lp-quote');
      if (el) el.textContent = pick(quotes);
    });

  const go = () => {
    if (didGo) return;
    didGo = true;
    haptic(6);
    navigate('/home');
  };

  clickTarget = document.getElementById('launch-root');
  clickHandler = go;
  clickTarget.addEventListener('click', clickHandler);

  timers.push(setTimeout(go, 3000));
}

export function destroy() {
  timers.forEach(clearTimeout);
  timers = [];
  if (clickTarget && clickHandler) {
    clickTarget.removeEventListener('click', clickHandler);
  }
  clickTarget = null;
  clickHandler = null;
  didGo = false;
}
