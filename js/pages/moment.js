import { db } from '../db.js';
import { goBack } from '../router.js';

// 定义纯 SVG 图标以符合无 emoji 的规范
const SVG_ICONS = {
  back: `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`,
  close: `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  // 角色态度 SVG 图标 (代替情绪 Emoji)
  like: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" class="reaction-heart"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

let timerInterval = null;

/**
 * 格式化倒计时
 */
function formatCountdown(targetMs) {
  const diff = targetMs - Date.now();
  if (diff <= 0) return '已消逝';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `余 ${hours}小时${mins}分`;
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

        // 输出为 jpeg，画质 0.75
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
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
async function addMoment(imageDataUrl, contentText, expiryHours) {
  const now = Date.now();
  const expiryTimestamp = now + expiryHours * 60 * 60 * 1000;

  // 1. 保存片刻实体与用户留字描述
  const momentId = await db.moments.add({
    image: imageDataUrl,
    content: contentText.trim(),
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

  // 3. 读取真实角色表
  let characters = await db.characters.toArray();
  // Mock 兜底数据以保证在新账户无角色时可以演示
  if (characters.length === 0) {
    characters = [
      { id: 901, name: '林川' },
      { id: 902, name: '苏眠' },
      { id: 903, name: '陆白' }
    ];
  }

  // 4. 读取真实字卡库数据
  const allDecks = await db.decks.toArray();

  const icons = ['like', 'sparkle', 'star', 'moon'];

  for (const char of characters) {
    // 摇骰子决定角色是否评价（75% 概率评价）
    if (Math.random() < 0.75) {
      // 随机分配 24小时 (或过期前) 的任意时间点进行评价
      const maxDelay = Math.min(expiryHours * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
      const minDelay = 60 * 1000; // 至少 1 分钟后出现评价，防穿帮
      const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
      const scheduledTime = now + randomDelay;

      // 提取针对该角色的专属字卡包，以及无角色绑定的通用字卡包
      const specificDecks = allDecks.filter(d => d.bindCharacterId === char.id);
      const generalDecks = allDecks.filter(d => !d.bindCharacterId);

      let characterFragments = [];
      specificDecks.forEach(d => {
        if (d.fragments && Array.isArray(d.fragments)) {
          characterFragments.push(...d.fragments);
        }
      });

      // 如果专属字卡包词汇较少，混入通用字卡包词汇
      if (characterFragments.length < 15) {
        generalDecks.forEach(d => {
          if (d.fragments && Array.isArray(d.fragments)) {
            characterFragments.push(...d.fragments);
          }
        });
      }

      // 如果没有任何字卡（即库空状态下），提供情感词作为保底
      if (characterFragments.length === 0) {
        characterFragments = ["心动", "温柔", "同频", "想见你", "独自一人", "安静", "宇宙", "时空的缝隙", "灵魂共鸣"];
      }

      // 角色自主拼接：随机选择 2 至 4 张字卡
      const wordCount = Math.floor(Math.random() * 3) + 2;
      const selectedFragments = [];
      for (let i = 0; i < wordCount; i++) {
        const rIdx = Math.floor(Math.random() * characterFragments.length);
        selectedFragments.push(characterFragments[rIdx]);
      }

      const reactionIcon = icons[Math.floor(Math.random() * icons.length)];

      // 预存进互动表
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

  root.innerHTML = `
    <div class="moment-container">
      
      <!-- 极简悬浮返回键 -->
      <button class="moment-floating-btn moment-back-btn" id="btn-moment-back" aria-label="返回">
        ${SVG_ICONS.back}
      </button>

      <!-- 极简悬浮额度气泡 -->
      <div class="moment-floating-quota">
        今日剩余 ${remainingUploads}/3
      </div>

      <main class="moment-feed" id="moment-feed-list">
        <!-- 动态加载列表 -->
      </main>

      <!-- 极简相机上传按钮 -->
      <button class="moment-fab" id="btn-moment-upload-trigger" aria-label="定格瞬间" style="display: ${remainingUploads > 0 ? 'flex' : 'none'}">
        ${SVG_ICONS.camera}
      </button>

      <!-- 上传底部弹窗 -->
      <div class="moment-sheet-overlay" id="moment-upload-sheet">
        <div class="moment-sheet">
          <div class="sheet-header">
            <h3>定格此刻</h3>
            <button class="sheet-close" id="btn-sheet-close">${SVG_ICONS.close}</button>
          </div>
          <div class="sheet-body">
            <div class="photo-picker-box" id="photo-picker-trigger">
              <input type="file" id="moment-file-input" accept="image/*" style="display: none;" />
              <div class="picker-placeholder" id="picker-placeholder">
                ${SVG_ICONS.camera}
                <span>选择瞬时的光影记录</span>
              </div>
              <img id="photo-picker-preview" src="" style="display: none;" />
            </div>

            <!-- 用户文字说明输入框 -->
            <textarea class="moment-caption-input" id="moment-caption-input" placeholder="这一刻，你在想什么... (可选)" rows="2" maxlength="150"></textarea>

            <div class="expiry-selector">
              <span class="selector-label">存在期限</span>
              <div class="selector-options">
                <button class="expiry-opt-btn active" data-hours="24">24 小时</button>
                <button class="expiry-opt-btn" data-hours="48">48 小时</button>
              </div>
            </div>

            <button class="moment-submit-btn" id="btn-moment-submit" disabled>留存片刻</button>
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
        padding-top: 60px; /* 避开顶部悬浮按钮的留白 */
      }
      
      /* 极简悬浮式返回键与额度标 */
      .moment-floating-btn {
        position: fixed;
        top: 16px;
        left: 16px;
        width: 34px;
        height: 34px;
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
        z-index: 100;
        transition: transform 0.2s, color 0.2s;
      }
      .moment-floating-btn:active {
        transform: scale(0.9);
        color: var(--color-accent);
      }
      .moment-floating-quota {
        position: fixed;
        top: 16px;
        right: 16px;
        padding: 6px 12px;
        font-size: 11px;
        border-radius: 20px;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        letter-spacing: 1px;
        z-index: 100;
        opacity: 0.8;
      }

      .moment-feed {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 32px;
        padding: 16px 0 100px 0; /* 底部预留悬浮按钮位移 */
      }
      
      .empty-feed {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: var(--color-text-secondary);
        padding-top: 140px;
        font-size: 13px;
        line-height: 2;
        letter-spacing: 0.08em;
        opacity: 0.5;
      }

      /* 极简 INS 风格卡片设计 */
      .moment-card {
        display: flex;
        flex-direction: column;
        background: transparent;
        border-bottom: 1px solid rgba(var(--color-border-rgb, 255, 255, 255), 0.05);
        padding-bottom: 24px;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 16px 10px 16px;
      }
      .card-author {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .author-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--color-bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 500;
        color: var(--color-text-secondary);
        border: 1px solid var(--color-border);
      }
      .author-name {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .card-timer {
        font-size: 10px;
        color: var(--color-text-secondary);
        opacity: 0.6;
        font-variant-numeric: tabular-nums;
      }

      .card-image-wrapper {
        position: relative;
        width: 100%;
        background: #000;
        overflow: hidden;
      }
      .card-image {
        display: block;
        width: 100%;
        max-height: 380px;
        object-fit: cover;
        transition: opacity 0.3s;
        filter: brightness(0.85) contrast(1.02); /* 略带复古灰度微调 */
      }

      .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
      }

      /* 用户发表的说明 (Caption) */
      .card-user-caption {
        padding: 0 16px 12px 16px;
        font-size: 13px;
        line-height: 1.6;
        letter-spacing: 0.2px;
      }
      .caption-author {
        font-weight: 600;
        margin-right: 6px;
      }
      .caption-text {
        color: var(--color-text-primary);
        word-break: break-all;
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
        transition: opacity 0.2s, color 0.2s;
      }
      .delete-btn:hover {
        opacity: 1;
        color: var(--color-accent);
      }

      /* INS 风格评论组 */
      .card-interactions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 0 16px;
        margin-top: 4px;
        border-top: 1px solid rgba(var(--color-border-rgb, 255, 255, 255), 0.03);
        padding-top: 12px;
      }
      .interaction-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.6;
      }
      .interaction-content {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 3px;
        flex: 1;
      }
      .interactor-name {
        font-weight: 600;
        margin-right: 6px;
        color: var(--color-text-primary);
      }
      
      /* 行内块状字卡 */
      .card-word-block {
        display: inline-flex;
        align-items: center;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: 11px;
        padding: 1px 5px;
        border-radius: 3px;
        letter-spacing: 0.02em;
        margin: 1px 0;
      }
      .interaction-reaction {
        display: flex;
        align-items: center;
        color: var(--color-text-secondary);
        opacity: 0.5;
        padding-left: 10px;
        flex-shrink: 0;
      }
      .reaction-heart {
        color: #d85c5c;
      }

      /* 悬浮上传相机按钮 (微调为玻璃底座与线条色) */
      .moment-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--glass-bg);
        backdrop-filter: blur(var(--glass-blur));
        -webkit-backdrop-filter: blur(var(--glass-blur));
        border: 1px solid var(--color-border);
        color: var(--color-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px var(--color-shadow);
        cursor: pointer;
        z-index: 99;
        transition: transform 0.2s;
      }
      .moment-fab:active {
        transform: scale(0.9);
      }

      /* 遮罩面板 */
      .moment-sheet-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 1000;
        display: none;
        align-items: flex-end;
      }
      .moment-sheet {
        width: 100%;
        max-width: 480px;
        margin: 0 auto;
        background: var(--color-bg);
        border-top-left-radius: 16px;
        border-top-right-radius: 16px;
        border-top: 1px solid var(--color-border);
        animation: slideUp 0.35s cubic-bezier(0.15, 0.85, 0.6, 1);
        padding-bottom: env(safe-area-inset-bottom);
      }
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      .sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
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
        gap: 16px;
      }
      .photo-picker-box {
        width: 100%;
        aspect-ratio: 4/3;
        border: 1px dashed var(--color-border);
        border-radius: 8px;
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
        gap: 8px;
        color: var(--color-text-secondary);
        font-size: 12px;
        opacity: 0.6;
      }
      #photo-picker-preview {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      /* 文字输入框 */
      .moment-caption-input {
        width: 100%;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        color: var(--color-text);
        border-radius: 6px;
        padding: 10px;
        font-size: 13px;
        font-family: inherit;
        resize: none;
        outline: none;
      }
      .moment-caption-input::placeholder {
        color: var(--color-text-secondary);
        opacity: 0.6;
      }

      .expiry-selector {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 4px;
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
        padding: 5px 12px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      }
      .expiry-opt-btn.active {
        border-color: var(--color-accent);
        color: var(--color-accent);
        background: rgba(var(--color-accent-rgb, 200, 200, 200), 0.06);
      }
      .moment-submit-btn {
        width: 100%;
        background: var(--color-text);
        color: var(--color-bg);
        border: none;
        padding: 12px;
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

  // 初始化 DOM 元素引用
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

  // 加载数据与渲染列表
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
      // 查询当前可展示的角色评论 (已到达计划展示时间 scheduledTime <= now)
      const interactions = await db.momentInteractions
        .where('momentId')
        .equals(m.id)
        .filter(item => item.scheduledTime <= now)
        .toArray();

      const timeStr = formatCountdown(m.expiryTimestamp);

      // 用户自己的文字描述区域
      const userCaptionHtml = m.content ? `
        <div class="card-user-caption">
          <span class="caption-author">我</span>
          <span class="caption-text">${escapeHtml(m.content)}</span>
        </div>
      ` : '';

      // 组装评论列表的 html
      let commentsHtml = '';
      if (interactions.length > 0) {
        commentsHtml = `
          <div class="card-interactions">
            ${interactions.map(item => {
              const reactionIconSvg = SVG_ICONS[item.reactionIcon] || SVG_ICONS.star;
              return `
                <div class="interaction-row">
                  <div class="interaction-content">
                    <span class="interactor-name">${escapeHtml(item.characterName)}</span>
                    ${(item.fragments || []).map(word => `<span class="card-word-block">${escapeHtml(word)}</span>`).join('')}
                  </div>
                  <div class="interaction-reaction" title="态度">
                    ${reactionIconSvg}
                  </div>
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
            <img class="card-image" src="${m.image}" alt="瞬间" loading="lazy" />
          </div>
          ${userCaptionHtml}
          <div class="card-footer">
            <button class="delete-btn" data-act="delete" data-id="${m.id}" title="擦除此瞬间">
              ${SVG_ICONS.trash}
            </button>
          </div>
          ${commentsHtml}
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

  // 绑定事件：关闭上传抽屉
  const resetUploadForm = () => {
    uploadSheet.style.display = 'none';
    fileInput.value = '';
    previewImg.style.display = 'none';
    previewImg.src = '';
    placeholder.style.display = 'flex';
    selectedImageDataUrl = null;
    captionInput.value = '';
    btnSubmit.disabled = true;
  };
  btnSheetClose.addEventListener('click', resetUploadForm);

  // 绑定事件：拉起文件选择器
  photoPicker.addEventListener('click', () => {
    fileInput.click();
  });

  // 绑定事件：图片文件选择与压缩
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
      btnSubmit.innerText = '留存片刻';
    } catch (err) {
      console.error(err);
      alert('图片压缩失败，请重试');
      btnSubmit.innerText = '留存片刻';
      btnSubmit.disabled = true;
    }
  });

  // 绑定事件：选择有效期
  expiryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      expiryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedExpiryHours = parseInt(btn.dataset.hours, 10);
    });
  });

  // 绑定事件：提交片刻
  btnSubmit.addEventListener('click', async () => {
    if (!selectedImageDataUrl) return;

    btnSubmit.disabled = true;
    btnSubmit.innerText = '定格中...';

    try {
      await addMoment(selectedImageDataUrl, captionInput.value, selectedExpiryHours);
      resetUploadForm();
      await render(root);
    } catch (err) {
      console.error(err);
      alert('发布失败，请重试');
      btnSubmit.disabled = false;
      btnSubmit.innerText = '留存片刻';
    }
  });

  // 绑定事件：删除片刻操作
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

  // 核心功能：首次渲染并启动倒计时高频计时器
  await refreshFeed();

  // 启动 15 秒更新一次的计时器，自动刷新倒计时并执行物理过期清理
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
