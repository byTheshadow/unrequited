
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

  // 3. 动态触发角色回应（例如 1~8 秒内）
  setTimeout(async () => {
    try {
      const activeChar = await db.characters.toArray();
      if (!activeChar || activeChar.length === 0) return;
      
      const numInteractions = Math.min(activeChar.length, Math.floor(Math.random() * 2) + 1);
      const shuffled = [...activeChar].sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < numInteractions; i++) {
        const char = shuffled[i];
        const delay = (i + 1) * (1000 + Math.random() * 2000);
        
        const reactionIcons = ['like', 'sparkle', 'star', 'moon'];
        const randomIcon = reactionIcons[Math.floor(Math.random() * reactionIcons.length)];
        
        const possibleFragments = ['好美', '这一刻', '定格', '记录', '光影', '温柔', '日常', '心动', '瞬间', '流逝'];
        const randomFragments = [];
        const fragCount = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < fragCount; j++) {
          const w = possibleFragments[Math.floor(Math.random() * possibleFragments.length)];
          if (!randomFragments.includes(w)) randomFragments.push(w);
        }

        await db.momentInteractions.add({
          momentId: momentId,
          characterId: char.id,
          characterName: char.name,
          reactionIcon: randomIcon,
          fragments: randomFragments,
          scheduledTime: Date.now() + delay
        });
      }
    } catch (e) {
      console.error('自动分配评价报错', e);
    }
  }, 100);
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
      <!-- 极简悬浮返回按钮 -->
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

      <!-- 全新全屏重构：Instagram Story 编辑风格的上传弹窗 -->
      <div class="moment-sheet-overlay" id="moment-upload-sheet">
        <div class="story-editor-container">
          
          <!-- 主预览及创作区 -->
          <div class="story-editor-main" id="photo-picker-trigger">
            <input type="file" id="moment-file-input" accept="image/*" style="display: none;" />
            
            <!-- 占位提示符（未选择图片时） -->
            <div class="picker-placeholder" id="picker-placeholder">
              <div class="picker-camera-icon">${SVG_ICONS.camera}</div>
              <span>选择此刻的一幅画面</span>
            </div>

            <!-- 背景预览大图 -->
            <img id="photo-picker-preview" src="" style="display: none;" />
            
            <!-- 顶部悬浮工具栏 -->
            <div class="story-top-tools">
              <button class="tool-btn" id="btn-sheet-close" type="button" title="关闭">
                ${SVG_ICONS.close}
              </button>
              
              <div class="right-tools-col" id="editor-tools-group" style="display: none;">
                <button class="tool-btn" style="font-weight: bold; font-size: 15px;">Aa</button>
                <button class="tool-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                </button>
                <button class="tool-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                </button>
                <button class="tool-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"></path></svg>
                </button>
                <button class="tool-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>
                <button class="tool-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
            </div>

            <!-- 底部悬浮文案输入框 -->
            <div class="caption-input-wrapper" id="caption-wrapper" style="display: none;">
              <input type="text" id="moment-caption-input" placeholder="キャプションを追加..." maxlength="150" autocomplete="off" />
            </div>
          </div>

          <!-- 最底部操作控制栏 -->
          <div class="story-bottom-actions">
            <!-- 触发重新选图/显示状态 -->
            <button class="action-pill-btn" id="btn-story-select-trigger" type="button">
              <div class="action-icon-circle">
                <span style="font-size: 10px; font-weight: bold;">私</span>
              </div>
              <span id="txt-story-stories-btn">ストーリーズ</span>
            </button>
            
            <!-- 保质期选择（复用密友UI，点击循环切换 24h -> 48h） -->
            <button class="action-pill-btn" id="btn-story-expiry-toggle" type="button">
              <div class="action-icon-circle green-star-bg">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </div>
              <span id="txt-expiry-label">保质期 24h</span>
            </button>
            
            <!-- 发送/发布 -->
            <button class="send-btn" id="btn-moment-submit" disabled type="button">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>

        </div>
      </div>
    </div>

    <style>
      .moment-container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
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
        opacity: 0.8;
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
        filter: brightness(0.85) contrast(1.02);
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
        color: var(--color-accent);
      }

      /* 自定义文字配文区 (Caption) */
      .card-caption {
        font-size: 13px;
        line-height: 1.5;
        color: var(--color-text-primary);
        padding: 2px 4px 8px 4px;
        letter-spacing: 0.02em;
        border-bottom: 1px solid var(--color-border);
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
        background: var(--color-bg-tertiary);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: 10.5px;
        padding: 1px 5px;
        border-radius: 4px;
        margin-right: 3px;
      }

      /* 原悬浮上传按钮 */
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
        box-shadow: 0 4px 16px var(--color-shadow);
        cursor: pointer;
        z-index: 90;
        transition: transform 0.2s;
      }
      .moment-fab:active {
        transform: scale(0.9);
      }

      /* ======================================================== */
      /* 全屏 Instagram Story 界面重构样式                       */
      /* ======================================================== */
      .moment-sheet-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        z-index: 100;
        display: none;
        flex-direction: column;
        box-sizing: border-box;
      }
      
      .story-editor-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-width: 480px;
        margin: 0 auto;
        background: #000;
        box-sizing: border-box;
        overflow: hidden;
      }

      /* 上方主编辑画板区 */
      .story-editor-main {
        flex: 1;
        margin: 12px 10px 0 10px;
        border-radius: 16px;
        background-color: #151515;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.05);
        cursor: pointer;
      }

      /* 预览图片填充整卡 */
      #photo-picker-preview {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
      }

      /* 点击上传提示 */
      .picker-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        color: #888;
        font-size: 13px;
        letter-spacing: 0.05em;
        z-index: 2;
        pointer-events: none;
      }
      .picker-camera-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #aaa;
      }

      /* 顶部状态与工具组 */
      .story-top-tools {
        position: absolute;
        top: 16px;
        left: 16px;
        right: 16px;
        display: flex;
        justify-content: space-between;
        z-index: 10;
        pointer-events: none;
      }
      .story-top-tools button {
        pointer-events: auto; /* 让子控件可以被点击 */
      }

      /* 圆形毛玻璃按钮 */
      .tool-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background-color: rgba(0, 0, 0, 0.45);
        border: none;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .tool-btn:active {
        transform: scale(0.92);
      }

      /* 右侧功能堆叠 */
      .right-tools-col {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* 悬浮文案输入 */
      .caption-input-wrapper {
        position: absolute;
        bottom: 24px;
        left: 16px;
        right: 16px;
        z-index: 10;
      }
      .caption-input-wrapper input {
        width: 100%;
        background: transparent;
        border: none;
        color: #fff;
        font-size: 15px;
        outline: none;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        caret-color: #4a8bff;
      }
      .caption-input-wrapper input::placeholder {
        color: rgba(255, 255, 255, 0.7);
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
      }

      /* 底部控制栏 */
      .story-bottom-actions {
        padding: 14px 10px 24px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        background-color: #000;
        z-index: 11;
      }

      /* 胶囊状发布端按钮 */
      .action-pill-btn {
        flex: 1;
        height: 44px;
        background-color: #1e1e1e;
        border: none;
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #fff;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .action-pill-btn:active {
        background-color: #2b2b2b;
      }

      /* 胶囊小圆圈 */
      .action-icon-circle {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background-color: #444;
        color: #fff;
      }
      .green-star-bg {
        background-color: #00d856;
      }

      /* 发送大蓝圆钮 */
      .send-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background-color: #4a8bff;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s, opacity 0.2s;
      }
      .send-btn:disabled {
        background-color: #2b2b2b;
        opacity: 0.5;
        cursor: not-allowed;
      }
      .send-btn:active:not(:disabled) {
        transform: scale(0.92);
      }
      .send-btn svg {
        color: #fff;
      }
    </style>
  `;

  const feedList = root.querySelector('#moment-feed-list');
  const btnBack = root.querySelector('#btn-moment-back');
  const btnUploadTrigger = root.querySelector('#btn-moment-upload-trigger');
  const uploadSheet = root.querySelector('#moment-upload-sheet');
  
  // 重构后的控件绑定
  const btnSheetClose = root.querySelector('#btn-sheet-close');
  const photoPicker = root.querySelector('#photo-picker-trigger');
  const fileInput = root.querySelector('#moment-file-input');
  const previewImg = root.querySelector('#photo-picker-preview');
  const placeholder = root.querySelector('#picker-placeholder');
  const btnSubmit = root.querySelector('#btn-moment-submit');
  
  const btnExpiryToggle = root.querySelector('#btn-story-expiry-toggle');
  const txtExpiryLabel = root.querySelector('#txt-expiry-label');
  const btnSelectTrigger = root.querySelector('#btn-story-select-trigger');
  
  const captionInput = root.querySelector('#moment-caption-input');
  const captionWrapper = root.querySelector('#caption-wrapper');
  const editorToolsGroup = root.querySelector('#editor-tools-group');
  const txtStoriesBtn = root.querySelector('#txt-story-stories-btn');

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
    
    // 还原上传状态下的工具栏和配置
    editorToolsGroup.style.display = 'none';
    captionWrapper.style.display = 'none';
    txtStoriesBtn.textContent = 'ストーリーズ';
  };
  btnSheetClose.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止向父容器传递触发重新选图
    resetUploadForm();
  });

  // 绑定事件：拉起相册 (点击主卡片区域或左下角胶囊按钮)
  const triggerFileSelection = (e) => {
    // 阻止非点击自身或子区域的冒泡导致反复弹窗
    if (e.target.tagName === 'INPUT' || e.target.closest('.tool-btn') || e.target.closest('#moment-caption-input') || e.target.closest('#btn-story-expiry-toggle') || e.target.closest('#btn-moment-submit')) {
      return;
    }
    fileInput.click();
  };
  photoPicker.addEventListener('click', triggerFileSelection);
  btnSelectTrigger.addEventListener('click', triggerFileSelection);

  // 绑定事件：选择与压缩
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      btnSubmit.disabled = true;
      txtStoriesBtn.textContent = '圧縮中...';
      const compressed = await compressImage(file);
      selectedImageDataUrl = compressed;
      previewImg.src = compressed;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      
      // 显示故事相关的附加功能 (Aa特效组、写配文输入框)
      editorToolsGroup.style.display = 'flex';
      captionWrapper.style.display = 'block';
      
      btnSubmit.disabled = false;
      txtStoriesBtn.textContent = 'ストーリーズ';
    } catch (err) {
      console.error(err);
      alert('图片压缩失败，请重试');
      txtStoriesBtn.textContent = 'エラー';
      btnSubmit.disabled = true;
    }
  });

  // 选择时效：点击保质期胶囊（绿星按钮），在 24h 与 48h 之间快速来回切换
  btnExpiryToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedExpiryHours === 24) {
      selectedExpiryHours = 48;
      txtExpiryLabel.textContent = '保质期 48h';
    } else {
      selectedExpiryHours = 24;
      txtExpiryLabel.textContent = '保质期 24h';
    }
  });

  // 提交片刻 (右下角大蓝按钮)
  btnSubmit.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!selectedImageDataUrl) return;

    btnSubmit.disabled = true;
    txtStoriesBtn.textContent = 'アップロード中...';

    const caption = captionInput.value.trim();

    try {
      await addMoment(selectedImageDataUrl, caption, selectedExpiryHours);
      resetUploadForm();
      await render(root);
    } catch (err) {
      console.error(err);
      alert('发布失败，请重试');
      btnSubmit.disabled = false;
      txtStoriesBtn.textContent = 'ストーリーズ';
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
