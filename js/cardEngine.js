import { db } from './db.js';
import { randInt, pick } from './utils.js';

// 汇总某角色可用的所有字卡碎片
export async function getFragmentsForCharacter(characterId) {
  const char = await db.characters.get(characterId);
  if (!char) return [];

  const linkedIds = Array.isArray(char.linkedDeckIds) ? char.linkedDeckIds : [];
  let decks = [];

  if (linkedIds.length) {
    decks = await db.decks.where('id').anyOf(linkedIds).toArray();
  }
  // 如果角色没绑定任何字卡库，回退到通用库（bindCharacterId 为空的）
  if (!decks.length) {
    decks = await db.decks.filter((d) => !d.bindCharacterId).toArray();
  }

  const bag = [];
  decks.forEach((d) => {
    (d.fragments || []).forEach((f) => {
      const t = (f || '').trim();
      if (t) bag.push(t);
    });
  });
  return bag;
}

// 从碎片池中生成一批消息（纯随机）
export function generateMessages(fragments, config = {}) {
  if (!fragments || !fragments.length) return [];

  const minMsgs = Math.max(1, config.minMsgs ?? 1);
  const maxMsgs = Math.max(minMsgs, config.maxMsgs ?? 2);
  const comboChance = Math.min(1, Math.max(0, config.comboChance ?? 0.25));
  const minCombo = Math.max(1, config.minCombo ?? 2);
  const maxCombo = Math.max(minCombo, config.maxCombo ?? 3);
  const joiner = typeof config.joiner === 'string' ? config.joiner : '';

  const msgCount = randInt(minMsgs, maxMsgs);
  const out = [];

  for (let i = 0; i < msgCount; i++) {
    const combine = Math.random() < comboChance;
    const parts = combine ? randInt(minCombo, maxCombo) : 1;
    const buf = [];
    for (let j = 0; j < parts; j++) buf.push(pick(fragments));
    out.push(buf.join(joiner));
  }
  return out;
}

export async function generateForCharacter(characterId) {
  const char = await db.characters.get(characterId);
  if (!char) return { messages: [], reason: 'no_character' };
  const fragments = await getFragmentsForCharacter(characterId);
  if (!fragments.length) return { messages: [], reason: 'no_fragments' };
  const messages = generateMessages(fragments, char.replyConfig || {});
  return { messages, reason: 'ok' };
}
