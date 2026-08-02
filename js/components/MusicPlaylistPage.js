import { db } from '../db.js';

export class MusicPlaylistPage {
  constructor(player) {
    this.player = player;
    this.activeTab = 0; // 0: 'list' (心事歌单) | 1: 'cards' (共鸣碎片) | 2: 'settings' (沉浸偏好)
    
    this.render();
    this.initEvents();
  }

  render() {
    // 构造透明磨砂全屏页面框架 (配色透出现有的全局样式)
    this.overlay = document.createElement('div');
    this.overlay.className = 'mp-page-overlay';
    this.overlay.id = 'mp-page-overlay';

    const pageHTML = `
      <div class="mp-page-container">
        <!-- 头部导航与诗意标题 -->
        <div class="mp-page-header">
          <button class="mp-page-back" id="mp-page-back" title="收起">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          
          <div class="mp-header-title-area">
            <h2 class="mp-page-title">弦音留白</h2>
            <span class="mp-decor-text" id="mp-decor-text">MIDNIGHT LAMENT</span>
          </div>

          <div style="width: 36px;"></div> <!-- 保持对称布局 -->
        </div>

        <!-- 重构后的星轨 / 时间轴 Tab 控制 -->
        <div class="timeline-nav" id="mp-timeline">
          <div class="timeline-track">
            <div class="timeline-progress" id="mp-timeline-progress"></div>
          </div>
          
          <div class="timeline-node active" data-index="0">
            <div class="node-dot"></div>
            <div class="node-label">心事歌单</div>
          </div>
          
          <div class="timeline-node" data-index="1">
            <div class="node-dot"></div>
            <div class="node-label">共鸣碎片</div>
          </div>
          
          <div class="timeline-node" data-index="2">
            <div class="node-index"></div>
            <div class="node-dot"></div>
            <div class="node-label">沉浸偏好</div>
          </div>
        </div>

        <!-- 视图容器 -->
        <div class="mp-page-body" id="mp-page-body-content">
          <!-- 歌单列表与控制视图 -->
          <div class="mp-view active" id="mp-view-list"></div>

          <!-- 共鸣碎片视图 -->
          <div class="mp-view" id="mp-view-cards"></div>

          <!-- 沉浸设置视图 -->
          <div class="mp-view" id="mp-view-settings"></div>
        </div>
      </div>
    `;

    this.overlay.innerHTML = pageHTML;
    document.body.appendChild(this.overlay);

    // 缓存常用 DOM 节点
    this.backBtn = this.overlay.querySelector('#mp-page-back');
    this.timelineNodes = this.overlay.querySelectorAll('.timeline-node');
    this.timelineProgress = this.overlay.querySelector('#mp-timeline-progress');
    
    this.viewList = this.overlay.querySelector('#mp-view-list');
    this.viewCards = this.overlay.querySelector('#mp-view-cards');
    this.viewSettings = this.overlay.querySelector('#mp-view-settings');
  }

  initEvents() {
    this.backBtn.addEventListener('click', () => this.hide());

    // 绑定星轨节点点击事件与滑块流光过渡逻辑
    this.timelineNodes.forEach(node => {
      node.addEventListener('click', () => {
        const index = parseInt(node.getAttribute('data-index'), 10);
        this.switchTab(index);
      });
    });
  }

  switchTab(index) {
    this.activeTab = index;
    
    // 更新滑轨流光条宽度
    const percentMap = { 0: '0%', 1: '50%', 2: '100%' };
    this.timelineProgress.style.width = percentMap[index];

    // 更新星轨节点选中样式
    this.timelineNodes.forEach((node, i) => {
      node.classList.toggle('active', i === index);
    });

    // 切换视图面板
    const views = [this.viewList, this.viewCards, this.viewSettings];
    views.forEach((view, i) => {
      view.classList.toggle('active', i === index);
    });

    this.renderTabContent();
  }

  show() {
    this.overlay.classList.add('show');
    this.overlay.setAttribute('data-player-theme', this.player.config.theme);
    this.switchTab(this.activeTab);
  }

  hide() {
    this.overlay.classList.remove('show');
  }

  async renderTabContent() {
    if (this.activeTab === 0) {
      await this.renderPlaylistTab();
    } else if (this.activeTab === 1) {
      await this.renderWordDecksTab();
    } else if (this.activeTab === 2) {
      await this.renderSettingsTab();
    }
  }

