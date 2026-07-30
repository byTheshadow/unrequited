import Dexie from 'https://cdn.jsdelivr.net/npm/dexie@4.0.8/+esm';

export const db = new Dexie('UnrequitedDB');

db.version(1).stores({
  user: '++id',
  characters: '++id, name, createdAt',
  conversations: '++id, characterId, pinned, lastMessageTime',
  messages: '++id, conversationId, timestamp, sender',
  decks: '++id, name, bindCharacterId, createdAt',
  divinationHistory: '++id, type, timestamp',
  statusPool: '++id',
  settings: 'key'
});

export async function initDB() {
  await db.open();

  const userCount = await db.user.count();
  if (userCount === 0) {
    await db.user.add({
      name: '我',
      avatar: '',
      status: '',
      signature: ''
    });
  }
  return db;
}
