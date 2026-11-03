// 表情包数据层：压缩、包/表情 CRUD、最近使用、角色包、单包导入导出。
// 图片按 dataURL 存 IndexedDB，现有全量备份（JSON.stringify）可以直接带走。

import { db } from '../db.js';
import {
  STICKER_LIMITS,
  DEFAULT_PACK_NAME,
} from './stickerData.js';

const KEY_CHARACTER_PACK = 'sticker.characterPackId';
const KEY_RECENT = 'sticker.recent';
const PACK_FILE_FORMAT = 'unrequited-sticker-pack';
const PACK_FILE_VERSION = 1;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:webp|gif|jpeg|png));base64,/i;

/* ---------- 设置读写 ---------- */

async function readSetting(key, fallback) {
  const row = await db.settings.get(key);
  return row && row.value !== undefined ? row.value : fallback;
}

async function writeSetting(key, value) {
  await db.settings.put({ key, value });
}

/* ---------- 小工具 ---------- */

export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const i = dataUrl.indexOf(',');
  if (i < 0) return 0;
  return Math.floor(((dataUrl.length - i - 1) * 3) / 4);
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeStickerText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, STICKER_LIMITS.textMax);
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function imageFromDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = dataUrl;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // Safari 老版本 / 部分 HEIC 会失败，回退到 Image
    }
  }
  const dataUrl = await readAsDataURL(file);
  return imageFromDataURL(dataUrl);
}

/* ---------- 压缩 ---------- */

export async function compressStickerFile(file) {
  if (!file) throw new Error('请选择一张图片');

  const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
  if (isGif) {
    if (file.size > STICKER_LIMITS.gifBytes) throw new Error('GIF 不能超过 2MB');
    const image = await readAsDataURL(file);
    const img = await imageFromDataURL(image);
    return {
      image,
      mime: 'image/gif',
      width: img.width,
      height: img.height,
      animated: true,
      bytes: dataUrlBytes(image),
    };
  }

  if (file.type && !file.type.startsWith('image/')) throw new Error('请选择一张图片');
  if (file.size > STICKER_LIMITS.staticFileBytes) throw new Error('图片不能超过 20MB');

  const src = await decodeImage(file);
  const w = src.width || src.naturalWidth || 0;
  const h = src.height || src.naturalHeight || 0;
  if (!w || !h) throw new Error('图片解码失败');

  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  const size = STICKER_LIMITS.staticSize;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  if (typeof src.close === 'function') src.close();

  let image = '';
  let mime = 'image/webp';
  const qualities = [STICKER_LIMITS.quality, 0.7, 0.6];
  for (const q of qualities) {
    image = canvas.toDataURL('image/webp', q);
    if (!image.startsWith('data:image/webp')) {
      mime = 'image/jpeg';
      image = canvas.toDataURL('image/jpeg', q + 0.05);
    }
    if (dataUrlBytes(image) <= STICKER_LIMITS.encodedBytes) break;
  }

  const bytes = dataUrlBytes(image);
  if (bytes > STICKER_LIMITS.encodedBytes) throw new Error('图片压缩后仍然太大，换一张试试');

  return { image, mime, width: size, height: size, animated: false, bytes };
}

/* ---------- 包 ---------- */

export async function listPacks() {
  return db.stickerPacks.orderBy('createdAt').toArray();
}

export async function getPack(id) {
  return db.stickerPacks.get(Number(id));
}

export async function countPacks() {
  return db.stickerPacks.count();
}

export async function createPack(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, STICKER_LIMITS.packNameMax);
  if (!clean) throw new Error('给表情包起个名字');
  if ((await db.stickerPacks.count()) >= STICKER_LIMITS.maxPacks) {
    throw new Error(`最多 ${STICKER_LIMITS.maxPacks} 个表情包`);
  }
  const now = Date.now();
  const id = await db.stickerPacks.add({
    name: clean,
    kind: 'user',
    createdAt: now,
    updatedAt: now,
  });
  return { id, name: clean, kind: 'user', createdAt: now, updatedAt: now };
}

export async function ensureDefaultPack() {
  const packs = await listPacks();
  if (packs.length) return packs[0];
  return createPack(DEFAULT_PACK_NAME);
}

