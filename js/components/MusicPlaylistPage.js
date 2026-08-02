import { db } from '../db.js';

export class MusicPlaylistPage {
  constructor(player) {
    this.player = player;
    this.activeTab = 'list'; // 'list' | 'cards' | 'settings'
    
    this.render();
    this.initEvents();
  }

  render() {
    // 构造全屏子页面框架
    this.overlay = document.createElement('div');
    this.overlay.className = 'mp-page-overlay';
    this.overlay.id = 'mp-page-overlay';

    const pageHTML = `
      <div class="mp-page-container">
        <div class="mp-page-header">
          <button class="mp-page-back" id="mp-page-back" title="返回">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <div class="mp-header-title-area">
            <h2 class="mp-page-title">弦音留白</h2>
            <span class="mp-decor-text" id="mp-decor-text">MIDNIGHT LAMENT // 星河微冷</span>
          </div>
        </div>
        <div class="mp-page-tabs">
          <div class="mp-page-tab active" data-tab="list">歌单</div>
          <div class="mp-page-tab" data-tab="cards">专属字卡</div>
          <div class="mp-page-tab" data-tab="settings">偏好设置</div>
        </div>
        <div class="mp-page-body" id="mp-page-body-content">
          <!-- 页面主题异步渲染 -->
        </div>
      </div>
    `;

    this.overlay.innerHTML = pageHTML;
    document.body.appendChild(this.overlay);

    // 缓存指针
    this.backBtn = this.overlay.querySelector('#mp-page-back');
    this.tabButtons = this.overlay.querySelectorAll('.mp-page-tab');
    this.bodyContent = this.overlay.querySelector('#mp-page-body-content');
  }

