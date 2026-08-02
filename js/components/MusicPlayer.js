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

    // 3. 渲染小挂件 DOM
    this.renderDOM();
    
    // 4. 监听音频事件
    this.bindAudioEvents();

    // 5. 监听全局自定义事件
    this.bindGlobalEvents();

    // 6. 轮询对齐主界面上的月相图标
    this.startAlignWithMoonIcon();
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

    // 悬浮徽章 HTML (增加根据 config.showFloatBadge 控制初始类)
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
          <div class="mp-header-actions">
            <button class="mp-icon-btn" id="mp-setting-btn" title="偏好设置">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
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
