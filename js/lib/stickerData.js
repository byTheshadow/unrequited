// 表情包常量：限制、文案、角色回复池。
// 内容规范：不出现 emoji，图标一律走内联 SVG。

export const STICKER_LIMITS = {
  maxPacks: 20,
  maxPerPack: 60,
  maxRecent: 20,
  textMax: 12,
  packNameMax: 24,
  staticFileBytes: 20 * 1024 * 1024,
  gifBytes: 2 * 1024 * 1024,
  importFileBytes: 20 * 1024 * 1024,
  imageBytes: 3 * 1024 * 1024,
  encodedBytes: 200 * 1024,
  staticSize: 320,
  quality: 0.8,
  panelHeight: 286,
};

export const DEFAULT_PACK_NAME = '我的表情';

// 角色拼完时，独立掷一张表情的概率；与文字是否出现无关。
export const STICKER_REPLY_STICKER_CHANCE = 0.4;

export const STICKER_COPY = {
  panelTitle: '表情包',
  empty: '还没有表情包',
  emptyHint: '导入一张图，给它配一句话',
  addPack: '新建表情包',
  importPack: '导入表情包',
  exportPack: '导出',
  deletePack: '删除',
  characterPack: '角色用哪一包',
  deleted: '表情已删除',
  tooManyPacks: `最多 ${STICKER_LIMITS.maxPacks} 个表情包`,
  tooManyStickers: `每个包最多 ${STICKER_LIMITS.maxPerPack} 张`,
  gifTooLarge: 'GIF 不能超过 2MB',
  imageTooLarge: '图片不能超过 20MB',
  textRequired: '给这张表情写一句话',
  textTooLong: `文字最多 ${STICKER_LIMITS.textMax} 个字`,
  storageFull: '存储空间不足，先删一些表情',
  badFile: '不是有效的表情包文件',
  noFile: '请选择一张图片',
};
