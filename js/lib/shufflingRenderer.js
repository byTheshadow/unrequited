import { db } from '../db.js';

/**
 * 获取当前的洗牌/抽牌动画 HTML
 * @param {string} styleStyle 主题 ID
 * @returns {string} 内联的加载动画 HTML 结构
 */
export function getShufflingHTML(styleStyle = 'shuffle') {
  switch (styleStyle) {
    case 'angel': // 天使召唤
      // 生成漂浮文字的 HTML。文字：“我保证你是天使”
      const angelTexts = ['我', '保', '证', '你', '是', '天', '使'];
      const angelTextHTML = angelTexts.map((char, index) => {
        // 使用不规则的随机位置与延迟，使漂浮生动自然
        const left = 20 + index * 10 + Math.random() * 5;
        const delay = -index * 0.4 - Math.random() * 0.5;
        const duration = 2.5 + Math.random() * 1.5;
        return `<span class="float-txt float-txt-angel" style="left:${left}%; animation-delay:${delay}s; animation-duration:${duration}s;">${char}</span>`;
      }).join('');

      return `
        <div class="angel-box" aria-label="天使召唤中">
          <div class="angel-halo"></div>
          <div class="angel-rays"></div>
          <div class="angel-ring"></div>
          <div class="angel-core"></div>
          <div class="feathers">
            <div class="feather"></div>
            <div class="feather"></div>
            <div class="feather"></div>
            <div class="feather"></div>
          </div>
          <div class="stars">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="angel-notes">
            <i>♪</i><i>♬</i><i>♪</i>
          </div>
          <div class="angel-label">ANGEL CALL</div>
          <!-- 漂浮字体容器 -->
          <div class="floating-text-wrap">${angelTextHTML}</div>
        </div>
      `;

    case 'carousel': // 旋转木马
      return `
        <div class="carousel-box" aria-label="旋转木马八音盒正在挑选回应">
          <div class="carousel-glow"></div>
          <div class="carousel-top"></div>
          <div class="carousel-pole"></div>
          <div class="carousel-orbit">
            <div class="carousel-card"></div>
            <div class="carousel-card"></div>
            <div class="carousel-card"></div>
            <div class="carousel-card"></div>
            <div class="carousel-card"></div>
          </div>
          <div class="carousel-base"></div>
          <div class="carousel-sparkles">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="carousel-notes">
            <i>♪</i><i>♬</i><i>♪</i>
          </div>
          <div class="carousel-label">CAROUSEL</div>
        </div>
      `;

    case 'devil': // 恶魔召唤
      // 生成漂浮文字的 HTML。文字：“来自恶魔的爱”
      const devilTexts = ['来', '自', '恶', '魔', '的', '爱'];
      const devilTextHTML = devilTexts.map((char, index) => {
        const left = 22 + index * 11 + Math.random() * 5;
        const delay = -index * 0.5 - Math.random() * 0.4;
        const duration = 2.8 + Math.random() * 1.2;
        return `<span class="float-txt float-txt-devil" style="left:${left}%; animation-delay:${delay}s; animation-duration:${duration}s;">${char}</span>`;
      }).join('');

      return `
        <div class="summon-core" aria-label="正在召唤回应">
          <div class="altar"></div>
          <div class="sigil-ring"></div>
          <div class="runes">
            <span>†</span><span>✶</span><span>ᛉ</span><span>✦</span>
            <span>☽</span><span>ᚷ</span><span>✧</span><span>☿</span>
          </div>
          <div class="sigil-star"></div>
          <div class="sigil-core"></div>
          <div class="card-swirl">
            <div class="card"></div><div class="card"></div><div class="card"></div>
            <div class="card"></div><div class="card"></div><div class="card"></div>
          </div>
          <div class="flame"></div>
          <div class="embers">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="loading-label">SUMMONING</div>
          <!-- 漂浮字体容器 -->
          <div class="floating-text-wrap">${devilTextHTML}</div>
        </div>
      `;

    case 'zodiac': // 魔法星座
      return `
        <div class="zodiac-box" aria-label="正在通过星座挑选回应">
          <div class="nebula"></div>
          <div class="zodiac-ring"></div>
          <div class="zodiac-glyphs">
            <span>♈</span><span>♉</span><span>♊</span><span>♋</span>
            <span>♌</span><span>♍</span><span>♎</span><span>♏</span>
            <span>♐</span><span>♑</span><span>♒</span><span>♓</span>
          </div>
          <div class="card-orbit">
            <div class="astro-card"></div><div class="astro-card"></div>
            <div class="astro-card"></div><div class="astro-card"></div>
            <div class="astro-card"></div>
          </div>
          <div class="constellation">
            <svg viewBox="0 0 92 70" aria-hidden="true">
              <line x1="16" y1="44" x2="34" y2="22"></line>
              <line x1="34" y1="22" x2="54" y2="34"></line>
              <line x1="54" y1="34" x2="72" y2="14"></line>
              <line x1="54" y1="34" x2="66" y2="58"></line>
              <circle cx="16" cy="44" r="3"></circle>
              <circle cx="34" cy="22" r="3"></circle>
              <circle cx="54" cy="34" r="3.4"></circle>
              <circle cx="72" cy="14" r="2.8"></circle>
              <circle cx="66" cy="58" r="2.8"></circle>
            </svg>
          </div>
          <div class="star-core"></div>
          <div class="star-dust">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="loading-label">STAR ALIGNING</div>
        </div>
      `;

    case 'book': // 翻书选页
      return `
        <div class="book" aria-label="正在翻页筛选">
          <div class="flip-ray"></div>
          <div class="book-base"></div>
          <div class="page page-1"></div>
          <div class="page page-2"></div>
          <div class="page page-3"></div>
          <div class="page page-4"></div>
          <div class="page page-5"></div>
          <div class="page page-6"></div>
          <div class="page-edge"></div>
          <div class="book-label">TURNING PAGES</div>
        </div>
      `;

    case 'bottle': // 记忆漂流瓶
      return `
        <div class="bottle-wrap" aria-label="正在抽取讯息">
          <div class="bottle">
            <div class="bottle-body">
              <div class="bottle-water"></div>
              <div class="message"></div><div class="message"></div>
              <div class="message"></div><div class="message"></div>
              <div class="message"></div><div class="message"></div>
              <div class="message-focus"></div>
              <div class="message-sparkle"></div><div class="message-sparkle"></div>
              <div class="message-sparkle"></div><div class="message-sparkle"></div>
              <div class="bottle-label">MESSAGE IN BOTTLE</div>
            </div>
          </div>
        </div>
      `;

    case 'shuffle': // 经典洗牌
    default:
      return `
        <div class="shuffle-glow"></div>
        <div class="shuffle-orbit" aria-label="正在洗牌">
          <div class="card-sprite"></div><div class="card-sprite"></div>
          <div class="card-sprite"></div><div class="card-sprite"></div>
          <div class="card-sprite"></div><div class="card-sprite"></div>
          <div class="card-sprite"></div>
        </div>
        <div class="shuffle-caption">正在洗牌</div>
      `;
          case 'petal': // 花瓣抽签
      return `
        <div class="petal-box" aria-label="花瓣抽签中">
          <div class="petal-glow"></div>
          <div class="petal-mist"></div>
          <div class="petal-deck">
            <div class="petal-card deck-a"></div>
            <div class="petal-card deck-b"></div>
            <div class="petal-card deck-c"></div>
          </div>
          <div class="petal-burst">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="petal-card chosen-card"></div>
          <div class="petal-label">PETAL DRAW</div>
        </div>
      `;

    case 'holy': // 圣光天使
      return `
        <div class="holy-box" aria-label="圣光接引中">
          <div class="holy-pillar"></div>
          <div class="holy-halo"></div>
          <div class="holy-rays"></div>
          <div class="holy-deck">
            <div class="holy-card deck-a"></div>
            <div class="holy-card deck-b"></div>
            <div class="holy-card deck-c"></div>
          </div>
          <div class="holy-sparkles">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="holy-card chosen-card"></div>
          <div class="holy-label">HOLY ASCENSION</div>
        </div>
      `;

    case 'moon-tarot': // 月相塔罗
      return `
        <div class="moon-tarot-box" aria-label="月相塔罗抽卡中">
          <div class="moon-bg"></div>
          <div class="moon-ring"></div>
          <div class="moon-phase">
            <span class="phase p1">◐</span>
            <span class="phase p2">◑</span>
            <span class="phase p3">◒</span>
            <span class="phase p4">◓</span>
          </div>
          <div class="tarot-fan">
            <div class="tarot-card fan-1"></div>
            <div class="tarot-card fan-2"></div>
            <div class="tarot-card fan-3"></div>
            <div class="tarot-card fan-4"></div>
            <div class="tarot-card fan-5"></div>
          </div>
          <div class="tarot-moon"></div>
          <div class="tarot-chosen"></div>
          <div class="moon-tarot-label">MOON TAROT</div>
        </div>
      `;

    case 'ocean-wave': // 海浪飘牌
      return `
        <div class="ocean-wave-box" aria-label="海浪飘牌中">
          <div class="ocean-sky"></div>
          <div class="ocean-wave wave-a"></div>
          <div class="ocean-wave wave-b"></div>
          <div class="ocean-wave wave-c"></div>
          <div class="bubble-trail">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="ocean-deck">
            <div class="ocean-card deck-a"></div>
            <div class="ocean-card deck-b"></div>
            <div class="ocean-card deck-c"></div>
          </div>
          <div class="ocean-card chosen-card"></div>
          <div class="ocean-label">WAVE DRAW</div>
        </div>
      `;

  }
}

/**
 * 获取动画卡片最底部的文字提示
 */
export function getShufflingHint(styleStyle = 'shuffle') {
  switch (styleStyle) {
    case 'angel':
      return '以微光与羽翼，召唤最温柔的回应...';
    case 'carousel':
      return '旋转木马伴着琴音，轻轻流出它的回应...';
    case 'devil':
      return '正在以魔法阵召唤最契合的回应...';
    case 'zodiac':
      return '正在让星轨对齐最合适的回应...';
    case 'book':
      return '正在从记忆档案中翻找合适回应...';
    case 'bottle':
      return '正在从漂流讯息里抽取最合适的回应...';
    case 'shuffle':
    default:
      return '挑选最能引起共鸣的字卡碎片...';
    case 'petal':
      return '花瓣旋舞之间，正在抽取最柔和的回应...';
    case 'holy':
      return '圣光正在接引最纯净的回应...';
    case 'moon-tarot':
      return '月相缓缓对齐，塔罗正在揭示命定回应...';
    case 'ocean-wave':
      return '海浪推着卡牌起伏，正在浮出最合适的回应...';

  }
}