  // --- TAB 0: 心事歌单 (带 Equalizer 律动音柱) ---
  async renderPlaylistTab() {
    this.viewList.innerHTML = '';
    const songs = this.player.songs;
    const listContainer = document.createElement('div');
    listContainer.className = 'mp-list-songs';

    if (songs.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center;font-size:12px;color:rgba(255,255,255,0.3);padding:40px 0;">当前空无一歌，请在下方添加</div>`;
    } else {
      songs.forEach((song, idx) => {
        const isCurrent = this.player.currentIndex === idx;
        const item = document.createElement('div');
        item.className = `mp-list-item ${isCurrent ? 'active' : ''}`;
        
        item.innerHTML = `
          <div class="mp-item-track-icon">
            <!-- 默认细线条音乐符号 -->
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            <!-- 律动跳跃音轨动效 -->
            <div class="mp-equalizer">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="mp-item-info">
            <div class="mp-item-name">${song.name}</div>
            <div class="mp-item-status">${isCurrent && this.player.isPlaying ? '正在共鸣' : '等待共鸣'}</div>
          </div>
          <button class="mp-icon-btn mp-btn-delete" data-id="${song.id}" title="删除">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        `;

        item.querySelector('.mp-item-info').onclick = () => {
          this.player.selectSong(idx);
          this.renderPlaylistTab();
        };

        item.querySelector('.mp-btn-delete').onclick = async (e) => {
          e.stopPropagation();
          await db.musicPlaylist.delete(song.id);
          await this.player.loadSongsFromDB();
          if (this.player.currentIndex >= this.player.songs.length) {
            this.player.currentIndex = this.player.songs.length - 1;
          }
          await this.player.selectSong(this.player.currentIndex);
          this.renderPlaylistTab();
        };

        listContainer.appendChild(item);
      });
    }

    const formContainer = document.createElement('div');
    formContainer.innerHTML = `
      <div style="border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top:20px; margin-top:20px;">
        <div class="mp-section-title">收录心事</div>
        <div class="mp-form-group">
          <input type="text" class="mp-input" id="new-song-name" placeholder="写下一个诗意的名字...">
        </div>
        <div class="mp-form-group">
          <input type="text" class="mp-input" id="new-song-url" placeholder="网络音频链接 (URL)...">
        </div>
        <button class="mp-btn-submit" id="add-song-btn">刻入星轨</button>
      </div>
    `;

    this.viewList.appendChild(listContainer);
    this.viewList.appendChild(formContainer);

    formContainer.querySelector('#add-song-btn').onclick = async () => {
      const nameInput = formContainer.querySelector('#new-song-name');
      const urlInput = formContainer.querySelector('#new-song-url');
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();

      if (!name || !url) return;

      await db.musicPlaylist.add({ name, url });
      nameInput.value = '';
      urlInput.value = '';

      await this.player.loadSongsFromDB();
      this.renderPlaylistTab();
    };
  }

  // --- TAB 1: 共鸣碎片 ---
  async renderWordDecksTab() {
    this.viewCards.innerHTML = '';
    let musicDeck = await db.decks.filter(d => d.category === '音乐').first();
    if (!musicDeck) return;

    const cardsContainer = document.createElement('div');
    cardsContainer.innerHTML = `
      <div class="mp-form-group" style="display:flex;gap:12px;margin-bottom:20px;">
        <input type="text" class="mp-input" id="new-word-fragment" placeholder="如：落雪无声的叹息..." style="flex-grow:1;">
        <button class="mp-icon-btn" id="add-word-btn" style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,0.9);color:#000;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
      <div class="mp-section-title">散落的共鸣 (切歌时在夜空浮现)</div>
      <div class="mp-word-tags" id="mp-words-list"></div>
    `;

    this.viewCards.appendChild(cardsContainer);

    const listWrap = cardsContainer.querySelector('#mp-words-list');
    const updateWordTags = () => {
      listWrap.innerHTML = '';
      if (!musicDeck.fragments || musicDeck.fragments.length === 0) {
        listWrap.innerHTML = `<span style="font-size:12px;color:rgba(255,255,255,0.3);">暂无共鸣片段。</span>`;
        return;
      }

      musicDeck.fragments.forEach((fragment) => {
        const tag = document.createElement('span');
        tag.className = 'mp-word-tag';
        tag.innerHTML = `
          ${fragment}
          <button class="mp-word-tag-del" data-val="${fragment}">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;

        tag.querySelector('.mp-word-tag-del').onclick = async () => {
          musicDeck.fragments = musicDeck.fragments.filter(f => f !== fragment);
          if (musicDeck.fragmentStats && musicDeck.fragmentStats[fragment]) {
            delete musicDeck.fragmentStats[fragment];
          }
          await db.decks.put(musicDeck);
          updateWordTags();
        };

        listWrap.appendChild(tag);
      });
    };

    updateWordTags();

    cardsContainer.querySelector('#add-word-btn').onclick = async () => {
      const input = cardsContainer.querySelector('#new-word-fragment');
      const val = input.value.trim();
      if (!val) return;

      if (!musicDeck.fragments.includes(val)) {
        musicDeck.fragments.push(val);
        if (!musicDeck.fragmentStats) musicDeck.fragmentStats = {};
        musicDeck.fragmentStats[val] = {
          usageCount: 0,
          createdAt: Date.now()
        };
        await db.decks.put(musicDeck);
        input.value = '';
        updateWordTags();
      }
    };
  }

  // --- TAB 2: 沉浸偏好 (设置开关) ---
  async renderSettingsTab() {
    this.viewSettings.innerHTML = '';
    const characters = await db.characters.toArray();

    const settingsContainer = document.createElement('div');
    settingsContainer.innerHTML = `
      <div class="mp-form-group">
        <label>共鸣绑定角色 (未选择或无角色，则完全不出现低语评价)</label>
        <select class="mp-select" id="mp-setting-char">
          <option value="">安静聆听 (无共鸣对象)</option>
          ${characters.map(char => `<option value="${char.id}" ${this.player.config.bindCharacterId == char.id ? 'selected' : ''}>${char.name}</option>`).join('')}
        </select>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">显示悬浮图标</span>
          <span class="mp-switch-desc">在页面右下角显示音乐悬浮球组件。隐藏后可通过主界面“弦音”图标直接呼出设置面页。</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.showFloatBadge ? 'active' : ''}" id="switch-badge-visible"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">静默共鸣</span>
          <span class="mp-switch-desc">开启后，彻底隐藏所有低语碎片的浮现。</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.silentListening ? 'active' : ''}" id="switch-silent"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">角色自主切歌</span>
          <span class="mp-switch-desc">连接的对象会有极低概率跟随心境主动切歌。</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.roleAutoSwitch ? 'active' : ''}" id="switch-autoswitch"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">漂浮呼吸微动效</span>
          <span class="mp-switch-desc">为悬浮播放器开启专属的失重漂浮效果。</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.rotateRecord ? 'active' : ''}" id="switch-rotate"></div>
      </div>

