import type { RealmType, SecretRealm } from '../../types';
import { REALM_ORDER } from '../../constants';

type Risk = '低' | '中' | '高';
interface DungeonTheme {
  name: string;
  description: string;
  drops: readonly string[];
}
// Existing campus themes; each name stays paired with its description and loot.
const THEMES: Readonly<Record<Risk, readonly DungeonTheme[]>> = {
  低: [
    {
      name: '校图书馆自习区',
      description: '图书馆自习区氛围安静，适合写作业，相对安全。',
      drops: ['草稿纸一沓', '学长学姐整理的资料'],
    },
    {
      name: '期末复习周',
      description: '期末复习周里大家挑灯夜战，氛围浓厚，但请保持精力。',
      drops: ['考研英语真题', '咖啡豆'],
    },
    {
      name: '基础实验实训',
      description: '基础实验课，跟着实验手册走，问题不大。',
      drops: ['实验室元器件包', '杜邦线一捆'],
    },
  ],
  中: [
    {
      name: '程序设计队选拔',
      description: '程序设计队选拔现场，键盘声此起彼伏。',
      drops: ['算法导论笔记', '高转速机械键盘'],
    },
    {
      name: '学园数学建模赛',
      description: '数学建模三天三夜，咖啡就是血液。',
      drops: ['咖啡豆', '学长学姐整理的资料'],
    },
    {
      name: '学园创新杯答辩',
      description: '学园创新杯答辩，评委连环追问，需要镇定。',
      drops: ['稀有实验耗材', '二手显示器'],
    },
  ],
  高: [
    {
      name: '智能车竞赛决赛',
      description: '智能车竞赛决赛现场，赛道急弯一个接一个。',
      drops: ['稀有实验耗材', '示波器探头'],
    },
    {
      name: '毕业设计答辩',
      description: '毕业设计答辩现场，评委连续追问细节。',
      drops: ['奖学金证书', '实习内推码'],
    },
    {
      name: 'CTF 授权靶场演练',
      description: 'CTF 授权靶场演练，凌晨三点还在隔离环境里解题。',
      drops: ['U 盘里神秘文件', '高转速机械键盘'],
    },
  ],
};
const RISK_MULTIPLIERS: Readonly<Record<Risk, number>> = {
  低: 0.8,
  中: 1,
  高: 1.5,
};
let batchSequence = 0;

/** Three reachable choices: risk, not an inaccessible school year, differs. */
export function generateRogueDungeonOffers(
  playerRealm: RealmType,
  random: () => number = Math.random
): SecretRealm[] {
  const realmIndex = REALM_ORDER.indexOf(playerRealm);
  if (realmIndex < 0) throw new Error('当前学阶无效，无法生成副本选择。');
  const batchId = `rogue-${Date.now().toString(36)}-${++batchSequence}`;
  return (['低', '中', '高'] as const).map((riskLevel, index) => {
    const themes = THEMES[riskLevel];
    const theme = themes[Math.floor(random() * themes.length)];
    const cost = Math.floor(
      (50 + realmIndex * 50) *
        RISK_MULTIPLIERS[riskLevel] *
        (0.9 + random() * 0.2)
    );
    return {
      id: `${batchId}-${index}`,
      name: theme.name,
      description: theme.description,
      minRealm: playerRealm,
      riskLevel,
      cost,
      drops: [...theme.drops],
    };
  });
}
