import { db } from '../db.js';
import { generateForCharacter } from '../cardEngine.js';
import { randInt } from '../utils.js';

/**
 * 群聊随机参数。
 *
 * 这里没有任何 AI、没有网络请求、没有语义判断：
 * 每个成员各自掷骰子，命中就说话，内容只从自己的字卡库里随机抽。
 */
export const GROUP = {
  replyChance: 0.5,      // 你发一条后，每个成员各自 50% 会回
  awayChance: 0.25,      // 你不在时，每个成员各自 25% 留过话
  quoteChance: 0.3,      // 回复时引用上一条
  recallChance: 0.08,    // 发出后撤回
  stopChance: 0.25,      // 别人先开口后，正在输入的人停下
  minDelayMs: 1500,
  maxDelayMs: 6000,
  minTypingMs: 1200,
  maxTypingMs: 3500,
  awayWindowMs: 3 * 60 * 60 * 1000, // 离场对话落在过去 3 小时里
};

/** 从角色的字卡库随机取 1–2 条碎片；只走字卡引擎，不做任何生成。 */
export async function generateForMember(member, { max = 2 } = {}) {
  if (!member) return [];
  const res = await generateForCharacter(member.id, { allowChoice: false });
  const raw = (res && res.messages) || [];
  const texts = raw
    .map((m) => (typeof m === 'string' ? m : (m && m.content) || ''))
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  return texts.slice(0, max);
}

function orderedMembers(conv, all) {
  const ids = Array.isArray(conv.memberIds) ? conv.memberIds : [];
  const map = new Map(all.map((c) => [c.id, c]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

/**
 * 每次启动 App 调用一次：每个群、每个成员各自掷骰。
 * 不看你离开了多久，也不看最后一条是谁说的。
 */
export async function runAwayChat() {
  let total = 0;
  try {
    const convs = await db.conversations.filter((c) => c.type === 'group').toArray();
    if (!convs.length) return 0;

    const now = Date.now();

    for (const conv of convs) {
      const ids = Array.isArray(conv.memberIds) ? conv.memberIds : [];
      if (!ids.length) continue;

      const all = await db.characters.where('id').anyOf(ids).toArray();
      const members = orderedMembers(conv, all);
      if (!members.length) continue;

      const lastAt = Number(conv.lastMessageTime) || Number(conv.createdAt) || 0;
      const earliest = Math.max(lastAt, now - GROUP.awayWindowMs);
      if (now - earliest < 60 * 1000) continue;

      const rows = [];
      for (const member of members) {
        if (Math.random() >= GROUP.awayChance) continue;
        const texts = await generateForMember(member, { max: randInt(1, 2) });
        for (const text of texts) {
          rows.push({
            conversationId: conv.id,
            sender: 'character',
            senderCharacterId: member.id,
            content: text,
            type: 'card',
            status: 'sent',
            quotedMessageId: null,
            timestamp: earliest + Math.random() * (now - earliest),
            isRead: false,
          });
        }
      }

      if (!rows.length) continue;

      rows.sort((a, b) => a.timestamp - b.timestamp);

      for (const row of rows) {
        await db.messages.add(row);
      }

      const last = rows[rows.length - 1];
      const speaker = members.find((m) => m.id === last.senderCharacterId);
      await db.conversations.update(conv.id, {
        lastMessage: `${speaker ? speaker.name : ''}：${last.content}`,
        lastMessageTime: last.timestamp,
      });

      total += rows.length;
    }
  } catch (e) {
    console.warn('群聊离场结算失败：', e);
  }
  return total;
}
