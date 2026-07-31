import { avatarHTML, escapeHtml, escapeAttr } from '../utils.js';

// SVG 图标定义（播放与暂停）
const SVG_PLAY = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const SVG_PAUSE = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

/**
 * 渲染共鸣卡片的 HTML 字符串 (沉浸微缩自适应主题版)
 * @param {Object} u - User 对象
 * @param {Object} c - Character 对象
 * @param {Object} music - 音乐舱参数对象 { signature, distance, style, playing }
 * @param {number} todayCount - 今日产生的消息数
 */
export function renderMusicCardHTML(u, c, music, todayCount) {
  const distance = music.distance != null ? music.distance : '相距 1024 光年';
  const signature = music.signature != null ? music.signature : '一支未命名的曲子';
  
  // 风格限制在精致版支持的3类：tape, netease, cd
  const style = (music.style && ['tape', 'netease', 'cd'].includes(music.style)) ? music.style : 'tape';
  const playing = !!music.playing;

  const isTapeActive = style === 'tape' ? 'active' : '';
  const isNeteaseActive = style === 'netease' ? 'active' : '';
  const isCdActive = style === 'cd' ? 'active' : '';

  return `
    <div class="music-card-immersive ${playing ? 'is-playing' : ''}">
      
      <!-- 悬浮控制栏（切换风格与开关，隐形自适应） -->
      <div class="floating-controls">
        <select class="stealth-select music-style-select" id="music-style-select">
          <option value="tape" ${style === 'tape' ? 'selected' : ''}>复古磁带 (Tape)</option>
          <option value="netease" ${style === 'netease' ? 'selected' : ''}>一起听 (Together)</option>
          <option value="cd" ${style === 'cd' ? 'selected' : ''}>CD 播放机 (Crystal CD)</option>
        </select>
        
        <button class="stealth-play-btn ${playing ? 'is-active' : ''}" id="music-play-toggle" title="虚拟播放开关">
          ${playing ? SVG_PAUSE : SVG_PLAY}
        </button>
      </div>

      <!-- ================== 风格 1: 复古磁带 ================== -->
      <div class="style-view view-tape ${isTapeActive}" id="view-tape">
        <div class="tape-container">
          <div class="tape-sticker">
            <!-- 签名写入标签线 -->
            <input class="stealth-input tape-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="在此处写入签名..." maxlength="60">
            
            <div class="tape-spindles-area">
              <div class="spindle">${avatarHTML(u?.avatar, u?.name, 20)}</div>
              <div class="spindle">${avatarHTML(c?.avatar, c?.name, 20)}</div>
            </div>
            
            <div class="tape-eq">
              <div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div>
              <div class="eq-bar"></div><div class="eq-bar"></div>
            </div>
          </div>
        </div>
        <input class="stealth-input tape-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="设定相距距离..." maxlength="30">
      </div>

      <!-- ================== 风格 2: 一起听 ================== -->
      <div class="style-view view-netease ${isNeteaseActive}" id="view-netease">
        <div class="netease-blur-bg"></div>
        
        <div class="vinyl-wrapper">
          <div class="vinyl-record">
            <div class="vinyl-cover">
              <!-- 借用人物头像作为精致黑胶封面 -->
              ${avatarHTML(c?.avatar, c?.name, 60)}
            </div>
          </div>
          <div class="stylus-arm"></div>
        </div>

        <div class="listen-together-area">
          <div class="lt-avatar">${avatarHTML(u?.avatar, u?.name, 28)}</div>
          <div class="lt-connection"><div class="lt-line-glow"></div></div>
          <div class="lt-avatar">${avatarHTML(c?.avatar, c?.name, 28)}</div>
        </div>

        <input class="stealth-input netease-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="在此处写入签名..." maxlength="60">
        <input class="stealth-input netease-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="设定相距距离..." maxlength="30">
      </div>

      <!-- ================== 风格 3: 透明 CD 机 ================== -->
      <div class="style-view view-cd ${isCdActive}" id="view-cd">
        <div class="cd-player-case">
          <div class="cd-disc">
            <div class="cd-center-hole">
              <!-- 头像拼接 -->
              <div style="width:50%; height:100%; overflow:hidden;">${avatarHTML(u?.avatar, u?.name, 24)}</div>
              <div style="width:50%; height:100%; overflow:hidden;">${avatarHTML(c?.avatar, c?.name, 24)}</div>
            </div>
          </div>
        </div>
        
        <!-- Y2K 液晶屏融入输入框 -->
        <div class="cd-lcd-screen">
          <input class="cd-input-sig music-signature" data-target="music" data-field="signature" value="${escapeAttr(signature)}" placeholder="签名..." maxlength="60">
          <input class="cd-input-dist music-distance" data-target="music" data-field="distance" value="${escapeAttr(distance)}" placeholder="距离..." maxlength="30">
        </div>
      </div>

      <!-- 底部微缩共鸣统计 -->
      <div class="music-footer-count">今日共鸣: ${todayCount}</div>
    </div>
  `;
}
