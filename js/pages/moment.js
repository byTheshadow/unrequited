import { db } from '../db.js';
import { goBack } from '../router.js';

// 定义纯 SVG 图标以符合无 emoji 的规范
const SVG_ICONS = {
  back: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
  close: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  // 角色态度 SVG 图标面板
  like: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color: #db5a5a;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color: #e2c067;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #6fb6cc;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color: #a78bfa;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

let timerInterval = null;

/**
 * 格式化倒计时
 */
function formatCountdown(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return '已逝去';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}小时${mins}分后抹去`;
}

/**
 * 压缩图片
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 限制最大宽度 1080px
        const maxW = 1080;
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 输出为 jpeg，画质 0.7
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 清除已过期的片刻
 */
async function cleanExpiredMoments() {
  const now = Date.now();
  const expired = await db.moments.filter(m => m.expiryTimestamp <= now).toArray();
  for (const m of expired) {
    await db.moments.delete(m.id);
    await db.momentInteractions.where('momentId').equals(m.id).delete();
  }
}

/**
 * 新建片刻，并在后台排程模拟角色的字卡评价
 */
async function addMoment(imageDataUrl, caption, expiryHours) {
  const now = Date.now();
  const expiryTimestamp = now + expiryHours * 60 * 60 * 1000;

  // 1. 保存片刻实体与配文
  const momentId = await db.moments.add({
    image: imageDataUrl,
    caption: caption || '',
    timestamp: now,
    expiryTimestamp: expiryTimestamp
  });

  // 2. 限制最多 10 张，超出的物理删除最旧的
  const allMoments = await db.moments.orderBy('timestamp').toArray();
  if (allMoments.length > 10) {
    const toDeleteCount = allMoments.length - 10;
    for (let i = 0; i < toDeleteCount; i++) {
      const m = allMoments[i];
      await db.moments.delete(m.id);
      await db.momentInteractions.where('momentId').equals(m.id).delete();
    }
  }

  // 3. 摇骰子决定哪些角色会评价，并预定在 24 小时内（或过期前）的随机时间评出
  let characters = await db.characters.toArray();
  // 如果数据库里暂无任何角色，我们 Mock 三个默认人物以保证交互性
  if (characters.length === 0) {
    characters = [
      { id: 901, name: '林川' },
      { id: 902, name: '苏眠' },
      { id: 903, name: '陆白' }
    ];
  }

  // 从玩家的字卡库中选择可用的字卡
  const allDecks = await db.decks.toArray();
  let fragmentPool = [];
  allDecks.forEach(d => {
    if (d.fragments && Array.isArray(d.fragments)) {
      fragmentPool.push(...d.fragments);
    }
  });

  // fallback
  if (fragmentPool.length === 0) {
    fragmentPool = ["想你", "同频", "在思考", "安静", "刚好", "流动的光", "被发现了", "心动", "温柔", "晚安", "独自一人"];
  }

  const icons = ['like', 'sparkle', 'star', 'moon'];

  for (const char of characters) {
    // 摇骰子：80% 概率会进行评价
    if (Math.random() < 0.8) {
      // 随机评价延迟：1分钟到 24小时内，或者保质期截止之前
      const maxDelay = Math.min(expiryHours * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
      const minDelay = 60 * 1000; 
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
      const scheduledTime = now + randomDelay;

      // 角色自行选择：从玩家字卡池随机抽取 2-4 个字卡拼接成评价
      const wordCount = Math.floor(Math.random() * 3) + 2;
      const selectedFragments = [];
      for (let i = 0; i < wordCount; i++) {
        const idx = Math.floor(Math.random() * fragmentPool.length);
        selectedFragments.push(fragmentPool[idx]);
      }

      // 角色选择一个态度 SVG 类型
      const reactionIcon = icons[Math.floor(Math.random() * icons.length)];

      await db.momentInteractions.add({
        momentId: momentId,
        characterId: char.id,
        characterName: char.name,
        scheduledTime: scheduledTime,
        reactionIcon: reactionIcon,
        fragments: selectedFragments
      });
    }
  }
}

export async function render(root) {
  await cleanExpiredMoments();

  // 获取今日发帖额度
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todaysMoments = await db.moments.where('timestamp').above(todayStart).toArray();
  const currentUploadCount = todaysMoments.length;
  const remainingUploads = Math.max(0, 3 - currentUploadCount);

  // 渲染主体结构
  root.innerHTML = `
    <div class="moment-container">
      <!-- 极简悬浮返回按钮，抛弃笨重长条 Header -->
      <button class="moment-back-floating" id="btn-moment-back" aria-label="返回">
        ${SVG_ICONS.back}
      </button>

      <!-- 顶部的今日余量极简提示 -->
      <div class="moment-top-indicator">
        <span class="indicator-tag">片刻</span>
        <span class="indicator-quota">今日剩余 ${remainingUploads}/3 留存额度</span>
      </div>

      <main class="moment-feed" id="moment-feed-list">
        <!-- 动态加载列表 -->
      </main>

      <!-- 悬浮相机按钮 -->
      <button class="moment-fab" id="btn-moment-upload-trigger" aria-label="定格瞬间" style="display: ${remainingUploads > 0 ? 'flex' : 'none'}">
        ${SVG_ICONS.camera}
      </button>

      <!-- 上传底部弹窗 -->
      <div class="moment-sheet-overlay" id="moment-upload-sheet">
        <div class="moment-sheet">
          <div class="sheet-header">
            <h3>定格当下</h3>
            <button class="sheet-close" id="btn-sheet-close">${SVG_ICONS.close}</button>
          </div>
          <div class="sheet-body">
            <div class="photo-picker-box" id="photo-picker-trigger">
              <input type="file" id="moment-file-input" accept="image/*" style="display: none;" />
              <div class="picker-placeholder" id="picker-placeholder">
                ${SVG_ICONS.camera}
                <span>选择此刻的一幅画面</span>
              </div>
              <img id="photo-picker-preview" src="" style="display: none;" />
            </div>

            <!-- 配文输入区 -->
            <div class="input-caption-box">
              <textarea id="moment-caption-input" placeholder="输入此刻的心境与文字..." rows="3" maxlength="150"></textarea>
            </div>

            <div class="expiry-selector">
              <span class="selector-label">保质期</span>
              <div class="selector-options">
                <button class="expiry-opt-btn active" data-hours="24">24 小时</button>
                <button class="expiry-opt-btn" data-hours="48">48 小时</button>
              </div>
            </div>

            <button class="moment-submit-btn" id="btn-moment-submit" disabled>定格留存</button>
          </div>
        </div>
      </div>
    </div>

    <style>
      .moment-container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--color-bg);
        color: var(--color-text);
        font-family: inherit;
        position: relative;
        padding-top: 24px;
      }
      /* 极简悬浮返回 */
      .moment-back-floating {
        position: fixed;
        top: 20px;
        left: 20px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 99;
        transition: color 0.2s, background 0.2s;
      }
      .moment-back-floating:active {
        color: var(--color-accent);
      }
      /* 顶部状态提示 */
      .moment-top-indicator {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 16px;
        margin-bottom: 8px;
        gap: 4px;
      }
      .indicator-tag {
        font-size: 14px;
        letter-spacing: 0.2em;
        font-weight: 300;
        color: var(--color-text-primary);
      }
      .indicator-quota {
        font-size: 11px;
        color: var(--color-text-secondary);
        opacity: 0.6;
        letter-spacing: 0.05em;
      }

      /* 瀑布式的极简信息流 */
      .moment-feed {
        flex: 1;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 32px;
        max-width: 480px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
      }
      .empty-feed {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: var(--color-text-secondary);
        padding-top: 120px;
        font-size: 13px;
        line-height: 2;
        letter-spacing: 0.08em;
        opacity: 0.5;
      }
      
      /* IG 风格卡片 */
      .moment-card {
        background: transparent;
        display: flex;
        flex-direction: column;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        padding: 0 4px;
      }
      .card-author {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .author-avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: var(--color-text-secondary);
      }
      .author-name {
        font-size: 12.5px;
        font-weight: 500;
        letter-spacing: 0.02em;
      }
      .card-timer {
        font-size: 10.5px;
        color: var(--color-text-secondary);
        opacity: 0.6;
      }

      /* 图片包裹区 */
      .card-image-wrapper {
        position: relative;
        width: 100%;
        border-radius: 6px;
        overflow: hidden;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
      }
      .card-image {
        display: block;
        width: 100%;
        max-height: 380px;
        object-fit: cover;
        filter: brightness(0.85) contrast(1.02); /* 略带复古暗色的克制滤镜 */
      }

      /* 底部操作区 (极简删除) */
      .card-meta-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 4px 4px 4px;
      }
      .delete-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        opacity: 0.4;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        transition: opacity 0.2s;
      }
      .delete-btn:hover {
        opacity: 0.8;
      }

      /* 自定义文字配文区 (Caption) */
      .card-caption {
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text-primary);
        padding: 2px 4px 8px 4px;
        letter-spacing: 0.02em;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      /* 表情包/态度面板区 */
      .card-reactions-panel {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 4px;
      }
      .reaction-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 2px 8px;
        font-size: 11px;
        color: var(--color-text-secondary);
      }

      /* 角色字卡拼贴评论区 */
      .card-comments {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 4px 4px 8px 4px;
      }
      .comment-row {
        font-size: 12.5px;
        line-height: 1.6;
        color: var(--color-text-secondary);
      }
      .commenter-name {
        font-weight: 500;
        color: var(--color-text-primary);
        margin-right: 6px;
      }
      .comment-word-block {
        display: inline-flex;
        align-items: center;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: 10.5px;
        padding: 1px 5px;
        border-radius: 4px;
        margin-right: 3px;
      }

      /* 悬浮上传按钮 */
      .moment-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        color: var(--color-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        cursor: pointer;
        z-index: 90;
        transition: transform 0.2s;
      }
      .moment-fab:active {
        transform: scale(0.9);
      }

      /* 底部弹窗 */
      .moment-sheet-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.65);
        z-index: 100;
        display: none;
        align-items: flex-end;
      }
      .moment-sheet {
        width: 100%;
        max-width: 480px;
        margin: 0 auto;
        background: var(--color-bg);
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        border-top: 1px solid var(--color-border);
        animation: slideUp 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94);
        padding-bottom: 24px;
      }
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      .sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 20px;
        border-bottom: 1px solid var(--color-border);
      }
      .sheet-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.05em;
      }
      .sheet-close {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 4px;
      }
      .sheet-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .photo-picker-box {
        width: 100%;
        aspect-ratio: 4/3;
        border: 1px dashed var(--color-border);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: pointer;
        overflow: hidden;
        background: var(--color-bg-secondary);
      }
      .picker-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        color: var(--color-text-secondary);
        font-size: 12px;
        opacity: 0.7;
      }
      #photo-picker-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      /* 配文输入样式 */
      .input-caption-box textarea {
        width: 100%;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 8px 12px;
        color: var(--color-text);
        font-family: inherit;
        font-size: 13px;
        resize: none;
        outline: none;
        box-sizing: border-box;
      }
      .input-caption-box textarea:focus {
        border-color: var(--color-accent);
      }

      .expiry-selector {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .expiry-selector .selector-label {
        font-size: 12px;
        color: var(--color-text-secondary);
      }
      .selector-options {
        display: flex;
        gap: 8px;
      }
      .expiry-opt-btn {
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      }
      .expiry-opt-btn.active {
        border-color: var(--color-accent);
        color: var(--color-accent);
        background: rgba(255, 255, 255, 0.02);
      }
      .moment-submit-btn {
        width: 100%;
        background: var(--color-text-primary);
        color: var(--color-bg);
        border: none;
        padding: 10px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        margin-top: 8px;
        transition: opacity 0.2s;
      }
      .moment-submit-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    </style>
  `;

  const feedList = root.querySelector('#moment-feed-list');
  const btnBack = root.querySelector('#btn-moment-back');
  const btnUploadTrigger = root.querySelector('#btn-moment-upload-trigger');
  const uploadSheet = root.querySelector('#moment-upload-sheet');
  const btnSheetClose = root.querySelector('#btn-sheet-close');
  const photoPicker = root.querySelector('#photo-picker-trigger');
  const fileInput = root.querySelector('#moment-file-input');
  const previewImg = root.querySelector('#photo-picker-preview');
  const placeholder = root.querySelector('#picker-placeholder');
  const btnSubmit = root.querySelector('#btn-moment-submit');
  const expiryBtns = root.querySelectorAll('.expiry-opt-btn');
  const captionInput = root.querySelector('#moment-caption-input');

  let selectedImageDataUrl = null;
  let selectedExpiryHours = 24;

  // 加载列表与渲染
  async function refreshFeed() {
    await cleanExpiredMoments();
    const moments = await db.moments.orderBy('timestamp').reverse().toArray();

    if (moments.length === 0) {
      feedList.innerHTML = `
        <div class="empty-feed">
          <div>定格此刻的波纹</div>
          <div>流转即逝</div>
        </div>
      `;
      return;
    }

    const now = Date.now();
    let feedHtml = '';

    for (const m of moments) {
      // 获取当前可展示的角色评论和态度
      const interactions = await db.momentInteractions
        .where('momentId')
        .equals(m.id)
        .filter(item => item.scheduledTime <= now)
        .toArray();

      const timeStr = formatCountdown(m.expiryTimestamp);

      // 1. 构建角色态度表情面板
      let reactionsPanelHtml = '';
      if (interactions.length > 0) {
        reactionsPanelHtml = `
          <div class="card-reactions-panel">
            ${interactions.map(item => {
              const svgReaction = SVG_ICONS[item.reactionIcon] || SVG_ICONS.star;
              return `
                <div class="reaction-pill" title="${escapeHtml(item.characterName)} 的回应">
                  ${svgReaction}
                  <span>${escapeHtml(item.characterName)}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      // 2. 构建角色字卡拼接评论区
      let commentsHtml = '';
      if (interactions.length > 0) {
        commentsHtml = `
          <div class="card-comments">
            ${interactions.map(item => {
              return `
                <div class="comment-row">
                  <span class="commenter-name">${escapeHtml(item.characterName)}</span>
                  ${(item.fragments || []).map(word => `<span class="comment-word-block">${escapeHtml(word)}</span>`).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      feedHtml += `
        <div class="moment-card" data-id="${m.id}">
          <div class="card-header">
            <div class="card-author">
              <div class="author-avatar">我</div>
              <span class="author-name">我</span>
            </div>
            <span class="card-timer" data-expiry="${m.expiryTimestamp}">${timeStr}</span>
          </div>

          <div class="card-image-wrapper">
            <img class="card-image" src="${m.image}" alt="片刻" loading="lazy" />
          </div>

          <!-- 自定义配文 -->
          ${m.caption ? `<div class="card-caption">${escapeHtml(m.caption)}</div>` : ''}

          <!-- 态度微表情面板 -->
          ${reactionsPanelHtml}

          <!-- 字卡拼贴互动 -->
          ${commentsHtml}

          <div class="card-meta-bar">
            <button class="delete-btn" data-act="delete" data-id="${m.id}" title="提前抹去">
              ${SVG_ICONS.trash}
            </button>
          </div>
        </div>
      `;
    }

    feedList.innerHTML = feedHtml;
  }

  // 绑定事件：返回
  btnBack.addEventListener('click', () => {
    goBack('/home');
  });

  // 绑定事件：打开上传抽屉
  btnUploadTrigger.addEventListener('click', () => {
    uploadSheet.style.display = 'flex';
  });

  // 绑定事件：关闭上传抽屉并重置表单
  const resetUploadForm = () => {
    uploadSheet.style.display = 'none';
    fileInput.value = '';
    captionInput.value = '';
    previewImg.style.display = 'none';
    previewImg.src = '';
    placeholder.style.display = 'flex';
    selectedImageDataUrl = null;
    btnSubmit.disabled = true;
  };
  btnSheetClose.addEventListener('click', resetUploadForm);

  // 绑定事件：拉起相册
  photoPicker.addEventListener('click', () => {
    fileInput.click();
  });

  // 绑定事件：选择与压缩
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      btnSubmit.disabled = true;
      btnSubmit.innerText = '压缩中...';
      const compressed = await compressImage(file);
      selectedImageDataUrl = compressed;
      previewImg.src = compressed;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      btnSubmit.disabled = false;
      btnSubmit.innerText = '定格存下';
    } catch (err) {
      console.error(err);
      alert('图片压缩失败，请重试');
      btnSubmit.innerText = '定格留存';
      btnSubmit.disabled = true;
    }
  });

  // 选择时效
  expiryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      expiryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedExpiryHours = parseInt(btn.dataset.hours, 10);
    });
  });

  // 提交片刻
  btnSubmit.addEventListener('click', async () => {
    if (!selectedImageDataUrl) return;

    btnSubmit.disabled = true;
    btnSubmit.innerText = '定格中...';

    const caption = captionInput.value.trim();

    try {
      await addMoment(selectedImageDataUrl, caption, selectedExpiryHours);
      resetUploadForm();
      await render(root);
    } catch (err) {
      console.error(err);
      alert('发布失败，请重试');
      btnSubmit.disabled = false;
      btnSubmit.innerText = '定格留存';
    }
  });

  // 删除片刻
  feedList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-act="delete"]');
    if (!deleteBtn) return;
    const momentId = parseInt(deleteBtn.dataset.id, 10);
    if (confirm('是否确定提前抹去这一瞬间？抹去后互动也将消失。')) {
      await db.moments.delete(momentId);
      await db.momentInteractions.where('momentId').equals(momentId).delete();
      await render(root);
    }
  });

  await refreshFeed();

  // 定时倒计时刷新与物理过期清理
  timerInterval = setInterval(async () => {
    const timers = feedList.querySelectorAll('.card-timer');
    const now = Date.now();
    let hasExpired = false;

    timers.forEach(t => {
      const expiry = parseInt(t.dataset.expiry, 10);
      if (expiry <= now) {
        hasExpired = true;
      } else {
        t.textContent = formatCountdown(expiry);
      }
    });

    if (hasExpired) {
      await refreshFeed();
    }
  }, 15000);
}

/**
 * 销毁组件：回收定时器
 */
export function destroy() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * 辅助字符安全编码
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
