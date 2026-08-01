import { db } from '../db.js';
import { generateForCharacter } from '../cardEngine.js';
import { formatTime } from '../utils.js';

export const MissManager = {
  getRandomInterval() {
    const minHours = 12;
    const maxHours = 36;
    return (minHours + Math.random() * (maxHours - minHours)) * 60 * 60 * 1000;
  },

  async init() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {
        console.warn('Notification permission request failed:', e);
      }
    }

    await this.checkMisses();

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.checkMisses();
      }
    });
  },

  async checkMisses() {
    try {
      const characters = await db.characters.toArray();
      const now = Date.now();

      for (const char of characters) {
        if (!char.nextMissTime) {
          await db.characters.update(char.id, {
            nextMissTime: now + this.getRandomInterval()
          });
          continue;
        }

        if (now >= char.nextMissTime) {
          await this.triggerMiss(char, char.nextMissTime);

          await db.characters.update(char.id, {
            nextMissTime: now + this.getRandomInterval()
          });
        }
      }
    } catch (err) {
      console.warn('Failed to check miss schedule:', err);
    }
  },

  async triggerMiss(character, triggerTimestamp) {
    try {
      let thoughts = '想念起了一些碎片...';

      const result = await generateForCharacter(character.id, {
        allowChoice: false
      });

      if (result.messages && result.messages.length) {
        thoughts = result.messages[0];
      }

      await db.missRecords.add({
        characterId: character.id,
        timestamp: triggerTimestamp,
        fragment: thoughts,
        isRead: 0
      });

      const conversation = await db.conversations
        .where('characterId')
        .equals(character.id)
        .first();

      if (conversation) {
        const timeStr = formatTime(triggerTimestamp);

        await db.messages.add({
          conversationId: conversation.id,
          timestamp: triggerTimestamp,
          sender: 'system',
          content: `◈ ${timeStr} ${character.name} 轻轻触碰了想念箱，留下了一缕思绪。`,
          type: 'system'
        });

        await db.conversations.update(conversation.id, {
          lastMessageTime: triggerTimestamp,
          lastMessage: '◈ 留下一缕思绪'
        });

        window.dispatchEvent(new CustomEvent('call-history-updated', {
          detail: { conversationId: conversation.id }
        }));
      }

      if (
        document.visibilityState !== 'visible' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${character.name} 刚刚想念了你一下`, {
          body: '想念箱里落入了一缕新的思绪...',
          icon: character.avatar || './icons/icon.svg'
        });
      }

      window.dispatchEvent(new CustomEvent('miss-box-updated'));
    } catch (err) {
      console.warn('Trigger miss failed:', err);
    }
  }
};
