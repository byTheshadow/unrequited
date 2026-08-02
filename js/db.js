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

db.version(2).stores({
  user: '++id',
  characters: '++id, name, createdAt',
  conversations: '++id, characterId, pinned, lastMessageTime',
  messages: '++id, conversationId, timestamp, sender',
  decks: '++id, name, bindCharacterId, createdAt',
  divinationHistory: '++id, type, timestamp',
  statusPool: '++id',
  settings: 'key',
  missRecords: '++id, characterId, timestamp, isRead'
});

// 升级至版本 3：新增漂流瓶信箱 (driftLetters) 和 长段字卡库 (longFragments)
db.version(3).stores({
  user: '++id',
  characters: '++id, name, createdAt',
  conversations: '++id, characterId, pinned, lastMessageTime',
  messages: '++id, conversationId, timestamp, sender',
  decks: '++id, name, bindCharacterId, createdAt',
  divinationHistory: '++id, type, timestamp',
  statusPool: '++id',
  settings: 'key',
  missRecords: '++id, characterId, timestamp, isRead',
  driftLetters: '++id, characterId, timestamp, type, isRead', // type: 'sent' | 'received'
  longFragments: '++id, content, createdAt'
});

// 升级至版本 4：新增音乐播放器歌单数据表 (musicPlaylist)
db.version(4).stores({
  user: '++id',
  characters: '++id, name, createdAt',
  conversations: '++id, characterId, pinned, lastMessageTime',
  messages: '++id, conversationId, timestamp, sender',
  decks: '++id, name, bindCharacterId, createdAt',
  divinationHistory: '++id, type, timestamp',
  statusPool: '++id',
  settings: 'key',
  missRecords: '++id, characterId, timestamp, isRead',
  driftLetters: '++id, characterId, timestamp, type, isRead',
  longFragments: '++id, content, createdAt',
  musicPlaylist: '++id, name, url, bindCharacterId'
});

// 升级至版本 5：将 decks 的 category 设为索引，解决查询 SchemaError 崩溃报错
db.version(5).stores({
  user: '++id',
  characters: '++id, name, createdAt',
  conversations: '++id, characterId, pinned, lastMessageTime',
  messages: '++id, conversationId, timestamp, sender',
  decks: '++id, name, category, bindCharacterId, createdAt',
  divinationHistory: '++id, type, timestamp',
  statusPool: '++id',
  settings: 'key',
  missRecords: '++id, characterId, timestamp, isRead',
  driftLetters: '++id, characterId, timestamp, type, isRead',
  longFragments: '++id, content, createdAt',
  musicPlaylist: '++id, name, url, bindCharacterId'
});

// 系统内置默认字卡配置
const DEFAULT_PRESET_DECKS = [
  {
    name: '日常絮语',
    category: '日常',
    bindCharacterId: null,
    fragments: [
      "早上好",
      "晚上好",
      "中午好",
      "你好",
      "是我",
      "我是",
      "我没听懂",
      "回复时间不够",
      "没找到我想要说的",
      "可以多加一点字卡吗？",
      "喜欢",
      "不喜欢",
      "有用",
      "没有用",
      "复杂",
      "还可以",
      "学习",
      "工作",
      "上班",
      "有点忙，等会找你",
      "有点想你",
      "什么",
      "时候",
      "有空",
      "没空",
      "可以",
      "不行",
      "好啊",
      "我考虑一下",
      "链接有点混乱",
      "传讯",
      "占卜",
      "理理我",
      "想我了吗？",
      "好久不见",
      "对暗号吗？",
      "行"
    ]
  },
  {
    name: '共时引力',
    category: '共时',
    bindCharacterId: null,
    fragments: [
      "链接顺畅",
      "链接有点波动",
      "有点累了",
      "能量流动",
      "宇宙",
      "直觉",
      "推送传讯",
      "同频",
      "冥想",
      "塔罗启示",
      "星座",
      "心灵感应",
      "觉察",
      "内心的指引",
      "时空的缝隙",
      "静心聆听",
      "灵魂共鸣"
    ]
  },
  {
    name: '心动频率',
    category: '恋爱',
    bindCharacterId: null,
    fragments: [
      "喜欢你",
      "想你",
      "需要你",
      "看到你很开心",
      "很想见你",
      "和你聊天",
      "想要",
      "时间",
      "心跳加速",
      "只看着你",
      "温柔的拥抱",
      "特别的期待",
      "想听你的声音",
      "赖在你身边",
      "对你心动",
      "晚安的吻",
      "你是唯一的",
      "牵手",
      "眼神交汇",
      "全世界最喜欢"
    ]
  }
];

export async function initDB() {
  await db.open();

  // 1. 初始化默认用户
  const userCount = await db.user.count();
  if (userCount === 0) {
    await db.user.add({
      name: '我',
      avatar: '',
      status: '',
      signature: ''
    });
  }

  // 2. 初始化默认字卡库
  const deckCount = await db.decks.count();
  if (deckCount === 0) {
    console.log("检测到字卡库为空，正在导入系统内置的字卡数据...");
    const now = Date.now();
    
    for (let i = 0; i < DEFAULT_PRESET_DECKS.length; i++) {
      const preset = DEFAULT_PRESET_DECKS[i];
      const deckTime = now + (i * 1000); // 错开创建时间，保证默认排序正确
      
      // 为每条字卡生成初始的统计信息
      const fragmentStats = {};
      preset.fragments.forEach((frag, idx) => {
        fragmentStats[frag] = {
          usageCount: 0,
          createdAt: deckTime + idx
        };
      });

      await db.decks.add({
        name: preset.name,
        category: preset.category,
        bindCharacterId: preset.bindCharacterId,
        fragments: preset.fragments,
        fragmentStats: fragmentStats,
        createdAt: deckTime
      });
    }
    console.log("系统内置字卡数据导入成功！");
  }

  // 3. 初始化默认音乐专属字卡包 (防防御性写法，避免在未生成索引前过滤报错)
  const musicDeck = await db.decks.filter(d => d.category === '音乐').first();
  if (!musicDeck) {
    console.log("检测到音乐专属字卡库为空，正在初始化...");
    const now = Date.now();
    const fragments = [
      "流淌着时间的沙",
      "深海里的一束微光",
      "落雪无声的叹息",
      "风吹过空旷山谷的声音",
      "某种早已遗忘的约定",
      "月光下的潮汐起伏",
      "隔着窗子听见的夜雨",
      "指针倒流的错觉",
      "未寄出的信笺",
      "梦境边缘 of 余温",
      "迷雾中模糊的轮廓",
      "孤单星球的自转"
    ];
    const fragmentStats = {};
    fragments.forEach((frag, idx) => {
      fragmentStats[frag] = {
        usageCount: 0,
        createdAt: now + idx
      };
    });

    await db.decks.add({
      name: '弦外之音',
      category: '音乐',
      bindCharacterId: null,
      fragments: fragments,
      fragmentStats: fragmentStats,
      createdAt: now
    });
    console.log("默认音乐字卡库加载完成");
  }

  return db;
}
