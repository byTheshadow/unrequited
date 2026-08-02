import { db } from '../db.js';
import { generateForCharacter, parseChoiceContent, choiceToContent } from '../cardEngine.js';
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
 * 检查并触发所有角色的主动消息，以及非当前活跃聊天框的后台静默回复
 */
async function checkActiveMessages() {
  try {
    const convs = await db.conversations.toArray();
    const now = Date.now();

    for (const conv of convs) {
      const char = await db.characters.get(conv.characterId);
      if (!char) continue;

      const hash = location.hash || '';
      const isInThisChat = hash.startsWith('#/chat') && hash.includes(`id=${conv.id}`);

      // ==========================================
      // 【新增：常规聊天回复后台静默处理】
      // ==========================================
      if (conv.pendingReplyAt && now >= conv.pendingReplyAt) {
        // 如果用户正好在当前聊天框，让 chat.js 的前台定时器去执行（带打字状态与飞卡动效）
        // 如果用户不在当前聊天框，则由本后台管理器静默生成并发送
        if (!isInThisChat) {
          await executeBackgroundReply(conv, char);
          continue;
        }
      }

      // ==========================================
      // 【原有主动搭讪消息逻辑】
      // ==========================================
      const replyConfig = char.replyConfig || {};
      const activeEnabled = !!replyConfig.activeMsgEnabled;
      const minVal = replyConfig.activeMsgMinInterval ?? 60;
      const maxVal = replyConfig.activeMsgMaxInterval ?? 180;

      if (!activeEnabled) {
        if (conv.nextActiveMsgAt) {
          await db.conversations.update(conv.id, {
            nextActiveMsgAt: null,
            lastActiveMsgScheduledTime: null
          });
        }
        continue;
      }

      const currentLastMsgTime = conv.lastMessageTime || conv.createdAt || now;
      if (conv.lastActiveMsgScheduledTime !== currentLastMsgTime) {
        const nextTime = currentLastMsgTime + (minVal + Math.random() * (maxVal - minVal)) * 60 * 1000;
        await db.conversations.update(conv.id, {
          nextActiveMsgAt: nextTime,
          lastActiveMsgScheduledTime: currentLastMsgTime
        });
        continue;
      }

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
        // 🟢 移除了之前的 isInThisChat 避让顺延逻辑，现在在聊天框内也会直接发送

        // 开始生成主动消息内容
        let { messages, reason } = await generateForCharacter(char.id);
        const hasContent = reason === 'ok' && messages && messages.length > 0 && messages.every(m => m && m.content && m.content.trim() !== '');

        if (!hasContent) {
          const decks = await db.decks.toArray();
          const targetDecks = decks.filter(d => d.bindCharacterId === char.id || !d.bindCharacterId);
          
          let allFrags = [];
          for (const d of targetDecks) {
            const frags = d.fragments || [];
            frags.forEach(text => {
              if (text && text.trim() !== '') {
                allFrags.push({ text, deckId: d.id, deck: d });
              }
            });
          }

          if (allFrags.length > 0) {
            const chosen = allFrags[Math.floor(Math.random() * allFrags.length)];
            messages = [{ content: chosen.text }];

            try {
              const deck = chosen.deck;
              const stats = deck.fragmentStats || {};
              if (!stats[chosen.text]) {
                stats[chosen.text] = { usageCount: 0, createdAt: Date.now() };
              }
              stats[chosen.text].usageCount = (stats[chosen.text].usageCount || 0) + 1;
              await db.decks.update(chosen.deckId, { fragmentStats: stats });
            } catch (e) {
              console.warn('更新备用字卡共鸣频次失败:', e);
            }
          } else {
            const hints = [
              "(对方想来找你，但没有找到合适的字卡)",
              "（对方想说的话似乎更多，需要给对方扩展字卡库吗？）"
            ];
            const randomHint = hints[Math.floor(Math.random() * hints.length)];
            messages = [{ content: randomHint }];
          }
        }

        // 保存消息到数据库
        let lastCreatedMsg = null;
        for (const msgObj of messages) {
          const msgPayload = {
            conversationId: conv.id,
            sender: 'character',
            content: msgObj.content,
            timestamp: Date.now(),
            quotedMessageId: msgObj.quotedMessageId || null,
            isRead: isInThisChat // 🟢 如果用户正好在聊天框中，则直接设为已读
          };
          lastCreatedMsg = await db.messages.add(msgPayload);
        }

        const lastMsgText = messages[messages.length - 1].content;
        const lastMsgTime = Date.now();
        const nextTime = calculateNextTime(minVal, maxVal);

        await db.conversations.update(conv.id, {
          lastMessage: lastMsgText,
          lastMessageTime: lastMsgTime,
          nextActiveMsgAt: nextTime,
          lastActiveMsgScheduledTime: lastMsgTime
        });

        // 触发接收主动消息的多维度通知
        triggerNotification(char, conv, lastMsgText, isInThisChat);

        // 广播自定义事件，让可能渲染了聊天列表或当前聊天窗的页面刷新 UI
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
 * 后台静默常规回复执行器 (当用户切出了该房间，由本函数在后台进行回复生成)
 */
async function executeBackgroundReply(conv, char) {
  try {
    // 1. 清空待回复时间戳
    await db.conversations.update(conv.id, { pendingReplyAt: null });

    const messagesList = await db.messages.where('conversationId').equals(conv.id).sortBy('timestamp');
    
    // 2. 检查是否有未回答的选择题
    let unansweredChoice = null;
    for (let i = messagesList.length - 1; i >= 0; i--) {
      const msg = messagesList[i];
      if (msg.sender === 'user' && msg.type === 'choice') {
        const choice = parseChoiceContent(msg.content);
        if (choice && !choice.answered) {
          unansweredChoice = { msg, choice };
          break;
        }
      }
    }

    let insertedMessages = [];

    if (unansweredChoice) {
      // 答题分支
      const answer = unansweredChoice.choice.options[Math.floor(Math.random() * unansweredChoice.choice.options.length)];
      const choiceObj = unansweredChoice.choice;
      choiceObj.answered = true;
      choiceObj.answer = answer;

      // 在 db 中将选择题标记为已回答
      await db.messages.update(unansweredChoice.msg.id, {
        content: choiceToContent(choiceObj)
      });

      const generated = await generateForCharacter(char.id);
      const genMsgs = generated && generated.messages ? generated.messages : [];
      let extraText = '';
      if (genMsgs.length) {
        const pickedMsg = genMsgs[0];
        const pickedContent = typeof pickedMsg === 'string' ? pickedMsg : (pickedMsg && pickedMsg.content ? pickedMsg.content : '');
        if (pickedContent) extraText = `。${pickedContent}`;
      }

      insertedMessages.push({
        conversationId: conv.id,
        sender: 'character',
        content: `◈ 选择了「${answer}」${extraText}`,
        type: 'card',
        status: 'sent',
        quotedMessageId: unansweredChoice.msg.id,
        timestamp: Date.now(),
        isRead: false
      });
    } else {
      // 普通回复生成
      const generated = await generateForCharacter(char.id);
      const messages = generated && generated.messages ? generated.messages : [];
      const choices = generated && generated.choices ? generated.choices : [];

      if (messages && messages.length > 0) {
        for (let i = 0; i < messages.length; i++) {
          insertedMessages.push({
            conversationId: conv.id,
            sender: 'character',
            content: typeof messages[i] === 'string' ? messages[i] : messages[i].content,
            type: 'card',
            status: 'sent',
            quotedMessageId: null,
            timestamp: Date.now() + i * 10,
            isRead: false
          });
        }
      }

      if (choices && choices.length > 0) {
        for (let i = 0; i < choices.length; i++) {
          const choiceContent = typeof choices[i] === 'string' ? choices[i] : choiceToContent(choices[i]);
          insertedMessages.push({
            conversationId: conv.id,
            sender: 'character',
            content: choiceContent,
            type: 'choice',
            status: 'sent',
            quotedMessageId: null,
            timestamp: Date.now() + (messages.length + i) * 10,
            isRead: false
          });
        }
      }
    }

    if (insertedMessages.length > 0) {
      // 将之前的用户未读消息标为已读
      const lastUserMsg = [...messagesList].reverse().find((m) => m.sender === 'user' && !m.isRead);
      if (lastUserMsg) {
        await db.messages.update(lastUserMsg.id, { isRead: true });
      }

      // 保存新消息并更新会话
      let lastMsgText = '';
      for (const msg of insertedMessages) {
        await db.messages.add(msg);
        lastMsgText = msg.content;
      }

      await db.conversations.update(conv.id, {
        lastMessage: lastMsgText,
        lastMessageTime: Date.now()
      });

      // 触发通知 (后台静默回复，isInThisChat 为 false)
      triggerNotification(char, conv, lastMsgText, false);

      // 发送通知广播
      window.dispatchEvent(new CustomEvent('active-message-received', {
        detail: { conversationId: conv.id, characterId: char.id }
      }));
    }
  } catch (e) {
    console.error('后台静默回复处理失败:', e);
  }
}

/**
 * 触发通知（支持前台 Toast / 声音，后台本地系统通知）
 */
function triggerNotification(character, conv, text, isInThisChat) {
  const isVisible = document.visibilityState === 'visible';

  if (isVisible) {
    if (isInThisChat) {
      // 🟢 如果用户正在这个聊天页面，不弹顶部 Toast，直接静默播放 chimes 提示音即可
      sound.loadConfig().then(() => {
        sound.play('character', conv.soundOption, conv.customSoundUrl).catch((e) => {
          console.warn('当前聊天室消息播放声音受限:', e);
        });
      });
    } else {
      // 前台可见但在其他页面：显示 Toast 并播放声音
      toast(`${character.name}: ${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`);
      sound.loadConfig().then(() => {
        sound.play('character', conv.soundOption, conv.customSoundUrl).catch((e) => {
          console.warn('前台主动消息播放声音受限:', e);
        });
      });
    }
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
