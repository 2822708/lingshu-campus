// Unique ID generator
// 改进的 uid 生成函数，使用时间戳+随机数确保唯一性
let uidCounter = 0;
export const uid = () => {
  uidCounter++;
  return `${Date.now()}-${uidCounter}-${Math.random().toString(36).substr(2, 9)}`;
};

// localStorage 键名
export const SAVE_KEY = 'npu-game-save';
export const SETTINGS_KEY = 'npu-game-settings';

/**
 * 存档格式版本号。
 *
 * 学阶（RealmType）、物品类型、装备槽位这些枚举的**值**就是存档里的字符串，
 * 换主题时它们全变了（大一/大二、键鼠/外设、手环1/挂件1/外设1/头戴 …），
 * 旧存档直接读进来会在 REALM_DATA[realm] 之类的地方拿到 undefined 然后炸掉。
 * 所以存档带上版本号，对不上就当成不可用，让玩家重开。
 */
export const SAVE_VERSION = 2;

