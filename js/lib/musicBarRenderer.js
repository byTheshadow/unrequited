import { avatarHTML, escapeHtml, escapeAttr } from '../utils.js';

// SVG 图标定义（不使用外部 unicode 字符）
const SVG_MUSIC = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const SVG_TUNE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6"/></svg>`;

/**
 * 随机获取小票机底部的装饰性甜文案
 */
function getDecorWhisper(todayCount) {
  if (todayCount === 0) {
    return '◈ 信号初次对准，今日尚未捕获共鸣。';
  } else if (todayCount > 0 && todayCount < 5) {
    return '◈ 微弱的声波正在这颗星球的极夜里漫延。';
  } else if (todayCount >= 5 && todayCount < 10) {
    return '◈ 确认接收到你的引力，光年已不再遥远。';
  } else if (todayCount >= 10 && todayCount < 20) {
    return '◈ 听，宇宙背景辐射里藏着我们聊天的回音。';
  } else {
    return '◈ 恋恋不忘，必有回响。今日共鸣信号已满载。';
  }
}

/**
 * 渲染共鸣卡片的 HTML 字符串
 * @param {Object} u - User 对象
 * @param {Object} c - Character 对象
 * @param {Object} music - 音乐舱参数对象 { signature, distance, style, playing }
 * @param {number} todayCount - 今日产生的消息数
 */