export async function deletePack(packId) {
  const id = Number(packId);
  await db.transaction('rw', [db.stickerPacks, db.stickers, db.settings], async () => {
    const rows = await db.stickers.where('packId').equals(id).toArray();
    const removed = new Set(rows.map((r) => r.id));
    for (const row of rows) await db.stickers.delete(row.id);
    await db.stickerPacks.delete(id);

    const current = await readSetting(KEY_CHARACTER_PACK, null);
    if (Number(current) === id) await writeSetting(KEY_CHARACTER_PACK, null);

    const recent = await readSetting(KEY_RECENT, []);
    if (Array.isArray(recent) && recent.some((rid) => removed.has(rid))) {
      await writeSetting(KEY_RECENT, recent.filter((rid) => !removed.has(rid)));
    }
  });
}

/* ---------- 表情 ---------- */

export async function listStickers(packId) {
  return db.stickers.where('packId').equals(Number(packId)).sortBy('createdAt');
}

export async function getPackCover(packId) {
  const row = await db.stickers.where('packId').equals(Number(packId)).first();
  return row || null;
}

export async function getSticker(id) {
  return db.stickers.get(Number(id));
}

export async function addSticker(packId, text, file) {
  const pack = await getPack(packId);
  if (!pack) throw new Error('表情包不存在');
  const count = await db.stickers.where('packId').equals(pack.id).count();
  if (count >= STICKER_LIMITS.maxPerPack) {
    throw new Error(`每个包最多 ${STICKER_LIMITS.maxPerPack} 张`);
  }
  const clean = normalizeStickerText(text);
  if (!clean) throw new Error('给这张表情写一句话');

  const media = await compressStickerFile(file);
  const now = Date.now();
  const row = {
    packId: pack.id,
    text: clean,
    image: media.image,
    mime: media.mime,
    width: media.width,
    height: media.height,
    animated: !!media.animated,
    createdAt: now,
    usageCount: 0,
    lastUsedAt: 0,
  };
  const id = await db.stickers.add(row);
  await db.stickerPacks.update(pack.id, { updatedAt: now });
  return { ...row, id };
}

export async function deleteSticker(stickerId) {
  const id = Number(stickerId);
  await db.transaction('rw', [db.stickers, db.settings], async () => {
    await db.stickers.delete(id);
    const recent = await readSetting(KEY_RECENT, []);
    if (Array.isArray(recent) && recent.includes(id)) {
      await writeSetting(KEY_RECENT, recent.filter((rid) => rid !== id));
    }
  });
}

export async function getStickersByIds(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!list.length) return [];
  return db.stickers.where('id').anyOf(list).toArray();
}

export async function buildStickerMap(ids) {
  const rows = await getStickersByIds(ids);
  return new Map(rows.map((r) => [r.id, r]));
}

/* ---------- 最近使用 ---------- */

export async function getRecentIds() {
  const value = await readSetting(KEY_RECENT, []);
  return Array.isArray(value) ? value.map(Number).filter((n) => Number.isFinite(n)) : [];
}

