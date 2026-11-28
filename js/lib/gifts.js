import { db } from '../db.js';

export const GIFT_PREFIXES = ['礼物：', '礼物:', 'gift:'];
export const GIFT_ICONS = ['box', 'flower', 'letter', 'cup', 'moon', 'star', 'book', 'camera'];

export function parseGiftFragment(text) {
  const raw = String(text || '').trim();
  const prefix = GIFT_PREFIXES.find((item) => raw.toLowerCase().startsWith(item.toLowerCase()));
  if (!prefix) return null;
  const parts = raw.slice(prefix.length).split('|').map((item) => item.trim());
  const name = parts[0] || '';
  if (!name) return null;
  return { name, description: parts[1] || '', icon: GIFT_ICONS.includes(parts[2]) ? parts[2] : 'box' };
}

export async function listGiftTemplates() {
  return db.giftTemplates.orderBy('updatedAt').reverse().toArray();
}

export async function saveGiftTemplate(template) {
  const name = String(template && template.name || '').trim();
  if (!name) throw new Error('请先填写礼物名称');
  const now = Date.now();
  const payload = {
    name: name.slice(0, 32),
    description: String(template.description || '').trim().slice(0, 120),
    icon: GIFT_ICONS.includes(template.icon) ? template.icon : 'box',
    updatedAt: now,
  };
  if (template.id) {
    await db.giftTemplates.update(template.id, payload);
    return { ...template, ...payload };
  }
  const id = await db.giftTemplates.add({ ...payload, createdAt: now });
  return { id, ...payload, createdAt: now };
}

export async function deleteGiftTemplate(id) {
  if (id) await db.giftTemplates.delete(id);
}