export function renderMusicCardHTML(u, c, music, todayCount) {
  const distance = music.distance != null ? music.distance : '相距 1024 光年';
  const signature = music.signature != null ? music.signature : '一支未命名的曲子';
  const style = music.style || 'orbit';
  const playing = !!music.playing;

  // 计算潮汐月相百分比 (N=20 相当于满月)
  const percent = Math.min(100, Math.round((todayCount / 20) * 100));

  // 1. 生成中间内容区域的 HTML
  let contentHTML = '';

  if (style === 'orbit') {
    // 星轨共鸣 (Orbit Resonance)
    contentHTML = `
      <div class="music-style-orbit ${playing ? 'is-playing' : ''}">
        <div class="orbit-space">
          <div class="orbit-line orbit-line-inner"></div>
          <div class="orbit-line orbit-line-outer"></div>
          
          <div class="orbit-track orbit-track-inner">
            <div class="orbit-avatar orbit-avatar-user" title="${escapeAttr(u?.name || 'User')}">
              ${avatarHTML(u?.avatar, u?.name, 30)}
            </div>
          </div>
          
          <div class="orbit-track orbit-track-outer">
            <div class="orbit-avatar orbit-avatar-char" title="${escapeAttr(c?.name || 'Character')}">
              ${avatarHTML(c?.avatar, c?.name, 30)}
            </div>
          </div>
          
          <div class="orbit-core-glow"></div>
        </div>
      </div>
    `;
  } else if (style === 'tape') {
    // 复古磁带 (Retro Tape)
    contentHTML = `
      <div class="music-style-tape ${playing ? 'is-playing' : ''}">
        <div class="tape-body">
          <div class="tape-sticker">
            <div class="tape-sticker-title">UNREQUITED TAPE-C90</div>
            <div class="tape-spindles">
              <div class="tape-spindle spindle-left">
                <div class="spindle-avatar">${avatarHTML(u?.avatar, u?.name, 26)}</div>
                <div class="spindle-teeth"></div>
              </div>
              <div class="tape-spindle spindle-right">
                <div class="spindle-avatar">${avatarHTML(c?.avatar, c?.name, 26)}</div>
                <div class="spindle-teeth"></div>
              </div>
            </div>
            <div class="tape-sound-waves">
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
              <span class="wave-bar"></span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (style === 'tide') {
    // 潮汐月相 (Lunar Tide)
    contentHTML = `
      <div class="music-style-tide ${playing ? 'is-playing' : ''}" style="--tide-percent: ${percent}%;">
        <div class="tide-container">
          <div class="tide-avatar tide-avatar-left">${avatarHTML(u?.avatar, u?.name, 38)}</div>
          
          <div class="tide-moon-core">
            <div class="tide-moon-sphere"></div>
            <div class="tide-moon-shadow"></div>
            <div class="tide-moon-glow"></div>
          </div>
          
          <div class="tide-avatar tide-avatar-right">${avatarHTML(c?.avatar, c?.name, 38)}</div>
        </div>
        ${playing && percent >= 100 ? `
          <div class="tide-aurora-waves">
            <span class="tide-wave-ring ring-1"></span>
            <span class="tide-wave-ring ring-2"></span>
          </div>
        ` : ''}
      </div>
    `;
  } else if (style === 'receipt') {
    // 灵动小票机 (Receipt Printer)
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    contentHTML = `
      <div class="music-style-receipt ${playing ? 'is-playing' : ''}">
        <div class="receipt-printer-slot"></div>
        <div class="receipt-paper">
          <div class="receipt-decor-top">--- DUET RECEIPT ---</div>
          <div class="receipt-dither-avatars">
            <div class="receipt-dither-av user-1bit">${avatarHTML(u?.avatar, u?.name, 24)}</div>
            <div class="receipt-dither-link">${SVG_TUNE}</div>
            <div class="receipt-dither-av char-1bit">${avatarHTML(c?.avatar, c?.name, 24)}</div>
          </div>
          
          <div class="receipt-divider">* * * * * * * * * * * *</div>
          
          <div class="receipt-marquee">
            <div class="receipt-marquee-inner">
              <span>NOW PLAYING: ${escapeHtml(signature)} ✦ DISTANCE: ${escapeHtml(distance)} ✦ RESONANCE: ${todayCount} ✦</span>
              <span>NOW PLAYING: ${escapeHtml(signature)} ✦ DISTANCE: ${escapeHtml(distance)} ✦ RESONANCE: ${todayCount} ✦</span>
            </div>
          </div>
          
          <div class="receipt-divider">* * * * * * * * * * * *</div>
          <div class="receipt-whisper">${getDecorWhisper(todayCount)}</div>
          <div class="receipt-barcode"></div>
          <div class="receipt-meta">
            <div>今日消息: ${todayCount} 条</div>
            <div>打印时间: ${timeStr}</div>
          </div>
        </div>
      </div>
    `;
  }

  // 返回完整的卡片布局
  return `
    <div class="music-header">
      <div class="music-icon">${SVG_MUSIC}</div>
      <div class="music-title">共鸣空间</div>
      <button class="music-play-btn ${playing ? 'is-active' : ''}" id="music-play-toggle" title="虚拟播放开关">
        ${playing ? SVG_PAUSE : SVG_PLAY}
      </button>
    </div>
    
    <div class="music-main-viewport">
      ${contentHTML}
    </div>
    
    <div class="music-inputs-panel">
      <div class="music-input-row">
        <span class="music-input-label">距离</span>
        <input class="ghost-input music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="相距 ..." maxlength="30">
      </div>
      <div class="music-input-row">
        <span class="music-input-label">签名</span>
        <input class="ghost-input music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="一支未命名的曲子" maxlength="60">
      </div>
      
      <div class="music-input-row">
        <span class="music-input-label">外观</span>
        <select class="select music-style-select" id="music-style-select">
          <option value="orbit" ${style === 'orbit' ? 'selected' : ''}>星轨共鸣 (Orbit)</option>
          <option value="tape" ${style === 'tape' ? 'selected' : ''}>复古磁带 (Tape)</option>
          <option value="tide" ${style === 'tide' ? 'selected' : ''}>潮汐月相 (Tide)</option>
          <option value="receipt" ${style === 'receipt' ? 'selected' : ''}>小票打印 (Receipt)</option>
        </select>
      </div>
    </div>
    
    <div class="music-footer">
      <div class="music-count">今日累计共鸣 <b>${todayCount}</b> 条消息</div>
    </div>
  `;
}
