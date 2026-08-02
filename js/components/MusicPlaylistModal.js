import { db } from '../db.js';

export class MusicPlaylistModal {
  constructor(player) {
    this.player = player;
    this.activeTab = 'list'; // 'list' | 'settings' | 'cards'
    
    this.render();
    this.initEvents();
  }

  render() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'mp-modal-overlay';
    this.overlay.id = 'mp-modal-overlay';

    const modalHTML = `
      <div class="mp-modal-container">
        <div class="mp-modal-header">
          <h3>弦音留白</h3>
          <button class="mp-icon-btn" id="mp-modal-close" title="关闭">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="mp-modal-tabs">
          <div class="mp-modal-tab active" data-tab="list">歌单</div>
          <div class="mp-modal-tab" data-tab="cards">字卡</div>
          <div class="mp-modal-tab" data-tab="settings">设置</div>
        </div>
        <div class="mp-modal-body" id="mp-modal-body-content"></div>
      </div>
    `;

    this.overlay.innerHTML = modalHTML;
    document.body.appendChild(this.overlay);

    this.closeBtn = this.overlay.querySelector('#mp-modal-close');
    this.tabButtons = this.overlay.querySelectorAll('.mp-modal-tab');
    this.bodyContent = this.overlay.querySelector('#mp-modal-body-content');
  }

  initEvents() {
    this.closeBtn.addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

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

  async renderPlaylistTab() {
    const songs = this.player.songs;
    const listContainer = document.createElement('div');
    listContainer.className = 'mp-list-songs';

    if (songs.length === 0) {
      listContainer.innerHTML = `<div style="text-align:center;font-size:10px;color:#555;padding:20px 0;letter-spacing:0.5px;">当前空无一歌，请在下方添加</div>`;
    } else {
      songs.forEach((song, idx) => {
        const item = document.createElement('div');
        item.className = `mp-list-item ${this.player.currentIndex === idx ? 'active' : ''}`;
        
        item.innerHTML = `
          <div class="mp-item-info">
            <div class="mp-item-name">${song.name}</div>
          </div>
          <button class="mp-icon-btn mp-btn-delete" data-id="${song.id}" title="删除">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2">
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
      <div style="border-top: 1px solid rgba(255,255,255,0.02); padding-top:12px; margin-top:12px;">
        <div class="mp-form-group">
          <label>音乐名</label>
          <input type="text" class="mp-input" id="new-song-name" placeholder="输入诗意的歌名...">
        </div>
        <div class="mp-form-group">
          <label>音乐 URL (.mp3)</label>
          <input type="text" class="mp-input" id="new-song-url" placeholder="https://example.com/sound.mp3">
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

  async renderWordDecksTab() {
    // 使用 filter 二次防御过滤，确保不依赖索引防止报错
    let musicDeck = await db.decks.filter(d => d.category === '音乐').first();
    if (!musicDeck) return;

    const cardsContainer = document.createElement('div');
    cardsContainer.innerHTML = `
      <div class="mp-form-group">
        <label>新建专属灵性片段</label>
        <div style="display:flex;gap:6px;">
          <input type="text" class="mp-input" id="new-word-fragment" placeholder="呼吸的微光..." style="flex-grow:1;">
          <button class="mp-btn-submit" id="add-word-btn" style="width:60px;padding:0;">加入</button>
        </div>
      </div>
      <label style="font-size:10px;color:#555c64;display:block;margin-top:12px;">当前音乐专属评价片段</label>
      <div class="mp-word-tags" id="mp-words-list"></div>
    `;

    this.bodyContent.appendChild(cardsContainer);

    const listWrap = cardsContainer.querySelector('#mp-words-list');
    const updateWordTags = () => {
      listWrap.innerHTML = '';
      if (!musicDeck.fragments || musicDeck.fragments.length === 0) {
        listWrap.innerHTML = `<span style="font-size:10px;color:#555c64;">暂无音乐专属字卡。</span>`;
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

  async renderSettingsTab() {
    const characters = await db.characters.toArray();
    
    const settingsContainer = document.createElement('div');
    settingsContainer.innerHTML = `
      <div class="mp-form-group">
        <label>共鸣绑定角色 (不绑定则不出现评价)</label>
        <select class="mp-select" id="mp-setting-char">
          <option value="">安静独处（无角色共鸣）</option>
          ${characters.map(char => `<option value="${char.id}" ${this.player.config.bindCharacterId == char.id ? 'selected' : ''}>${char.name}</option>`).join('')}
        </select>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">静默聆听</span>
          <span class="mp-switch-desc">全局屏障角色评论气泡</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.silentListening ? 'active' : ''}" id="switch-silent"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">允许角色自主切歌</span>
          <span class="mp-switch-desc">绑定角色有极小概率自主挑选曲子</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.roleAutoSwitch ? 'active' : ''}" id="switch-autoswitch"></div>
      </div>

      <div class="mp-switch-group">
        <div class="mp-switch-info">
          <span class="mp-switch-title">唱片缓慢旋转</span>
          <span class="mp-switch-desc">播放音乐时，导航图标产生旋转动效</span>
        </div>
        <div class="mp-switch-btn ${this.player.config.rotateRecord ? 'active' : ''}" id="switch-rotate"></div>
      </div>

      <div class="mp-form-group" style="margin-top:16px;">
        <label>深色低饱和度主题</label>
        <div class="mp-theme-grid">
          <div class="mp-theme-option ${this.player.config.theme === 'midnight' ? 'active' : ''}" data-theme="midnight">深夜</div>
          <div class="mp-theme-option ${this.player.config.theme === 'foggy' ? 'active' : ''}" data-theme="foggy">迷雾</div>
          <div class="mp-theme-option ${this.player.config.theme === 'deepsea' ? 'active' : ''}" data-theme="deepsea">深海</div>
          <div class="mp-theme-option ${this.player.config.theme === 'snow' ? 'active' : ''}" data-theme="snow">雪季</div>
        </div>
      </div>
    `;

    this.bodyContent.appendChild(settingsContainer);

    const charSelect = settingsContainer.querySelector('#mp-setting-char');
    charSelect.onchange = () => {
      this.player.config.bindCharacterId = charSelect.value ? Number(charSelect.value) : null;
      this.player.saveConfigToDB();
    };

    const btnSilent = settingsContainer.querySelector('#switch-silent');
    btnSilent.onclick = () => {
      this.player.config.silentListening = !this.player.config.silentListening;
      btnSilent.classList.toggle('active', this.player.config.silentListening);
      this.player.saveConfigToDB();
    };

    const btnAuto = settingsContainer.querySelector('#switch-autoswitch');
    btnAuto.onclick = () => {
      this.player.config.roleAutoSwitch = !this.player.config.roleAutoSwitch;
      btnAuto.classList.toggle('active', this.player.config.roleAutoSwitch);
      this.player.saveConfigToDB();
    };

    const btnRotate = settingsContainer.querySelector('#switch-rotate');
    btnRotate.onclick = () => {
      this.player.config.rotateRecord = !this.player.config.rotateRecord;
      btnRotate.classList.toggle('active', this.player.config.rotateRecord);
      this.player.saveConfigToDB();
      this.player.updateRecordAnimationState();
    };

    const themeOptions = settingsContainer.querySelectorAll('.mp-theme-option');
    themeOptions.forEach(opt => {
      opt.onclick = () => {
        themeOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const themeKey = opt.getAttribute('data-theme');
        this.player.applyTheme(themeKey);
      };
    });
  }
}
