import { db } from './db.js';
import { randInt, pick } from './utils.js';

export async function getFragmentsForCharacter(characterId) {
  const char = await db.characters.get(characterId);
  if (!char) return [];

  const linkedIds = Array.isArray(char.linkedDeckIds) ? char.linkedDeckIds : [];
  let decks = [];

  if (linkedIds.length) {
    decks = await db.decks.where('id').anyOf(linkedIds).toArray();
  }
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

export function generateMessages(fragments, config = {}) {
  if (!fragments || !fragments.length) return [];

  const minMsgs = Math.max(1, config.minMsgs ?? 1);
  const maxMsgs = Math.max(minMsgs, config.maxMsgs ?? 2);
  const comboChance = Math.min(1, Math.max(0, config.comboChance ?? 0.25));
  const minCombo = Math.max(1, config.minCombo ?? 2);
  const maxCombo = Math.max(minCombo, config.maxCombo ?? 3);
  const pureRandom = !!config.pureRandom;
  const joiner = typeof config.joiner === 'string' ? config.joiner : '';

  const msgCount = randInt(minMsgs, maxMsgs);
  const out = [];

  for (let i = 0; i < msgCount; i++) {
    const cc = pureRandom ? Math.random() : comboChance;
    const combine = Math.random() < cc;
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

export const DEFAULT_THINKING_HINTS = [
  '正在深思熟虑…',
  '正在挑选字卡…',
  '似乎遇到了难题…',
  '正在斟酌措辞…',
];

export const DEFAULT_SKIP_HINTS = [
  '对方无视了这条消息',
  '对方跳过了这条消息',
  '对方看了看，没说话',
  '似乎没有回应的心情',
];

// 共时提示（罕见事件，2% 概率触发）
export const DEFAULT_SYNC_HINTS = [
  '这一刻，你们同时想起了对方',
  '宇宙悄悄记下了这条消息',
  '有什么东西正穿过时间靠近',
  '两颗心在此刻共振',
  '同频的信号被听见了',
  '一阵微风路过，好像带来了回音',
];

// 共时触发概率（可在角色 replyConfig.syncChance 里覆盖）
export const DEFAULT_SYNC_CHANCE = 0.02;
