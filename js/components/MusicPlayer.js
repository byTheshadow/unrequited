import { db } from '../db.js';
import { MusicPlaylistPage } from './MusicPlaylistPage.js';

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.songs = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    
    // 初始化配置，增加“是否显示悬浮球”变量
    this.config = {
      theme: 'midnight',
      silentListening: false,     // 静默模式
      roleAutoSwitch: true,       // 角色自主切歌
      rotateRecord: true,         // 微浮动效果
      showFloatBadge: true,       // 显示/隐藏悬浮图标
      bindCharacterId: null       // 共鸣绑定对象ID
    };

    this.hasTriggeredAutoSwitchThisSong = false;
    this.init();
  }

  async init() {
    // 1. 获取本地数据库状态
    await this.loadConfigFromDB();
    await this.loadSongsFromDB();

    // 2. 初始化挂载全屏设置子页面
    this.playlistPage = new MusicPlaylistPage(this);

    // 劫持并拦截设置页面的 show 方法，在它打开时动态注入网络搜索框
    const originalShow = this.playlistPage.show;
    if (originalShow) {
      this.playlistPage.show = (...args) => {
        originalShow.apply(this.playlistPage, args);
        // 稍作延迟以确保它的 DOM Overlay 已经渲染完成并插入文档中
        setTimeout(() => this.injectSearchIntoPlaylistPage(), 80);
      };
    }

    // 3. 渲染小挂件 DOM
    this.renderDOM();
    
    // 4. 监听音频事件
    this.bindAudioEvents();

    // 5. 监听全局自定义事件
    this.bindGlobalEvents();

    // 6. 注入手机端适配的布局防缩水/防拉伸样式修复
    this.injectFixStyles();

    // 7. 轮询对齐主界面上的月相图标
    this.startAlignWithMoonIcon();
  }

  // 注入样式修复：锁死音乐触发按钮大小，防止月相文字折行，并添加搜索组件相关 CSS 样式
  injectFixStyles() {
    if (document.getElementById('music-player-fix-styles')) return;
    const style = document.createElement('style');
    style.id = 'music-player-fix-styles';
    style.textContent = `
      /* 强制约束音乐触发按钮的物理尺寸，防止其被 Flex 弹性拉伸 */
      #music-page-trigger-btn {
        flex: 0 0 38px !important;
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        max-width: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
        box-sizing: border-box !important;
        padding: 9px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-left: 8px !important;
      }
      
      /* 保护月相组件本身不被挤压变形 */
      #moon-phase, 
      .moon-phase, 
      [class*="moon-phase"] {
        flex-shrink: 0 !important;
        white-space: nowrap !important;
      }

      /* ================= 新增：悬浮面板内搜索框样式 ================= */
      .mp-search-container {
        padding: 10px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 185px;
        box-sizing: border-box;
      }
      
      .mp-search-box {
        display: flex;
        gap: 6px;
        width: 100%;
        box-sizing: border-box;
      }
      
      .mp-search-box input {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        color: #fff;
        padding: 5px 8px;
        font-size: 11px;
        outline: none;
        box-sizing: border-box;
      }
      
      .mp-search-box input:focus {
        border-color: rgba(255,255,255,0.3);
      }
      
      .mp-search-box button {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.12);
        color: #e0e0e0;
        padding: 5px 10px;
        font-size: 11px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        box-sizing: border-box;
        line-height: 1;
      }
      
      .mp-search-box button:hover {
        background: rgba(255,255,255,0.2);
        color: #fff;
      }
      
      .mp-search-results {
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        max-height: 125px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      
      /* 美化滚动条 */
      .mp-search-container::-webkit-scrollbar,
      .mp-search-results::-webkit-scrollbar,
      .mp-page-search-results::-webkit-scrollbar {
        width: 4px;
      }
      .mp-search-container::-webkit-scrollbar-thumb,
      .mp-search-results::-webkit-scrollbar-thumb,
      .mp-page-search-results::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 2px;
      }
      
      .mp-search-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        background: rgba(255,255,255,0.02);
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.2s;
        box-sizing: border-box;
      }
      
      .mp-search-item:hover {
        background: rgba(255,255,255,0.08);
      }
      
      .mp-search-item-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        margin-right: 8px;
        text-align: left;
      }
      
      .mp-search-item-title {
        color: #e0e0e0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
      }
      
      .mp-search-item-artist {
        color: rgba(255,255,255,0.4);
        font-size: 9px;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .mp-search-item-add {
        flex-shrink: 0;
        color: rgba(255,255,255,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .mp-search-item:hover .mp-search-item-add {
        color: #fff;
      }
      
      .mp-search-loading {
        text-align: center;
        padding: 12px;
        color: rgba(255,255,255,0.4);
        font-size: 11px;
      }
      
      .mp-search-empty {
        text-align: center;
        padding: 12px;
        color: rgba(255,255,255,0.3);
        font-size: 11px;
      }

      /* ================= 新增：歌单设置页面内的搜索模块样式 ================= */
      .mp-page-search-wrapper {
        margin: 15px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        box-sizing: border-box;
      }
      .mp-page-search-box {
        display: flex;
        gap: 8px;
      }
      .mp-page-search-box input {
        flex: 1;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: #fff;
        padding: 6px 10px;
        font-size: 13px;
        outline: none;
      }
      .mp-page-search-box button {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        padding: 6px 12px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .mp-page-search-box button:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .mp-page-search-results {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 200px;
        overflow-y: auto;
      }
      .mp-page-search-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 4px;
        font-size: 12px;
      }
      .mp-page-search-item-info {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
      }
      .mp-page-search-item-title {
        color: #fff;
      }
      .mp-page-search-item-artist {
        color: #888;
      }
      .mp-page-search-item-add-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #ccc;
        padding: 3px 8px;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
      }
      .mp-page-search-item-add-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  async loadConfigFromDB() {
    try {
      const savedConfig = await db.settings.get('music_player_config');
      if (savedConfig && savedConfig.value) {
        this.config = { ...this.config, ...savedConfig.value };
      }
      this.applyThemeToContainers(this.config.theme);
    } catch (e) {
      console.error("加载音乐播放器配置失败:", e);
    }
  }

  async saveConfigToDB() {
    try {
      await db.settings.put({
        key: 'music_player_config',
        value: this.config
      });
    } catch (e) {
      console.error("保存音乐播放器配置失败:", e);
    }
  }

  async loadSongsFromDB() {
    try {
      this.songs = await db.musicPlaylist.toArray();
      if (this.songs.length > 0 && this.currentIndex === -1) {
        this.currentIndex = 0;
        this.audio.src = this.songs[0].url;
      }
    } catch (e) {
      console.error("加载歌单失败:", e);
    }
  }

  renderDOM() {
    this.container = document.createElement('div');
    this.container.className = 'music-player-container';
    this.container.id = 'global-music-player';

    // 悬浮徽章 HTML
    const badgeClass = this.config.showFloatBadge ? '' : ' hidden-badge';
    const badgeHTML = `
      <div class="music-player-badge${badgeClass}" id="mp-badge" title="弦音留白">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
      </div>
    `;

    // 气泡 HTML
    const bubbleHTML = `
      <div class="music-player-bubble" id="mp-bubble">
        <button class="mp-bubble-close" id="mp-bubble-close">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="mp-bubble-author" id="mp-bubble-author">角色</div>
        <div class="mp-bubble-content" id="mp-bubble-content">共鸣内容</div>
      </div>
    `;

    // 播放面板 HTML
    const panelHTML = `
      <div class="music-player-panel" id="mp-panel">
        <div class="mp-panel-decor">
          <span class="mp-decor-text" id="mp-panel-decor-text">MIDNIGHT LAMENT</span>
        </div>
        <div class="mp-panel-header">
          <div class="mp-album-cover" id="mp-cover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="mp-song-info">
            <div class="mp-song-title" id="mp-song-title">未加载音乐</div>
            <div class="mp-song-status" id="mp-song-status">弦音静止</div>
          </div>
          <div class="mp-header-actions" style="display: flex; gap: 6px; align-items: center;">
            <button class="mp-icon-btn" id="mp-search-toggle-btn" title="搜索音乐">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <button class="mp-icon-btn" id="mp-setting-btn" title="偏好设置">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 悬浮面板的搜索 UI (默认折叠) -->
        <div class="mp-search-container" id="mp-search-container" style="display: none;">
          <div class="mp-search-box">
            <input type="text" id="mp-search-input" placeholder="输入歌名/歌手...">
            <button id="mp-search-submit-btn">搜索</button>
          </div>
          <div class="mp-search-results" id="mp-search-results"></div>
        </div>

        <div class="mp-progress-container">
          <span class="mp-time-label" id="mp-time-current">00:00</span>
          <div class="mp-progress-bar-wrap" id="mp-progress-wrap">
            <div class="mp-progress-bar-fill" id="mp-progress-fill"></div>
          </div>
          <span class="mp-time-label right" id="mp-time-duration">00:00</span>
        </div>

        <div class="mp-controls">
          <button class="mp-icon-btn" id="mp-prev-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="19 20 9 12 19 4 19 20"/>
              <line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>
          <button class="mp-btn-main" id="mp-play-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" id="mp-play-svg">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
            </svg>
          </button>
          <button class="mp-icon-btn" id="mp-next-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = badgeHTML + bubbleHTML + panelHTML;
    document.body.appendChild(this.container);

    // 获取 DOM 元素
    this.badge = this.container.querySelector('#mp-badge');
    this.panel = this.container.querySelector('#mp-panel');
    this.bubble = this.container.querySelector('#mp-bubble');
    this.bubbleClose = this.container.querySelector('#mp-bubble-close');
    this.bubbleAuthor = this.container.querySelector('#mp-bubble-author');
    this.bubbleContent = this.container.querySelector('#mp-bubble-content');
    
    this.playBtn = this.container.querySelector('#mp-play-btn');
    this.playSvg = this.container.querySelector('#mp-play-svg');
    this.prevBtn = this.container.querySelector('#mp-prev-btn');
    this.nextBtn = this.container.querySelector('#mp-next-btn');
    this.settingBtn = this.container.querySelector('#mp-setting-btn');

    // 绑定悬浮窗搜索 DOM
    this.searchToggleBtn = this.container.querySelector('#mp-search-toggle-btn');
    this.searchContainer = this.container.querySelector('#mp-search-container');
    this.searchInput = this.container.querySelector('#mp-search-input');
    this.searchSubmitBtn = this.container.querySelector('#mp-search-submit-btn');
    this.searchResults = this.container.querySelector('#mp-search-results');
    
    this.songTitle = this.container.querySelector('#mp-song-title');
    this.songStatus = this.container.querySelector('#mp-song-status');
    this.coverContainer = this.container.querySelector('#mp-cover');
    this.decorText = this.container.querySelector('#mp-panel-decor-text');
    
    this.progressWrap = this.container.querySelector('#mp-progress-wrap');
    this.progressFill = this.container.querySelector('#mp-progress-fill');
    this.timeCurrent = this.container.querySelector('#mp-time-current');
    this.timeDuration = this.container.querySelector('#mp-time-duration');

    this.applyThemeToContainers(this.config.theme);
    this.applyBadgeVisibility();
    this.bindDomInteractions();
    this.updatePanelDisplay();
    this.updateUserCover();
  }

  // 渲染头像为专辑封面
  async updateUserCover() {
    try {
      const user = await db.user.toCollection().first();
      if (user && user.avatar) {
        this.coverContainer.innerHTML = `<img src="${user.avatar}" alt="Cover">`;
      }
    } catch (e) {
      console.error("加载专辑占位符头像故障:", e);
    }
  }

  bindDomInteractions() {
    // 悬浮徽章切换面板
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = this.panel.classList.contains('expanded');
      if (isExpanded) {
        this.panel.classList.remove('expanded');
      } else {
        this.panel.classList.add('expanded');
      }
    });

    // 空白点击收回面板
    document.addEventListener('click', () => {
      this.panel.classList.remove('expanded');
    });

    this.panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.playPrev());
    this.nextBtn.addEventListener('click', () => this.playNext());
    
    this.settingBtn.addEventListener('click', () => {
      this.panel.classList.remove('expanded');
      this.playlistPage.show();
    });

    this.bubbleClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideBubble();
    });

    this.progressWrap.addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = this.progressWrap.getBoundingClientRect();
      const clickPercent = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = clickPercent * this.audio.duration;
    });

    // 悬浮面板的搜索事件绑定
    this.searchToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isSearchVisible = this.searchContainer.style.display !== 'none';
      if (isSearchVisible) {
        this.searchContainer.style.display = 'none';
      } else {
        this.searchContainer.style.display = 'flex';
        this.searchInput.focus();
      }
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        this.handleSearch();
      }
    });

    this.searchContainer.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止点击搜索输入框引起控制面板收回
    });

    this.searchSubmitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSearch();
    });
  }

  // 跨域请求辅助函数：使用 allorigins 公共跨域代理获取数据
  async fetchWithCorsProxy(url) {
    // 包装为跨域代理 URL，绕过浏览器的同源 CORS 限制
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("跨域代理服务请求异常");
    const container = await response.json();
    // allorigins 会把源内容放在 contents 字段中
    return JSON.parse(container.contents);
  }

  // 在设置/歌单管理页面中动态注入搜索模块
  injectSearchIntoPlaylistPage() {
    if (!this.playlistPage || !this.playlistPage.overlay) return;
    
    // 避免重复创建搜索区域
    if (this.playlistPage.overlay.querySelector('.mp-page-search-wrapper')) return;

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'mp-page-search-wrapper';
    searchWrapper.innerHTML = `
      <div class="mp-page-search-box">
        <input type="text" id="mp-page-search-input" placeholder="输入歌名/歌手搜索网络音乐...">
        <button id="mp-page-search-btn">搜索音乐</button>
      </div>
      <div class="mp-page-search-results" id="mp-page-search-results"></div>
    `;

    // 挂载在歌单列表的顶部上方
    const songListContainer = this.playlistPage.overlay.querySelector('.song-list, .playlist-list, [class*="list"]') 
      || this.playlistPage.overlay.querySelector('.mp-page-body, [class*="body"]')
      || this.playlistPage.overlay.firstElementChild;

    if (songListContainer) {
      songListContainer.parentNode.insertBefore(searchWrapper, songListContainer);
    } else {
      this.playlistPage.overlay.appendChild(searchWrapper);
    }

    const input = searchWrapper.querySelector('#mp-page-search-input');
    const btn = searchWrapper.querySelector('#mp-page-search-btn');
    const resultsContainer = searchWrapper.querySelector('#mp-page-search-results');

    const handlePageSearch = async () => {
      const query = input.value.trim();
      if (!query) return;
      resultsContainer.innerHTML = '<div class="mp-search-loading">弦音寻觅中...</div>';
      
      try {
        // 使用跨域代理调用 Meting API
        const targetUrl = `https://api.injahow.cn/meting/?type=search&keywords=${encodeURIComponent(query)}`;
        const data = await this.fetchWithCorsProxy(targetUrl);
        if (!Array.isArray(data) || data.length === 0) throw new Error("No Results");
        
        this.renderPlaylistPageSearchResults(data, resultsContainer);
      } catch (e) {
        console.warn("主搜索代理失败，尝试备选源...", e);
        try {
          // 备用：通过跨域代理请求公共网易云镜像接口
          const targetUrl = `https://autumnfish.cn/search?keywords=${encodeURIComponent(query)}`;
          const backupData = await this.fetchWithCorsProxy(targetUrl);
          const songs = backupData.result?.songs;
          if (!songs || songs.length === 0) {
            resultsContainer.innerHTML = '<div class="mp-search-empty">未找到该歌曲</div>';
            return;
          }
          const formatted = songs.slice(0, 10).map(s => ({
            id: s.id,
            name: s.name,
            artist: s.artists ? s.artists.map(a => a.name) : ["未知歌手"],
            url: `https://music.163.com/song/media/outer/url?id=${s.id}.mp3`
          }));
          this.renderPlaylistPageSearchResults(formatted, resultsContainer);
        } catch (err) {
          // 终极备用方案：免代理免跨域的国产公共免签 API
          try {
            const directUrl = `https://api.lolimi.cn/API/wysearch/?word=${encodeURIComponent(query)}`;
            const resp = await fetch(directUrl);
            const resData = await resp.json();
            if (resData.code === 200 && Array.isArray(resData.data)) {
              const formatted = resData.data.slice(0, 10).map(s => ({
                id: s.id,
                name: s.songs,
                artist: [s.singers],
                url: s.url || `https://music.163.com/song/media/outer/url?id=${s.id}.mp3`
              }));
              this.renderPlaylistPageSearchResults(formatted, resultsContainer);
              return;
            }
          } catch(err2) {}
          resultsContainer.innerHTML = '<div class="mp-search-empty">寻音受阻，所有 API 请求均被跨域拦截，请检查网络</div>';
        }
      }
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePageSearch();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        handlePageSearch();
      }
    });
    searchWrapper.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 渲染设置页面内的搜索列表
  renderPlaylistPageSearchResults(songs, container) {
    container.innerHTML = '';
    songs.slice(0, 10).forEach(song => {
      const item = document.createElement('div');
      item.className = 'mp-page-search-item';
      
      const artist = Array.isArray(song.artist) ? song.artist.join('/') : (song.artist || '未知歌手');
      
      item.innerHTML = `
        <div class="mp-page-search-item-info">
          <span class="mp-page-search-item-title">${song.name}</span>
          <span class="mp-page-search-item-artist"> - ${artist}</span>
        </div>
        <button class="mp-page-search-item-add-btn">添加</button>
      `;
      
      item.querySelector('.mp-page-search-item-add-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.textContent = '添加中...';
        btn.disabled = true;
        
        await this.addSongToPlaylist(song);
        
        btn.textContent = '已添加';
        
        if (this.playlistPage) {
          if (typeof this.playlistPage.loadSongs === 'function') this.playlistPage.loadSongs();
          else if (typeof this.playlistPage.loadSongsFromDB === 'function') this.playlistPage.loadSongsFromDB();
          else if (typeof this.playlistPage.render === 'function') this.playlistPage.render();
          else if (typeof this.playlistPage.renderList === 'function') this.playlistPage.renderList();
          else if (typeof this.playlistPage.init === 'function') this.playlistPage.init();
        }
      });
      
      container.appendChild(item);
    });
  }

  // 处理悬浮面板的搜索功能
  async handleSearch() {
    const query = this.searchInput.value.trim();
    if (!query) return;

    this.searchResults.innerHTML = '<div class="mp-search-loading">弦音寻觅中...</div>';

    try {
      // 优先通过跨域代理访问 Meting API
      const targetUrl = `https://api.injahow.cn/meting/?type=search&keywords=${encodeURIComponent(query)}`;
      const data = await this.fetchWithCorsProxy(targetUrl);
      if (!Array.isArray(data) || data.length === 0) throw new Error("No results");
      
      this.renderSearchResults(data);
    } catch (e) {
      console.warn("悬浮面板主搜索代理异常，启用备用源...", e);
      try {
        const targetUrl = `https://autumnfish.cn/search?keywords=${encodeURIComponent(query)}`;
        const backupData = await this.fetchWithCorsProxy(targetUrl);
        const songs = backupData.result?.songs;
        if (!songs || songs.length === 0) {
          this.searchResults.innerHTML = '<div class="mp-search-empty">未寻得此曲</div>';
          return;
        }

        const formattedData = songs.slice(0, 12).map(song => ({
          id: song.id,
          name: song.name,
          artist: song.artists ? song.artists.map(a => a.name) : ["未知歌手"],
          url: `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`
        }));
        this.renderSearchResults(formattedData);
      } catch (err) {
        // 终极备用方案：免代理免跨域的国产公共免签 API
        try {
          const directUrl = `https://api.lolimi.cn/API/wysearch/?word=${encodeURIComponent(query)}`;
          const resp = await fetch(directUrl);
          const resData = await resp.json();
          if (resData.code === 200 && Array.isArray(resData.data)) {
            const formatted = resData.data.slice(0, 12).map(s => ({
              id: s.id,
              name: s.songs,
              artist: [s.singers],
              url: s.url || `https://music.163.com/song/media/outer/url?id=${s.id}.mp3`
            }));
            this.renderSearchResults(formatted);
            return;
          }
        } catch(err2) {}
        this.searchResults.innerHTML = `<div class="mp-search-empty">寻音受阻: 请求均被跨域拦截</div>`;
      }
    }
  }

  // 渲染悬浮面板的搜索列表
  renderSearchResults(songs) {
    this.searchResults.innerHTML = '';
    
    songs.slice(0, 12).forEach(song => {
      const item = document.createElement('div');
      item.className = 'mp-search-item';
      
      const artistName = Array.isArray(song.artist) ? song.artist.join('/') : (song.artist || '未知歌手');
      
      item.innerHTML = `
        <div class="mp-search-item-info">
          <div class="mp-search-item-title">${song.name}</div>
          <div class="mp-search-item-artist">${artistName}</div>
        </div>
        <div class="mp-search-item-add" title="添加并共鸣">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      `;
      
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.addSongToPlaylist(song);
      });
      
      this.searchResults.appendChild(item);
    });
  }

  // 通用将单曲存入 IndexedDB 播放列表的逻辑
  async addSongToPlaylist(songData) {
    const artistName = Array.isArray(songData.artist) ? songData.artist.join('/') : (songData.artist || '未知歌手');
    const songName = `${songData.name} - ${artistName}`;
    const playUrl = songData.url || `https://music.163.com/song/media/outer/url?id=${songData.id}.mp3`;

    // 查重：若列表存在这首歌，则直接切到那首歌播放即可
    const existsIdx = this.songs.findIndex(s => s.url === playUrl || s.name === songName);
    if (existsIdx !== -1) {
      this.isPlaying = true;
      await this.selectSong(existsIdx);
      if (this.audio.paused) {
        this.audio.play().catch(err => console.log("播放被浏览器拦截:", err));
      }
      return;
    }

    try {
      const newSong = {
        name: songName,
        url: playUrl
      };
      // 写入 IndexedDB
      await db.musicPlaylist.add(newSong);
      
      // 更新状态列表并取得最新数据
      await this.loadSongsFromDB();
      
      // 自动播放最新加入的这一首歌曲
      const newIndex = this.songs.length - 1;
      if (newIndex >= 0) {
        this.isPlaying = true;
        await this.selectSong(newIndex);
        if (this.audio.paused) {
          this.audio.play().catch(err => console.log("播放被浏览器拦截:", err));
        }
      }
    } catch (e) {
      console.error("写入数据库失败:", e);
    }
  }

  bindAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      this.updateProgress();
      this.checkRoleAutoSwitch();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.timeDuration.textContent = this.formatTime(this.audio.duration);
    });

    this.audio.addEventListener('ended', () => {
      this.playNext();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayBtnVisual(true);
      this.songStatus.textContent = "正在共鸣";
      this.badge.classList.add('playing');
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayBtnVisual(false);
      this.songStatus.textContent = "弦音静止";
    });
  }

  bindGlobalEvents() {
    window.addEventListener('open-music-page', () => {
      this.playlistPage.show();
    });

    window.addEventListener('user-avatar-updated', () => {
      this.updateUserCover();
    });
  }

  // 轮询并在星轨/月相图标右侧并排挂载“音乐符号触发器”
  startAlignWithMoonIcon() {
    const alignTimer = setInterval(() => {
      const moonElement = document.querySelector('#moon-phase, .moon-phase, [class*="moon"], [id*="moon"]') ||
        Array.from(document.querySelectorAll('button, a, div, span')).find(el => el.textContent.includes('月相'));

      if (moonElement) {
        // 双重保险：强制防止月相组件在真机布局下因空间挤压而垂直换行
        moonElement.style.flexShrink = '0';
        moonElement.style.whiteSpace = 'nowrap';

        if (!document.querySelector('#music-page-trigger-btn')) {
          const musicPageBtn = document.createElement(moonElement.tagName.toLowerCase() === 'button' ? 'button' : 'div');
          musicPageBtn.id = 'music-page-trigger-btn';
          musicPageBtn.className = moonElement.className + ' music-page-trigger-btn';
          if (musicPageBtn.tagName.toLowerCase() === 'button') {
            musicPageBtn.type = 'button';
          }

          // 音乐触发小按钮 (极细笔触)
          musicPageBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          `;
          musicPageBtn.title = "弦音留白";
          
          musicPageBtn.onclick = (e) => {
            e.stopPropagation();
            this.playlistPage.show(); // 点击主界面按钮，可以直接呼出设置子页面
          };
          
          moonElement.parentNode.insertBefore(musicPageBtn, moonElement.nextSibling);
          clearInterval(alignTimer);
        }
      }
    }, 800);

    setTimeout(() => clearInterval(alignTimer), 15000);
  }

  togglePlay() {
    if (this.songs.length === 0) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(e => console.log("播放被浏览器拦截，需用户手动交互激活:", e));
    }
  }

  async selectSong(index) {
    if (index < 0 || index >= this.songs.length) return;
    this.currentIndex = index;
    this.hasTriggeredAutoSwitchThisSong = false;
    
    const song = this.songs[index];
    this.audio.src = song.url;
    this.updatePanelDisplay();
    
    if (this.isPlaying) {
      try {
        await this.audio.play();
      } catch (e) {
        console.log("媒体切换受阻:", e);
      }
    }
    
    this.triggerReactionBubble(false);
  }

  playPrev() {
    if (this.songs.length === 0) return;
    let nextIdx = this.currentIndex - 1;
    if (nextIdx < 0) nextIdx = this.songs.length - 1;
    this.selectSong(nextIdx);
  }

  playNext() {
    if (this.songs.length === 0) return;
    let nextIdx = this.currentIndex + 1;
    if (nextIdx >= this.songs.length) nextIdx = 0;
    this.selectSong(nextIdx);
  }

  updatePanelDisplay() {
    if (this.currentIndex >= 0 && this.currentIndex < this.songs.length) {
      const song = this.songs[this.currentIndex];
      this.songTitle.textContent = song.name;
    } else {
      this.songTitle.textContent = "无音乐";
      this.songStatus.textContent = "弦音静止";
    }
  }

  updatePlayBtnVisual(playing) {
    if (playing) {
      this.playSvg.innerHTML = `
        <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
        <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
      `;
    } else {
      this.playSvg.innerHTML = `
        <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
      `;
    }
  }

  updateProgress() {
    if (!this.audio.duration) return;
    const progress = this.audio.currentTime / this.audio.duration;
    this.progressFill.style.width = `${progress * 100}%`;
    this.timeCurrent.textContent = this.formatTime(this.audio.currentTime);
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 判定并触发角色主动切歌 (5% 概率)
  async checkRoleAutoSwitch() {
    if (!this.config.bindCharacterId || !this.config.roleAutoSwitch || this.hasTriggeredAutoSwitchThisSong) {
      return;
    }

    if (this.audio.currentTime > 12) {
      this.hasTriggeredAutoSwitchThisSong = true; 

      const randomVal = Math.random();
      if (randomVal < 0.05) {
        const char = await db.characters.get(Number(this.config.bindCharacterId));
        if (!char) return;

        const switchReasons = [
          "这首歌的频率太快了，我换一首了。",
          "节奏有点沉重，我想听点别的。",
          "换个心情吧，这首曲子太容易让人陷进回忆里。",
          "突然想听下一首了，你应该不会介意吧？",
          "让旋律流动得快一点吧。"
        ];
        const text = switchReasons[Math.floor(Math.random() * switchReasons.length)];
        
        this.showBubble(char.name, text);
        
        setTimeout(() => {
          this.playNext();
        }, 2000);
      }
    }
  }

  // 触发共鸣随机字卡低语气泡
  async triggerReactionBubble(isAutoSwitchEvent = false) {
    if (isAutoSwitchEvent || this.config.silentListening || !this.config.bindCharacterId) {
      return; 
    }

    if (Math.random() > 0.3) return;

    try {
      const char = await db.characters.get(Number(this.config.bindCharacterId));
      if (!char) return;

      const musicDeck = await db.decks.filter(d => d.category === '音乐').first();
      if (!musicDeck || !musicDeck.fragments || musicDeck.fragments.length === 0) return;

      const randomFragment = musicDeck.fragments[Math.floor(Math.random() * musicDeck.fragments.length)];
      this.showBubble(char.name, randomFragment);
    } catch (e) {
      console.error("生成共鸣评价失败:", e);
    }
  }

  showBubble(author, content) {
    this.bubbleAuthor.textContent = author;
    this.bubbleContent.textContent = content;
    this.bubble.classList.add('show');

    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => this.hideBubble(), 4000);
  }

  hideBubble() {
    this.bubble.classList.remove('show');
    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  // 控制悬浮徽章的显示/隐藏隐藏
  applyBadgeVisibility() {
    if (this.badge) {
      if (this.config.showFloatBadge) {
        this.badge.classList.remove('hidden-badge');
      } else {
        this.badge.classList.add('hidden-badge');
      }
    }
  }

  applyThemeToContainers(themeKey) {
    this.config.theme = themeKey;
    
    if (this.container) {
      this.container.setAttribute('data-player-theme', themeKey);
    }
    if (this.playlistPage && this.playlistPage.overlay) {
      this.playlistPage.overlay.setAttribute('data-player-theme', themeKey);
    }

    const decorMap = {
      midnight: "MIDNIGHT LAMENT // 星河微冷",
      foggy: "MISTY VOID // 浮生如梦",
      deepsea: "DEEP ABYSS // 鱼沉雁杳",
      snow: "COLD CRYSTAL // 独钓寒江"
    };

    if (this.decorText) {
      this.decorText.textContent = decorMap[themeKey] || decorMap.midnight;
    }

    const pageDecor = document.querySelector('#mp-decor-text');
    if (pageDecor) {
      pageDecor.textContent = decorMap[themeKey] || decorMap.midnight;
    }
  }
}

export const playerInstance = new MusicPlayer();