      <div class="mp-form-group" style="margin-top:24px;">
        <label>播放器专属视觉微调</label>
        <div class="mp-theme-grid">
          <div class="mp-theme-option ${this.player.config.theme === 'midnight' ? 'active' : ''}" data-theme="midnight">深夜</div>
          <div class="mp-theme-option ${this.player.config.theme === 'foggy' ? 'active' : ''}" data-theme="foggy">迷雾</div>
          <div class="mp-theme-option ${this.player.config.theme === 'deepsea' ? 'active' : ''}" data-theme="deepsea">深海</div>
          <div class="mp-theme-option ${this.player.config.theme === 'snow' ? 'active' : ''}" data-theme="snow">雪季</div>
        </div>
      </div>
    `;

    this.viewSettings.appendChild(settingsContainer);

    // 绑定角色更改
    const charSelect = settingsContainer.querySelector('#mp-setting-char');
    charSelect.onchange = () => {
      this.player.config.bindCharacterId = charSelect.value ? Number(charSelect.value) : null;
      this.player.saveConfigToDB();
    };

    // 隐藏/显示悬浮球开关逻辑
    const btnBadgeVisible = settingsContainer.querySelector('#switch-badge-visible');
    btnBadgeVisible.onclick = () => {
      this.player.config.showFloatBadge = !this.player.config.showFloatBadge;
      btnBadgeVisible.classList.toggle('active', this.player.config.showFloatBadge);
      this.player.saveConfigToDB();
      this.player.applyBadgeVisibility();
    };

    // 静默聆听开关
    const btnSilent = settingsContainer.querySelector('#switch-silent');
    btnSilent.onclick = () => {
      this.player.config.silentListening = !this.player.config.silentListening;
      btnSilent.classList.toggle('active', this.player.config.silentListening);
      this.player.saveConfigToDB();
    };

    // 自动切歌开关
    const btnAuto = settingsContainer.querySelector('#switch-autoswitch');
    btnAuto.onclick = () => {
      this.player.config.roleAutoSwitch = !this.player.config.roleAutoSwitch;
      btnAuto.classList.toggle('active', this.player.config.roleAutoSwitch);
      this.player.saveConfigToDB();
    };

    // 漂浮动效开关
    const btnRotate = settingsContainer.querySelector('#switch-rotate');
    btnRotate.onclick = () => {
      this.player.config.rotateRecord = !this.player.config.rotateRecord;
      btnRotate.classList.toggle('active', this.player.config.rotateRecord);
      this.player.saveConfigToDB();
      
      const badge = this.player.badge;
      if (badge) {
        if (this.player.config.rotateRecord) {
          badge.style.animation = "mp-float-y 6s ease-in-out infinite";
        } else {
          badge.style.animation = "none";
        }
      }
    };

    // 主题色方格点击
    const themeOptions = settingsContainer.querySelectorAll('.mp-theme-option');
    themeOptions.forEach(opt => {
      opt.onclick = () => {
        themeOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const themeKey = opt.getAttribute('data-theme');
        
        this.player.applyThemeToContainers(themeKey);
        this.player.saveConfigToDB();
      };
    });
  }
}
