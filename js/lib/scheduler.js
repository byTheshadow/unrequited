import { db } from '../db.js';
import { generateForCharacter } from '../cardEngine.js';
import * as sound from './sound.js';
import { toast } from '../utils.js';

let intervalId = null;

/**
 * 计算下一个随机触发时间点
 * @param {number} minMin 最小间隔（分钟）
 * @param {number} maxMin 最大间隔（分钟）
 * @returns {number} 计划触发时间戳
 */
function calculateNextTime(minMin, maxMin) {
  const randMin = minMin + Math.random() * (maxMin - minMin);
  return Date.now() + randMin * 60 * 1000;
}

/**
 * 检查并触发所有角色的主动消息
 */
async function checkActiveMessages() {
  try {
    const convs = await db.conversations.toArray();
    const now = Date.now();

    for (const conv of convs) {
      const char = await db.characters.get(conv.characterId);
      if (!char) continue;

      const replyConfig = char.replyConfig || {};
      const activeEnabled = !!replyConfig.activeMsgEnabled;
      const minVal = replyConfig.activeMsgMinInterval ?? 60;
      const maxVal = replyConfig.activeMsgMaxInterval ?? 180;

      if (!activeEnabled) {
        // 如果关闭了主动消息，清除该时间戳以防干扰，然后跳过
        if (conv.nextActiveMsgAt) {
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: null,
            lastActiveMsgScheduledTime: null
          });
        }
        continue;
      }

      // 【自校准避让逻辑】：
      // 如果 conversations 表记录的最后消息时间 (lastMessageTime) 与我们上次为其排期时参照的时间戳不同，
      // 说明在这期间用户或角色在聊天室中发了新消息。我们需要把主动消息重新顺延。
      const currentLastMsgTime = conv.lastMessageTime || conv.createdAt || now;
      if (conv.lastActiveMsgScheduledTime !== currentLastMsgTime) {
        const nextTime = currentLastMsgTime + (minVal + Math.random() * (maxVal - minVal)) * 60 * 1000;
        await db.conversations.update(conv.id, {
          nextActiveMsgAt: nextTime,
          lastActiveMsgScheduledTime: currentLastMsgTime
        });
        continue;
      }

      // 如果未设定下一次时间（例如首次开启还没写入），在此处补全
      if (!conv.nextActiveMsgAt) {
        const nextTime = calculateNextTime(minVal, maxVal);
        await db.conversations.update(conv.id, {
          nextActiveMsgAt: nextTime,
          lastActiveMsgScheduledTime: currentLastMsgTime
        });
        continue;
      }

      // 当到达或超过预定的主动发送时刻
      if (now >= conv.nextActiveMsgAt) {
        // 【避让选择1】：如果用户当前正好在这个角色的聊天页面，说明正在热聊中，直接顺延下一次，而不插播主动搭讪
        const hash = location.hash || '';
        const isInThisChat = hash.startsWith('#/chat') && hash.includes(`id=${conv.id}`);
        if (isInThisChat) {
          const nextTime = calculateNextTime(minVal, maxVal);
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: nextTime,
            lastActiveMsgScheduledTime: currentLastMsgTime
          });
          continue;
        }

        // 开始生成主动消息内容（调用已有的字卡引擎 generateForCharacter）
        const { messages, reason } = await generateForCharacter(char.id);
        // 如果因为字卡库均空而没能生成内容，直接顺延，不产生空消息
        if (reason !== 'ok' || !messages || messages.length === 0) {
          const nextTime = calculateNextTime(minVal, maxVal);
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: nextTime,
            lastActiveMsgScheduledTime: currentLastMsgTime
          });
          continue;
        }

        // 保存消息到数据库，连发消息合并为单次发送的事务或分批写入
        let lastCreatedMsg = null;
        for (const msgObj of messages) {
          const msgPayload = {
            conversationId: conv.id,
            sender: 'character',
            content: msgObj.content,
            timestamp: Date.now(),
            quotedMessageId: msgObj.quotedMessageId || null
          };
          lastCreatedMsg = await db.messages.add(msgPayload);
        }

        // 整理最新展示文案
        const lastMsgText = messages[messages.length - 1].content;
        const lastMsgTime = Date.now();

        // 重新排期下一次主动发送的时刻
        const nextTime = calculateNextTime(minVal, maxVal);

        // 更新会话表
        await db.conversations.update(conv.id, {
          lastMessage: lastMsgText,
          lastMessageTime: lastMsgTime,
          nextActiveMsgAt: nextTime,
          lastActiveMsgScheduledTime: lastMsgTime
        });

        // 触发接收主动消息的多维度通知
        triggerNotification(char, conv, lastMsgText);

        // 广播自定义事件，让可能渲染了列表（如主页）的页面感知到去刷新 UI
        window.dispatchEvent(new CustomEvent('active-message-received', {
          detail: { conversationId: conv.id, characterId: char.id }
        }));
      }
    }
  } catch (err) {
    console.error('主动消息调度检查出错:', err);
  }
}

