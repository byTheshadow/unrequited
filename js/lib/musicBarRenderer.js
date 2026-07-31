import { avatarHTML, escapeHtml, escapeAttr } from '../utils.js';

// SVG 图标定义（不需要修改）
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

/**
 * 渲染共鸣卡片的 HTML 字符串 (沉浸式大版)
 * @param {Object} u - User 对象
 * @param {Object} c - Character 对象
 * @param {Object} music - 音乐舱参数对象 { signature, distance, style, playing }
 * @param {number} todayCount - 今日产生的消息数
 */
export function renderMusicCardHTML(u, c, music, todayCount) {
  const distance = music.distance != null ? music.distance : '相距 1024 光年';
  const signature = music.signature != null ? music.signature : '一支未命名的曲子';
  // 确保有效的设计风格，默认使用 tape 风格
  const style = (music.style && ['tape', 'netease', 'cd'].includes(music.style)) ? music.style : 'tape';
  const playing = !!music.playing;

  // 根据当前选择判定激活的 View
  const isTapeActive = style === 'tape' ? 'active' : '';
  const isNeteaseActive = style === 'netease' ? 'active' : '';
  const isCdActive = style === 'cd' ? 'active' : '';

  return `
    <div class="music-card-immersive ${playing ? 'is-playing' : ''}">
      
      <!-- 悬浮控制栏：包含无缝选择器与播放按钮 -->
      <div class="floating-controls">
        <select class="stealth-select music-style-select" id="music-style-select">
          <option value="tape" ${style === 'tape' ? 'selected' : ''}>磁带 (Tape Pro)</option>
          <option value="netease" ${style === 'netease' ? 'selected' : ''}>一起听 (Listen Together)</option>
          <option value="cd" ${style === 'cd' ? 'selected' : ''}>透明CD机 (Crystal CD)</option>
        </select>
        
        <button class="stealth-play-btn ${playing ? 'is-active' : ''}" id="music-play-toggle" title="虚拟播放开关">
          ${playing ? SVG_PAUSE : SVG_PLAY}
        </button>
      </div>

      <!-- ================== 风格 1: 狂热磁带 ================== -->
      <div class="style-view view-tape ${isTapeActive}" id="view-tape">
        <div class="tape-container">
          <div class="tape-sticker">
            <!-- 签名完美融入磁带横线 -->
            <input class="stealth-input tape-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="签名..." maxlength="60">
            
            <div class="tape-spindles-area">
              <div class="spindle">${avatarHTML(u?.avatar, u?.name, 34)}</div>
              <div class="spindle">${avatarHTML(c?.avatar, c?.name, 34)}</div>
            </div>
            
            <div class="tape-eq">
              <div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div>
              <div class="eq-bar"></div><div class="eq-bar"></div>
            </div>
          </div>
        </div>
        <input class="stealth-input tape-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="距离..." maxlength="30">
      </div>

      <!-- ================== 风格 2: 网易云一起听 ================== -->
      <div class="style-view view-netease ${isNeteaseActive}" id="view-netease">
        <div class="netease-blur-bg"></div>
        
        <div class="vinyl-wrapper">
          <div class="vinyl-record">
            <div class="vinyl-cover">
              <!-- 借用 Character 头像做黑胶封面 -->
              ${avatarHTML(c?.avatar, c?.name, 120)}
            </div>
          </div>
          <div class="stylus-arm"></div>
        </div>

        <div class="listen-together-area">
          <div class="lt-avatar">${avatarHTML(u?.avatar, u?.name, 44)}</div>
          <div class="lt-connection"><div class="lt-line-glow"></div></div>
          <div class="lt-avatar">${avatarHTML(c?.avatar, c?.name, 44)}</div>
        </div>

        <input class="stealth-input netease-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="签名..." maxlength="60">
        <input class="stealth-input netease-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="距离..." maxlength="30">
      </div>

      <!-- ================== 风格 3: Y2K 透明 CD 机 ================== -->
      <div class="style-view view-cd ${isCdActive}" id="view-cd">
        <div class="cd-player-case">
          <div class="cd-disc">
            <div class="cd-center-hole">
              <!-- 头像拼接 -->
              <div style="width:50%; height:100%; border-right: 1px solid #ccc;">${avatarHTML(u?.avatar, u?.name, 60)}</div>
              <div style="width:50%; height:100%;">${avatarHTML(c?.avatar, c?.name, 60)}</div>
            </div>
          </div>
        </div>
        
        <!-- Y2K 液晶屏幕完美融入输入框 -->
        <div class="cd-lcd-screen">
          <input class="cd-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="签名..." maxlength="60">
          <input class="cd-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="距离..." maxlength="30">
        </div>
      </div>

      <!-- 底部微小的共鸣条数统计 -->
      <div class="music-footer-count">今日共鸣: ${todayCount}</div>
    </div>
  `;
}
