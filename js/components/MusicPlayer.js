import { db } from '../db.js';
import { MusicPlaylistModal } from './MusicPlaylistModal.js';

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.songs = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    
    // 默认配置
    this.config = {
      theme: 'midnight',
      silentListening: false,     // 是否静默聆听
      roleAutoSwitch: true,       // 允许角色自主切歌
      rotateRecord: true,         // 黑胶旋转动画
      bindCharacterId: null       // 当前绑定关联的角色 ID
    };

    // 随机切歌防抖
    this.hasTriggeredAutoSwitchThisSong = false;
    this.musicTrigger = null;

    this.init();
  }

  async init() {
    // 1. 初始化数据库配置与歌单列表
    await this.loadConfigFromDB();
    await this.loadSongsFromDB();

    // 2. 挂载弹窗组件
    this.playlistModal = new MusicPlaylistModal(this);

    // 3. 构建并渲染播放器面板
    this.renderDOM();
    
    // 4. 绑定音频核心事件
    this.bindAudioEvents();

    // 5. 绑定全局指令事件
    this.bindGlobalEvents();

    // 6. 开启定时寻找月相与星图按钮并自动挂载
    this.setupTriggerButton();
  }

  async loadConfigFromDB() {
    try {
      const savedConfig = await db.settings.get('music_player_config');
      if (savedConfig && savedConfig.value) {
        this.config = { ...this.config, ...savedConfig.value };
      }
      // 更新全局样式的主题变量
      document.body.setAttribute('data-player-theme', this.config.theme);
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
      console.error("加载歌单数据失败:", e);
    }
  }

  renderDOM() {
    // 创建播放器外部总控容器
    this.container = document.createElement('div');
    this.container.className = 'music-player-container';
    this.container.id = 'global-music-player';

    // 气泡评价 HTML
    const bubbleHTML = `
      <div class="music-player-bubble" id="mp-bubble">
        <button class="mp-bubble-close" id="mp-bubble-close">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="mp-bubble-author" id="mp-bubble-author">角色</div>
        <div class="mp-bubble-content" id="mp-bubble-content">评价内容</div>
      </div>
    `;

    // 播放面板 HTML
    const panelHTML = `
      <div class="music-player-panel" id="mp-panel">
        <div class="mp-panel-header">
          <div class="mp-album-cover" id="mp-cover">
            <!-- 默认使用几何线条 SVG 占位图 -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 12h18M12 3v18"/>
            </svg>
          </div>
          <div class="mp-song-info">
            <div class="mp-song-title" id="mp-song-title">未加载音乐</div>
            <div class="mp-song-status" id="mp-song-status">已停止</div>
          </div>
          <div class="mp-header-actions">
            <button class="mp-icon-btn" id="mp-setting-btn" title="配置">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
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
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="19 20 9 12 19 4 19 20"/>
              <line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>
          <button class="mp-btn-main" id="mp-play-btn">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" id="mp-play-svg">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
            </svg>
          </button>
          <button class="mp-icon-btn" id="mp-next-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = bubbleHTML + panelHTML;
    document.body.appendChild(this.container);

    // 缓存 DOM 指针引用
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
    
    this.songTitle = this.container.querySelector('#mp-song-title');
    this.songStatus = this.container.querySelector('#mp-song-status');
    this.coverContainer = this.container.querySelector('#mp-cover');
    
    this.progressWrap = this.container.querySelector('#mp-progress-wrap');
    this.progressFill = this.container.querySelector('#mp-progress-fill');
    this.timeCurrent = this.container.querySelector('#mp-time-current');
    this.timeDuration = this.container.querySelector('#mp-time-duration');

    this.bindDomInteractions();
    this.updatePanelDisplay();
    this.updateUserCover();
  }

  async updateUserCover() {
    try {
      const user = await db.user.toCollection().first();
      if (user && user.avatar) {
        this.coverContainer.innerHTML = `<img src="${user.avatar}" alt="Cover">`;
      }
    } catch (e) {
      console.error("更新头像占位出错:", e);
    }
  }

  bindDomInteractions() {
    // 点击外部自动隐藏面板
    document.addEventListener('click', () => {
      this.panel.classList.remove('expanded');
    });

    this.panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 播放/暂停
    this.playBtn.addEventListener('click', () => {
      this.togglePlay();
    });

    // 切歌
    this.prevBtn.addEventListener('click', () => {
      this.playPrev();
    });
    this.nextBtn.addEventListener('click', () => {
      this.playNext();
    });

    // 齿轮配置
    this.settingBtn.addEventListener('click', () => {
      this.playlistModal.show();
    });

    // 关闭气泡
    this.bubbleClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideBubble();
    });

    // 拖拽进度条
    this.progressWrap.addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = this.progressWrap.getBoundingClientRect();
      const clickPercent = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = clickPercent * this.audio.duration;
    });
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
      this.songStatus.textContent = "播放中";
      this.updateRecordAnimationState();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayBtnVisual(false);
      this.songStatus.textContent = "已暂停";
      this.updateRecordAnimationState();
    });
  }

  bindGlobalEvents() {
    window.addEventListener('open-music-modal', () => {
      this.playlistModal.show();
    });

    window.addEventListener('user-avatar-updated', () => {
      this.updateUserCover();
    });
  }

  // 定时器自动寻找底部的月相与星图按钮并并排挂载
  setupTriggerButton() {
    const locateInterval = setInterval(() => {
      // 1. 查找月相按钮并挂载唱片播放器触发按钮
      const moonBtn = this.findMoonButton();
      if (moonBtn && !document.querySelector('#music-nav-btn')) {
        this.createMusicButton(moonBtn);
      }

      // 2. 查找星图/占卜按钮并挂载微型设置按钮
      const starBtn = this.findStarBtn();
      if (starBtn && !document.querySelector('#music-star-btn')) {
        this.createQuickSettingsButton(starBtn);
      }
    }, 1000);

    // 15 秒后主动注销定时器以防长期轮询造成系统负荷
    setTimeout(() => clearInterval(locateInterval), 15000);
  }

  // 模糊匹配月相/手帐按钮
  findMoonButton() {
    const elements = Array.from(document.querySelectorAll('button, a, .footer-tab, .nav-item, [role="button"]'));
    return elements.find(el => {
      const text = el.textContent || '';
      const id = el.id || '';
      const className = typeof el.className === 'string' ? el.className : '';
      const matchText = /moon|phase|lunar|journal|diary|calendar|月相|手帐|手账|日记/.test(id + className + text);
      const matchSvg = el.querySelector('svg')?.innerHTML.toLowerCase().includes('moon') || false;
      return matchText || matchSvg;
    });
  }

  // 模糊匹配星图/占卜按钮
  findStarBtn() {
    const elements = Array.from(document.querySelectorAll('button, a, .footer-tab, .nav-item, [role="button"]'));
    return elements.find(el => {
      const text = el.textContent || '';
      const id = el.id || '';
      const className = typeof el.className === 'string' ? el.className : '';
      const matchText = /star|divin|map|astrol|星图|占卜|塔罗/.test(id + className + text);
      const matchSvg = el.querySelector('svg')?.innerHTML.toLowerCase().includes('star') || false;
      return matchText || matchSvg;
    });
  }

  // 创建并排的黑胶唱片按钮
  createMusicButton(moonBtn) {
    const musicBtn = moonBtn.cloneNode(true);
    musicBtn.id = 'music-nav-btn';
    musicBtn.classList.remove('active');
    
    const recordSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="music-record-svg" style="width: 1.5em; height: 1.5em; transition: transform 0.3s; display: block; margin: 0 auto;">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
      </svg>
    `;

    const svgEl = musicBtn.querySelector('svg');
    if (svgEl) {
      svgEl.outerHTML = recordSvg;
    } else {
      musicBtn.innerHTML = recordSvg;
    }

    musicBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePanel();
    });

    moonBtn.parentNode.insertBefore(musicBtn, moonBtn.nextSibling);
    this.musicTrigger = musicBtn;
    this.updateRecordAnimationState();
  }

  // 创建星图旁并排的快速设置按钮
  createQuickSettingsButton(starBtn) {
    const configBtn = starBtn.cloneNode(true);
    configBtn.id = 'music-star-btn';
    configBtn.classList.remove('active');

    const configSvg = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="width: 1.5em; height: 1.5em; display: block; margin: 0 auto;">
        <path d="M9 18V5l12-2v13M9 9l12-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
      </svg>
    `;

    const svgEl = configBtn.querySelector('svg');
    if (svgEl) {
      svgEl.outerHTML = configSvg;
    } else {
      configBtn.innerHTML = configSvg;
    }

    configBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.playlistModal.show();
    });

    starBtn.parentNode.insertBefore(configBtn, starBtn.nextSibling);
  }

  // 同步更新唱片图标的运动状态
  updateRecordAnimationState() {
    const recordSvg = document.querySelector('#music-nav-btn .music-record-svg');
    if (!recordSvg) return;

    if (this.isPlaying) {
      recordSvg.classList.add('playing');
      if (this.config.rotateRecord) {
        recordSvg.classList.remove('paused-rotate');
      } else {
        recordSvg.classList.add('paused-rotate');
      }
    } else {
      recordSvg.classList.remove('playing');
      recordSvg.classList.add('paused-rotate');
    }
  }

  togglePanel() {
    const isExpanded = this.panel.classList.contains('expanded');
    if (isExpanded) {
      this.panel.classList.remove('expanded');
    } else {
      this.panel.classList.add('expanded');
    }
  }

  togglePlay() {
    if (this.songs.length === 0) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(e => console.log("播放被浏览器拦截，需要用户手势激活:", e));
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
        console.log("音频播放出错:", e);
      }
    }
    
    // 触发评价气泡判定
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
      this.songStatus.textContent = "已停止";
    }
  }

  updatePlayBtnVisual(playing) {
    if (playing) {
      this.playSvg.innerHTML = `
        <rect x="6" y="4" width="3" height="16" fill="currentColor"/>
        <rect x="15" y="4" width="3" height="16" fill="currentColor"/>
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

  async checkRoleAutoSwitch() {
    if (!this.config.bindCharacterId || !this.config.roleAutoSwitch || this.hasTriggeredAutoSwitchThisSong) {
      return;
    }

    if (this.audio.currentTime > 12) {
      this.hasTriggeredAutoSwitchThisSong = true;

      const randomValue = Math.random();
      if (randomValue < 0.05) {
        const char = await db.characters.get(Number(this.config.bindCharacterId));
        if (!char) return;

        const switchReasons = [
          "这首歌的频率太重了，我换一首了。",
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

  async triggerReactionBubble(isAutoSwitchEvent = false) {
    if (isAutoSwitchEvent) return;
    if (this.config.silentListening) return;
    if (!this.config.bindCharacterId) return;

    if (Math.random() > 0.3) return;

    try {
      const char = await db.characters.get(Number(this.config.bindCharacterId));
      if (!char) return;

      // 使用 filter 进行二次安全过滤查询，杜绝 Schema 崩溃报错
      const musicDeck = await db.decks.filter(d => d.category === '音乐').first();
      if (!musicDeck || !musicDeck.fragments || musicDeck.fragments.length === 0) return;

      const randomFragment = musicDeck.fragments[Math.floor(Math.random() * musicDeck.fragments.length)];
      this.showBubble(char.name, randomFragment);
    } catch (e) {
      console.error("生成评价气泡失败:", e);
    }
  }

  showBubble(author, content) {
    this.bubbleAuthor.textContent = author;
    this.bubbleContent.textContent = content;
    this.bubble.classList.add('show');

    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
    }

    this.bubbleTimer = setTimeout(() => {
      this.hideBubble();
    }, 4000);
  }

  hideBubble() {
    this.bubble.classList.remove('show');
    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  applyTheme(themeKey) {
    this.config.theme = themeKey;
    document.body.setAttribute('data-player-theme', themeKey);
    this.saveConfigToDB();
    this.updateRecordAnimationState();
  }
}

export const playerInstance = new MusicPlayer();
