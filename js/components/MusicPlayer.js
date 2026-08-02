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
      silentListening: false,     // 是否静默聆听（屏蔽评价气泡）
      roleAutoSwitch: true,       // 允许角色自主切歌
      rotateRecord: true,         // 黑胶旋转动画
      bindCharacterId: null       // 当前绑定关联的角色 ID
    };

    // 随机切歌防抖与状态锁
    this.hasTriggeredAutoSwitchThisSong = false;

    this.init();
  }

  async init() {
    // 1. 初始化数据库配置与歌单列表
    await this.loadConfigFromDB();
    await this.loadSongsFromDB();

    // 2. 挂载弹窗组件到 body
    this.playlistModal = new MusicPlaylistModal(this);

    // 3. 构建并渲染播放器 DOM
    this.renderDOM();
    
    // 4. 绑定音频核心事件
    this.bindAudioEvents();

    // 5. 绑定全局指令事件
    this.bindGlobalEvents();

    // 6. 开启定时寻找星图按钮挂载点
    this.startSearchStarMapButton();
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
    // 创建播放器容器
    this.container = document.createElement('div');
    this.container.className = 'music-player-container';
    this.container.id = 'global-music-player';

    // 悬浮徽章 HTML
    const badgeHTML = `
      <div class="music-player-badge" id="mp-badge" title="播放器">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
      </div>
    `;

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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
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
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
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
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="19 20 9 12 19 4 19 20"/>
              <line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>
          <button class="mp-btn-main" id="mp-play-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" id="mp-play-svg">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
            </svg>
          </button>
          <button class="mp-icon-btn" id="mp-next-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = badgeHTML + bubbleHTML + panelHTML;
    document.body.appendChild(this.container);

    // 缓存 DOM 节点引用
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
    
    this.progressWrap = this.container.querySelector('#mp-progress-wrap');
    this.progressFill = this.container.querySelector('#mp-progress-fill');
    this.timeCurrent = this.container.querySelector('#mp-time-current');
    this.timeDuration = this.container.querySelector('#mp-time-duration');

    // 绑定交互控制
    this.bindDomInteractions();
    this.updatePanelDisplay();
    this.updateUserCover();
  }

  // 获取并更新头像
  async updateUserCover() {
    try {
      const user = await db.user.toCollection().first();
      if (user && user.avatar) {
        this.coverContainer.innerHTML = `<img src="${user.avatar}" alt="Cover">`;
      }
    } catch (e) {
      console.error("更新用户头像占位失败:", e);
    }
  }

  bindDomInteractions() {
    // 点击悬浮球展开/收起面板
    this.badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = this.panel.classList.contains('expanded');
      if (isExpanded) {
        this.panel.classList.remove('expanded');
      } else {
        this.panel.classList.add('expanded');
      }
    });

    // 点击页面其他位置，收起面板
    document.addEventListener('click', () => {
      this.panel.classList.remove('expanded');
    });

    // 阻止面板内的点击事件冒泡到 document
    this.panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 播放/暂停控制
    this.playBtn.addEventListener('click', () => {
      this.togglePlay();
    });

    // 上下曲控制
    this.prevBtn.addEventListener('click', () => {
      this.playPrev();
    });
    this.nextBtn.addEventListener('click', () => {
      this.playNext();
    });

    // 打开配置弹窗
    this.settingBtn.addEventListener('click', () => {
      this.playlistModal.show();
    });

    // 手动关闭角色气泡
    this.bubbleClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideBubble();
    });

    // 拖动进度条逻辑
    this.progressWrap.addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = this.progressWrap.getBoundingClientRect();
      const clickPercent = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = clickPercent * this.audio.duration;
    });
  }

  bindAudioEvents() {
    // 监听时间更新
    this.audio.addEventListener('timeupdate', () => {
      this.updateProgress();
      this.checkRoleAutoSwitch();
    });

    // 加载完成获取时长
    this.audio.addEventListener('loadedmetadata', () => {
      this.timeDuration.textContent = this.formatTime(this.audio.duration);
    });

    // 播放结束自动下一首
    this.audio.addEventListener('ended', () => {
      this.playNext();
    });

    // 处理播放与暂停的视觉反馈
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayBtnVisual(true);
      this.songStatus.textContent = "播放中";
      
      // 更新悬浮球动画控制
      this.badge.classList.add('playing');
      if (this.config.rotateRecord) {
        this.badge.classList.remove('paused-rotate');
      } else {
        this.badge.classList.add('paused-rotate');
      }
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayBtnVisual(false);
      this.songStatus.textContent = "已暂停";
      this.badge.classList.add('paused-rotate');
    });
  }

  bindGlobalEvents() {
    // 允许配置面板切换时实时同步播放器状态
    window.addEventListener('open-music-modal', () => {
      this.playlistModal.show();
    });

    // 监听用户头像发生改变时，同步更新专辑封面
    window.addEventListener('user-avatar-updated', () => {
      this.updateUserCover();
    });
  }

  // 定时轮询，动态寻找星图按钮并在其侧面挂载设置入口
  startSearchStarMapButton() {
    const searchTimer = setInterval(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div, span, .footer-tab, .nav-item'));
      // 基于类名、ID、文本内容模糊识别
      const starMapBtn = buttons.find(el => 
        el.id?.includes('star') || 
        el.id?.includes('divination') ||
        el.className?.includes('star') || 
        el.className?.includes('divination') ||
        el.textContent?.includes('星图') ||
        el.textContent?.includes('占卜')
      );

      if (starMapBtn) {
        // 确认没有重复挂载
        if (!document.querySelector('#music-quick-settings-btn')) {
          const quickBtn = document.createElement('button');
          quickBtn.id = 'music-quick-settings-btn';
          quickBtn.className = 'music-quick-settings-btn';
          quickBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9 18V5l12-2v13M9 9l12-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            </svg>
          `;
          quickBtn.title = "音乐设置";
          quickBtn.onclick = (e) => {
            e.stopPropagation();
            this.playlistModal.show();
          };
          
          // 插入到星图/占卜按钮紧随的下一个兄弟节点
          starMapBtn.parentNode.insertBefore(quickBtn, starMapBtn.nextSibling);
          clearInterval(searchTimer);
        }
      }
    }, 1000);

    // 15 秒后主动停止搜寻，防止后台长期死循环占用开销
    setTimeout(() => clearInterval(searchTimer), 15000);
  }

  // 播放与暂停切换
  togglePlay() {
    if (this.songs.length === 0) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(e => console.log("播放被浏览器安全策略阻止，需用户交互激活:", e));
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
        console.log("切歌播放受阻:", e);
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
      // 切换为暂停图标
      this.playSvg.innerHTML = `
        <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
        <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
      `;
    } else {
      // 切换为播放图标
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

  // 监听音乐进度，判定角色是否有概率发起自主切歌
  async checkRoleAutoSwitch() {
    // 只有绑定了角色、开启了自主切歌、且当前曲目播放了12秒以上、且单曲内未尝试判定时，才启动计算
    if (!this.config.bindCharacterId || !this.config.roleAutoSwitch || this.hasTriggeredAutoSwitchThisSong) {
      return;
    }

    if (this.audio.currentTime > 12) {
      this.hasTriggeredAutoSwitchThisSong = true; // 确保一首歌只触发一次计算

      // 5% 概率执行自主切歌
      const randomValue = Math.random();
      if (randomValue < 0.05) {
        // 查找角色名
        const char = await db.characters.get(Number(this.config.bindCharacterId));
        if (!char) return;

        // 挑选切歌理由
        const switchReasons = [
          "这首歌的频率太重了，我换一首了。",
          "节奏有点沉重，我想听点别的。",
          "换个心情吧，这首曲子太容易让人陷进回忆里。",
          "突然想听下一首了，你应该不会介意吧？",
          "让旋律流动得快一点吧。"
        ];
        const text = switchReasons[Math.floor(Math.random() * switchReasons.length)];
        
        // 气泡警告并自动播放下一首
        this.showBubble(char.name, text);
        
        setTimeout(() => {
          this.playNext();
        }, 2000);
      }
    }
  }

  // 切歌或播新曲时触发对歌曲的灵性反馈
  async triggerReactionBubble(isAutoSwitchEvent = false) {
    if (isAutoSwitchEvent) return; // 自主切歌已自带文字气泡，忽略此触发
    if (this.config.silentListening) return; // 全局静默状态不触发
    if (!this.config.bindCharacterId) return; // 未绑定特定角色不触发

    // 触发评价概率：约 30%
    if (Math.random() > 0.3) return;

    try {
      const char = await db.characters.get(Number(this.config.bindCharacterId));
      if (!char) return;

      // 从专属字卡表 "category: 音乐" 中读取候选文本
      const musicDeck = await db.decks.where({ category: '音乐' }).first();
      if (!musicDeck || !musicDeck.fragments || musicDeck.fragments.length === 0) return;

      const randomFragment = musicDeck.fragments[Math.floor(Math.random() * musicDeck.fragments.length)];
      
      this.showBubble(char.name, randomFragment);
    } catch (e) {
      console.error("生成角色气泡评价失败:", e);
    }
  }

  showBubble(author, content) {
    // 渲染文字
    this.bubbleAuthor.textContent = author;
    this.bubbleContent.textContent = content;
    
    this.bubble.classList.add('show');

    // 清理之前的超时关闭定时器
    if (this.bubbleTimer) {
      clearTimeout(this.bubbleTimer);
    }

    // 默认 4 秒后自动淡出消失
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
    
    // 更新悬浮球动画激活状态
    if (this.isPlaying) {
      if (this.config.rotateRecord) {
        this.badge.classList.remove('paused-rotate');
      } else {
        this.badge.classList.add('paused-rotate');
      }
    }
  }
}

// 自动实例化，确保模块导入时就自动常驻于应用底部
export const playerInstance = new MusicPlayer();