/**
 * 触发通知（支持前台 Toast / 声音，后台本地系统通知）
 */
function triggerNotification(character, conv, text) {
  const isVisible = document.visibilityState === 'visible';

  if (isVisible) {
    // 1. 前台可见：显示轻量 Toast，并尝试播放声音
    toast(`${character.name}: ${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`);
    sound.loadConfig().then(() => {
      sound.play('character', conv.soundOption, conv.customSoundUrl).catch((e) => {
        console.warn('前台主动消息播放声音受限:', e);
      });
    });
  } else {
    // 2. 后台或锁屏（在保活机制下）：如果用户已授权系统通知，尝试弹出本地推送
    if ('Notification' in window && Notification.permission === 'granted') {
      const cleanText = text.replace(/<\/?[^>]+(>|$)/g, ''); // 去除可能混入的标签
      const notification = new Notification(character.name, {
        body: cleanText,
        icon: character.avatar || './icons/icon.svg',
        tag: `active-msg-conv-${conv.id}`
      });

      notification.onclick = function (e) {
        e.preventDefault();
        window.focus();
        location.hash = `#/chat?id=${conv.id}`;
        notification.close();
      };
    }
  }
}

/**
 * 主动重置某对话的计时器（比如用户在 chat.js 里发送了新消息时）
 */
export async function resetNextActiveMsgAt(convId) {
  try {
    const conv = await db.conversations.get(convId);
    if (!conv) return;

    const char = await db.characters.get(conv.characterId);
    if (!char || !char.replyConfig || !char.replyConfig.activeMsgEnabled) return;

    const minVal = char.replyConfig.activeMsgMinInterval ?? 60;
    const maxVal = char.replyConfig.activeMsgMaxInterval ?? 180;
    const currentLastMsgTime = conv.lastMessageTime || conv.createdAt || Date.now();

    const nextTime = currentLastMsgTime + (minVal + Math.random() * (maxVal - minVal)) * 60 * 1000;
    await db.conversations.update(convId, {
      nextActiveMsgAt: nextTime,
      lastActiveMsgScheduledTime: currentLastMsgTime
    });
  } catch (err) {
    console.warn('重置主动消息排期失败:', err);
  }
}

/**
 * 初始化调度器并启动检查
 */
export function init() {
  if (intervalId) clearInterval(intervalId);

  // 15 秒前台定时检查
  intervalId = setInterval(() => {
    if (document.visibilityState === 'visible') {
      checkActiveMessages();
    }
  }, 15000);

  // 切换回前台时，执行一次“补触发”检查（离线漏发的，进前台一次性处理）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkActiveMessages();
    }
  });

  // 首次运行也检查一次
  checkActiveMessages();
}

/**
 * 清除调度器
 */
export function destroy() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