export async function getRecentStickers() {
  const ids = (await getRecentIds()).slice(0, STICKER_LIMITS.maxRecent);
  if (!ids.length) return [];
  const rows = await getStickersByIds(ids);
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

export async function markStickerUsed(stickerId) {
  const id = Number(stickerId);
  const row = await db.stickers.get(id);
  if (!row) return;
  await db.stickers.update(id, {
    usageCount: (row.usageCount || 0) + 1,
    lastUsedAt: Date.now(),
  });
  const recent = await getRecentIds();
  const next = [id, ...recent.filter((rid) => rid !== id)].slice(0, STICKER_LIMITS.maxRecent);
  await writeSetting(KEY_RECENT, next);
}

/* ---------- 角色包 ---------- */

export async function getCharacterPackId() {
  const value = await readSetting(KEY_CHARACTER_PACK, null);
  const id = Number(value);
  if (!id) return null;
  const pack = await db.stickerPacks.get(id);
  return pack ? id : null;
}

export async function setCharacterPackId(packId) {
  const id = packId ? Number(packId) : null;
  if (id) {
    const pack = await db.stickerPacks.get(id);
    if (!pack) throw new Error('表情包不存在');
  }
  await writeSetting(KEY_CHARACTER_PACK, id);
}

export async function pickCharacterSticker(excludeId = null) {
  const packId = await getCharacterPackId();
  if (!packId) return null;
  const rows = await listStickers(packId);
  if (!rows.length) return null;
  const pool = rows.filter((r) => r.id !== Number(excludeId));
  const list = pool.length ? pool : rows;
  return list[Math.floor(Math.random() * list.length)];
}

/* ---------- 导入 / 导出 ---------- */

export async function buildPackFile(packId) {
  const pack = await getPack(packId);
  if (!pack) throw new Error('表情包不存在');
  const rows = await listStickers(pack.id);
  const payload = {
    format: PACK_FILE_FORMAT,
    version: PACK_FILE_VERSION,
    name: pack.name,
    exportedAt: Date.now(),
    stickers: rows.map((r) => ({
      text: r.text,
      image: r.image,
      mime: r.mime,
      width: r.width,
      height: r.height,
      animated: !!r.animated,
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > STICKER_LIMITS.importFileBytes) {
    throw new Error('这个包太大了，先删几张再导出');
  }
  return payload;
}

export function validatePackFile(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('不是有效的表情包文件');
  }
  if (json.format !== PACK_FILE_FORMAT) throw new Error('不是有效的表情包文件');
  if (Number(json.version) !== PACK_FILE_VERSION) {
    throw new Error(`不支持的表情包版本：${json.version}`);
  }
  const name = String(json.name || '导入的表情').replace(/\s+/g, ' ').trim().slice(0, STICKER_LIMITS.packNameMax);
  if (!name) throw new Error('表情包缺少名字');

  const list = json.stickers;
  if (!Array.isArray(list) || !list.length) throw new Error('表情包里没有表情');
  if (list.length > STICKER_LIMITS.maxPerPack) {
    throw new Error(`每个包最多 ${STICKER_LIMITS.maxPerPack} 张`);
  }

  const stickers = list.map((item, index) => {
    const text = normalizeStickerText(item && item.text);
    if (!text) throw new Error(`第 ${index + 1} 张缺少文字`);
    const image = item && item.image;
    const match = typeof image === 'string' ? image.match(IMAGE_DATA_URL_RE) : null;
    if (!match) throw new Error(`第 ${index + 1} 张的图片格式不对`);
    if (dataUrlBytes(image) > STICKER_LIMITS.imageBytes) {
      throw new Error(`第 ${index + 1} 张图片太大`);
    }
    const animated = !!item.animated && /gif/i.test(match[1]);
    return {
      text,
      image,
      mime: match[1].toLowerCase(),
      width: Number(item.width) || STICKER_LIMITS.staticSize,
      height: Number(item.height) || STICKER_LIMITS.staticSize,
      animated,
    };
  });

  return { name, stickers };
}

export async function importPackFile(json) {
  const validated = validatePackFile(json);
  if ((await db.stickerPacks.count()) >= STICKER_LIMITS.maxPacks) {
    throw new Error(`最多 ${STICKER_LIMITS.maxPacks} 个表情包`);
  }

  let name = validated.name;
  let suffix = 0;
  while (await db.stickerPacks.where('name').equals(name).first()) {
    suffix += 1;
    const tail = suffix === 1 ? '（导入）' : `（导入${suffix}）`;
    name = validated.name.slice(0, Math.max(1, STICKER_LIMITS.packNameMax - tail.length)) + tail;
  }

  const now = Date.now();
  let packId = null;
  await db.transaction('rw', [db.stickerPacks, db.stickers], async () => {
    packId = await db.stickerPacks.add({
      name,
      kind: 'user',
      createdAt: now,
      updatedAt: now,
    });
    for (let i = 0; i < validated.stickers.length; i++) {
      const s = validated.stickers[i];
      await db.stickers.add({
        packId,
        text: s.text,
        image: s.image,
        mime: s.mime,
        width: s.width,
        height: s.height,
        animated: s.animated,
        createdAt: now + i,
        usageCount: 0,
        lastUsedAt: 0,
      });
    }
  });
  return { id: packId, name, count: validated.stickers.length };
}

/* ---------- 统计 ---------- */

export async function estimatePackBytes(packId) {
  const rows = await listStickers(packId);
  return rows.reduce((sum, r) => sum + dataUrlBytes(r.image), 0);
}

export async function collectStickerIdsFromMessages(messages) {
  return (messages || [])
    .filter((m) => m && m.type === 'sticker' && m.stickerId)
    .map((m) => m.stickerId);
}
