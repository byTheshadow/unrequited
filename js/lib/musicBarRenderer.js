import { avatarHTML, escapeHtml, escapeAttr } from '../utils.js';

// SVG 图标定义
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

/**
 * 渲染共鸣卡片的 HTML 字符串 (精致自适应版)
 * @param {Object} u - User 对象
 * @param {Object} c - Character 对象
 * @param {Object} music - 音乐舱参数对象 { signature, distance, style, playing }
 * @param {number} todayCount - 今日产生的消息数
 */
export function renderMusicCardHTML(u, c, music, todayCount) {
  const distance = music.distance != null ? music.distance : '相距 1024 光年';
  const signature = music.signature != null ? music.signature : '一支未命名的曲子';
  
  // 默认使用 polaroid 风格
  const style = (music.style && ['polaroid', 'sonic', 'tape'].includes(music.style)) ? music.style : 'polaroid';
  const playing = !!music.playing;

  const isPolaroidActive = style === 'polaroid' ? 'active' : '';
  const isSonicActive = style === 'sonic' ? 'active' : '';
  const isTapeActive = style === 'tape' ? 'active' : '';

  return `
    <div class="music-card-immersive ${playing ? 'is-playing' : ''}">
      
      <!-- 顶部隐形悬浮控制栏 -->
      <div class="floating-controls">
        <select class="stealth-select music-style-select" id="music-style-select">
          <option value="polaroid" ${style === 'polaroid' ? 'selected' : ''}>📸 拍立得 (Polaroid)</option>
          <option value="sonic" ${style === 'sonic' ? 'selected' : ''}>🎵 灵魂共鸣 (Resonance)</option>
          <option value="tape" ${style === 'tape' ? 'selected' : ''}>📼 狂热磁带 (Retro Tape)</option>
        </select>
        
        <button class="stealth-play-btn ${playing ? 'is-active' : ''}" id="music-play-toggle" title="播放/暂停">
          ${playing ? SVG_PAUSE : SVG_PLAY}
        </button>
      </div>

      <!-- ================== 风格 1: 拍立得 ================== -->
      <div class="style-view view-polaroid ${isPolaroidActive}" id="view-polaroid">
        <!-- SVG 命运红线 -->
        <svg class="red-thread-svg" viewBox="0 0 320 100" preserveAspectRatio="none">
          <path class="path-thread" d="M 75 48 C 115 88, 205 8, 245 48" />
        </svg>

        <!-- 飘浮粒子 -->
        <div class="particles-layer">
          <span class="particle p1">♥</span>
          <span class="particle p2">✦</span>
          <span class="particle p3">♥</span>
          <span class="particle p4">✦</span>
        </div>

        <div class="polaroid-wrapper">
          <div class="mini-polaroid polaroid-left">
            <div class="polaroid-photo">${avatarHTML(u?.avatar, u?.name, 66)}</div>
            <div class="polaroid-label">${escapeHtml(u?.name || 'User')}</div>
          </div>
          <div class="mini-polaroid polaroid-right">
            <div class="polaroid-photo">${avatarHTML(c?.avatar, c?.name, 66)}</div>
            <div class="polaroid-label">${escapeHtml(c?.name || 'Char')}</div>
          </div>
        </div>

        <!-- 完美的隐形手写手势签名/距离 -->
        <div class="polaroid-inputs">
          <input class="stealth-input polaroid-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="写下你们的心动密语..." maxlength="60">
          <input class="stealth-input polaroid-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="距离..." maxlength="30">
        </div>
      </div>

      <!-- ================== 风格 2: 灵魂共鸣 ================== -->
      <div class="style-view view-sonic ${isSonicActive}" id="view-sonic">
        <div class="sonic-ambient-glow"></div>
        
        <!-- 漂浮音符粒子 -->
        <div class="particles-layer">
          <span class="particle p1">♪</span>
          <span class="particle p2">♫</span>
          <span class="particle p3">✦</span>
          <span class="particle p4">✧</span>
        </div>

        <div class="sonic-player-row">
          <div class="mini-vinyl">
            <div class="vinyl-record">
              <div class="vinyl-cover">${avatarHTML(u?.avatar, u?.name, 40)}</div>
            </div>
          </div>

          <div class="sonic-connection">
            <div class="sonic-glow-line"></div>
            <div class="sonic-visualizer">
              <div class="s-bar"></div><div class="s-bar"></div><div class="s-bar"></div>
              <div class="s-bar"></div><div class="s-bar"></div><div class="s-bar"></div>
              <div class="s-bar"></div>
            </div>
          </div>

          <div class="mini-vinyl">
            <div class="vinyl-record">
              <div class="vinyl-cover">${avatarHTML(c?.avatar, c?.name, 40)}</div>
            </div>
          </div>
        </div>

        <!-- 歌曲名液晶屏 -->
        <div class="sonic-lcd-display">
          <input class="stealth-input sonic-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="正在播放..." maxlength="60">
          <input class="stealth-input sonic-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="相距..." maxlength="30">
        </div>
      </div>

      <!-- ================== 风格 3: 狂热磁带 ================== -->
      <div class="style-view view-tape ${isTapeActive}" id="view-tape">
        <div class="mini-tape-body">
          <div class="tape-sticker">
            <input class="stealth-input tape-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="Tape-C90..." maxlength="60">
            
            <div class="tape-spindles">
              <div class="spindle-gear">
                <div class="gear-avatar">${avatarHTML(u?.avatar, u?.name, 18)}</div>
              </div>
              <div class="spindle-gear">
                <div class="gear-avatar">${avatarHTML(c?.avatar, c?.name, 18)}</div>
              </div>
            </div>
            
            <div class="tape-led-row">
              <div class="led-col"><div class="led-dot"></div><div class="led-dot"></div></div>
              <div class="led-col"><div class="led-dot"></div><div class="led-dot"></div></div>
              <div class="led-col"><div class="led-dot"></div><div class="led-dot"></div></div>
            </div>
          </div>
        </div>
        
        <input class="stealth-input tape-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="DISTANCE..." maxlength="30">
      </div>

      <!-- 右下角极度微缩不抢眼的共鸣度 -->
      <div class="music-mini-footer">今日共鸣 ${todayCount}</div>
    </div>
  `;
}