  initEvents() {
    // 点击返回关闭全屏子页
    this.backBtn.addEventListener('click', () => this.hide());

    // 切换标签页
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.getAttribute('data-tab');
        this.renderTabContent();
      });
    });
  }

  show() {
    this.overlay.classList.add('show');
    this.overlay.setAttribute('data-player-theme', this.player.config.theme);
    
    // 渲染标题处的装饰诗句
    const decorMap = {
      midnight: "MIDNIGHT LAMENT // 星河微冷",
      foggy: "MISTY VOID // 浮生如梦",
      deepsea: "DEEP ABYSS // 鱼沉雁杳",
      snow: "COLD CRYSTAL // 独钓寒江"
    };
    const pageDecor = this.overlay.querySelector('#mp-decor-text');
    if (pageDecor) {
      pageDecor.textContent = decorMap[this.player.config.theme] || decorMap.midnight;
    }

    this.renderTabContent();
  }

  hide() {
    this.overlay.classList.remove('show');
  }

  async renderTabContent() {
    this.bodyContent.innerHTML = '';

    if (this.activeTab === 'list') {
      await this.renderPlaylistTab();
    } else if (this.activeTab === 'cards') {
      await this.renderWordDecksTab();
    } else if (this.activeTab === 'settings') {
      await this.renderSettingsTab();
    }
  }

  // --- 歌单页面内容 ---
  async renderPlaylistTab() {
    const songs = this.player.songs;
    const listContainer = document.createElement('div');
    listContainer.className = 'mp-list-songs';

    if (songs.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center;font-size:11px;color:var(--mp-text);padding:30px 0;">当前空无一歌，请在下方添加</div>`;
    } else {
      songs.forEach((song, idx) => {
        const item = document.createElement('div');
        item.className = `mp-list-item ${this.player.currentIndex === idx ? 'active' : ''}`;
        
        item.innerHTML = `
          <div class="mp-item-info">
            <div class="mp-item-name">${song.name}</div>
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
      <div style="border-top: 1px solid var(--mp-border); padding-top:16px; margin-top:16px;">
        <div class="mp-form-group">
          <label>音乐名</label>
          <input type="text" class="mp-input" id="new-song-name" placeholder="写下一个诗意的名字...">
        </div>
        <div class="mp-form-group">
          <label>网络 MP3 地址 (URL)</label>
          <input type="text" class="mp-input" id="new-song-url" placeholder="https://example.com/melody.mp3">
        </div>
        <button class="mp-btn-submit" id="add-song-btn">添入心事歌单</button>
      </div>
    `;

    this.bodyContent.appendChild(listContainer);
    this.bodyContent.appendChild(formContainer);

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

  // --- 字卡页面内容 (使用 filter 规避 category 的索引 Schema 限制) ---
  async renderWordDecksTab() {
    let musicDeck = await db.decks.filter(d => d.category === '音乐').first();
    if (!musicDeck) return;

    const cardsContainer = document.createElement('div');
    cardsContainer.innerHTML = `
      <div class="mp-form-group">
        <label>共鸣字词 (当切歌时，绑定角色将在此抽取内容低语)</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="mp-input" id="new-word-fragment" placeholder="如：深海微光..." style="flex-grow:1;">
          <button class="mp-btn-submit" id="add-word-btn" style="width:70px;padding:0;">刻写</button>
        </div>
      </div>
      <div class="mp-word-tags" id="mp-words-list"></div>
    `;

    this.bodyContent.appendChild(cardsContainer);

    const listWrap = cardsContainer.querySelector('#mp-words-list');
    const updateWordTags = () => {
      listWrap.innerHTML = '';
      if (!musicDeck.fragments || musicDeck.fragments.length === 0) {
        listWrap.innerHTML = `<span style="font-size:11px;color:var(--mp-text);">暂无共鸣片段。</span>`;
        return;
      }

      musicDeck.fragments.forEach((fragment) => {
        const tag = document.createElement('span');
        tag.className = 'mp-word-tag';
        tag.innerHTML = `
          ${fragment}
          <button class="mp-word-tag-del" data-val="${fragment}">
            <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M18 6 6 18M6 6l12 12"/>
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

  // --- 偏好设置页面内容 ---
  async renderSettingsTab() {
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
          <span class="mp-switch-title">静默共鸣</span>
          <span class="mp-switch-desc">全局屏障角色评论气泡的浮现</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.silentListening ? 'active' : ''}" id="switch-silent"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">允许角色自主切歌</span>
          <span class="mp-switch-desc">允许共鸣对象挑选符合当下心境的歌曲</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.roleAutoSwitch ? 'active' : ''}" id="switch-autoswitch"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">漂浮呼吸微动效</span>
          <span class="mp-switch-desc">为悬浮组件激活专属美化主题微动作</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.rotateRecord ? 'active' : ''}" id="switch-rotate"></div>
      </div>

      <div class="mp-form-group" style="margin-top:20px;">
        <label>留白色彩主题</label>
        <div class="mp-theme-grid">
          <div class="mp-theme-option ${this.player.config.theme === 'midnight' ? 'active' : ''}" data-theme="midnight">深夜</div>
          <div class="mp-theme-option ${this.player.config.theme === 'foggy' ? 'active' : ''}" data-theme="foggy">迷雾</div>
          <div class="mp-theme-option ${this.player.config.theme === 'deepsea' ? 'active' : ''}" data-theme="deepsea">深海</div>
          <div class="mp-theme-option ${this.player.config.theme === 'snow' ? 'active' : ''}" data-theme="snow">雪季</div>
        </div>
      </div>
    `;

    this.bodyContent.appendChild(settingsContainer);

    // 绑定角色切换
    const charSelect = settingsContainer.querySelector('#mp-setting-char');
    charSelect.onchange = () => {
      this.player.config.bindCharacterId = charSelect.value ? Number(charSelect.value) : null;
      this.player.saveConfigToDB();
    };

    // 静默共鸣切换
    const btnSilent = settingsContainer.querySelector('#switch-silent');
    btnSilent.onclick = () => {
      this.player.config.silentListening = !this.player.config.silentListening;
      btnSilent.classList.toggle('active', this.player.config.silentListening);
      this.player.saveConfigToDB();
    };

    // 自主切歌切换
    const btnAuto = settingsContainer.querySelector('#switch-autoswitch');
    btnAuto.onclick = () => {
      this.player.config.roleAutoSwitch = !this.player.config.roleAutoSwitch;
      btnAuto.classList.toggle('active', this.player.config.roleAutoSwitch);
      this.player.saveConfigToDB();
    };

    // 微动效切换
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
        
        // 应用并同步主题到全局容器与全屏子页
        this.player.applyThemeToContainers(themeKey);
        this.player.saveConfigToDB();
      };
    });
  }
}
