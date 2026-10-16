import {
  PlayerStats,
  AdventureResult,
  AdventureType,
  RealmType,
} from '../types';
import { REALM_ORDER } from '../constants';
import { CAMPUS_THEME } from '../config/campusTheme';
import { neutralizeCampusText } from '../utils/campusText';
import {
  getAIConfig,
  validateAIConfig,
} from '../config/aiConfig';
import {
  generateLocalAdventureEvent,
  generateLocalBreakthroughText,
  generateLocalEnemyName,
} from '../utils/localEvents';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// 模块加载时打印一次当前配置（仅供调试）
// 注意：getAIConfig() 在每次 AI 调用时重新读 localStorage，以支持运行时切换配置
{
  const cfg = getAIConfig();
  const v = validateAIConfig(cfg);
  if (!v.valid && cfg.enabled) {
    // 只在用户主动启用但配置不完整时报错，避免控制台噪音
    console.warn(`⚠️ AI 配置无效: ${v.error}`);
  }
}

const stripCodeFence = (text: string): string => {
  let output = text.trim();

  // 移除代码块标记
  if (output.startsWith('```')) {
    output = output
      .replace(/^```(?:json|JSON)?/i, '')
      .replace(/```$/i, '')
      .trim();
  }
  if (output.toLowerCase().startsWith('json')) {
    output = output.slice(4).trim();
  }

  // 移除可能的前置说明文字（如"根据你的要求"、"我做了调整"等）
  // 查找第一个 { 或 [ 的位置，移除之前的所有内容
  const jsonStart = output.search(/[{[]/);
  if (jsonStart > 0) {
    output = output.slice(jsonStart);
  }

  // 移除可能的后置说明文字
  // 查找最后一个 } 或 ] 的位置，移除之后的所有内容
  const lastBrace = Math.max(output.lastIndexOf('}'), output.lastIndexOf(']'));
  if (lastBrace > 0 && lastBrace < output.length - 1) {
    // 检查后面是否还有有效的JSON内容，如果没有则截断
    const afterBrace = output.slice(lastBrace + 1).trim();
    if (afterBrace && !afterBrace.match(/^[,}\]]/)) {
      // 如果后面有非JSON字符，截断
      output = output.slice(0, lastBrace + 1);
    }
  }

  return output.trim();
};

// 清理JSON中的无效格式（如 +8 应该改为 8）
const cleanJsonString = (jsonString: string): string => {
  // 修复数字前的 + 号（如 "spirit": +8 -> "spirit": 8）
  // 匹配模式：": +数字 或 ":+数字
  let cleaned = jsonString.replace(/:\s*\+(\d+)/g, ': $1');

  // 修复其他可能的JSON格式问题
  // 移除数字前的多个 + 号
  cleaned = cleaned.replace(/:\s*\+\+(\d+)/g, ': $1');

  // 修复字符串值中的 + 号（如果AI错误地在字符串中加了+）
  // 但要注意不要破坏正常的字符串内容

  return cleaned;
};

const parseMessageContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return stripCodeFence(content);
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) {
          return (part as { text?: string }).text || '';
        }
        return '';
      })
      .join('');
  }
  return '';
};

const requestSpark = async (messages: ChatMessage[], temperature = 0.8) => {
  // 每次调用前重新读配置，让用户在首页改了设置后立刻生效
  const cfg = getAIConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    throw new Error('AI 未启用或 API Key 缺失');
  }
  const API_URL = cfg.apiUrl;
  const API_MODEL = cfg.model;
  const API_KEY = cfg.apiKey;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: API_MODEL,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spark API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = parseMessageContent(data?.choices?.[0]?.message?.content);

  if (!content) {
    throw new Error('Spark API returned empty content');
  }

  return content;
};

export const generateAdventureEvent = async (player: PlayerStats, adventureType: AdventureType = 'normal', riskLevel?: '低' | '中' | '高' | '极度危险', realmName?: string, realmDescription?: string): Promise<AdventureResult> => {
  // ============ 降级开关 ============
  // 每次调用时重读配置：用户在首页改了设置立即生效。
  // 没启用 AI / 没填 key / 配置不完整 → 自动走本地模板（utils/localEvents.ts）
  // 本地模板：零网络、零 token、可离线玩，局域网多人同时玩也不会打光 key 配额。
  const initialCfg = getAIConfig();
  if (!initialCfg.enabled || !initialCfg.apiKey) {
    return generateLocalAdventureEvent(player, adventureType, riskLevel);
  }

  try {
    let typeInstructions = '';

    // 根据境界调整事件类型和奖励
    const realmIndex = REALM_ORDER.indexOf(player.realm);
    const realmMultiplier =
      1 + realmIndex * 0.3 + (player.realmLevel - 1) * 0.1;

    switch (adventureType) {
      case 'lucky':
        typeInstructions = `
          这是一次【大机缘】事件！玩家运气爆棚。
          当前学阶：${player.realm} (Lv.${player.realmLevel})

          请生成一个极其罕见的正面事件，事件类型应该与玩家学阶相匹配：
          - 低学阶（大一、大二）：可能捡到老生遗留的笔记、获得稀有课程资料、遇到老师点拨
          - 中学阶（大三、大四）：可能发现实验室传下来的项目资料、获得传说外设、顿悟一个难题
          - 高学阶（硕士及以上）：可能拿到导师的核心资料、获得绝版至宝、领悟学科前沿

          事件颜色应为 "special"。
          物品稀有度：低学阶为"稀有"或"传说"，高学阶可为"传说"或"绝版"。
          收益应当非常丰厚，绩点奖励：${Math.floor(100 * realmMultiplier)}-${Math.floor(1000 * realmMultiplier)}，学分奖励：${Math.floor(50 * realmMultiplier)}-${Math.floor(500 * realmMultiplier)}。
        `;
        break;
      case 'secret_realm': {
        // 根据风险等级调整奖励范围
        const getRewardRange = (
          risk: '低' | '中' | '高' | '极度危险' | undefined
        ) => {
          if (!risk)
            return {
              expMin: 50,
              expMax: 500,
              stonesMin: 100,
              stonesMax: 1000,
              rarity: '中等',
            };
          const ranges = {
            低: {
              expMin: 50,
              expMax: 300,
              stonesMin: 100,
              stonesMax: 600,
              rarity: '较低',
            },
            中: {
              expMin: 100,
              expMax: 500,
              stonesMin: 200,
              stonesMax: 1000,
              rarity: '中等',
            },
            高: {
              expMin: 200,
              expMax: 800,
              stonesMin: 400,
              stonesMax: 1500,
              rarity: '较高',
            },
            极度危险: {
              expMin: 400,
              expMax: 1200,
              stonesMin: 800,
              stonesMax: 2500,
              rarity: '极高',
            },
          };
          return ranges[risk];
        };
        const rewardRange = getRewardRange(riskLevel);
        const riskText = riskLevel ? `（${riskLevel}风险）` : '';

        // 如果有副本名称和描述，加入提示词中
        const realmContext = realmName
          ? `\n\n【重要】玩家正在探索的副本名为：【${realmName}】${realmDescription ? `，副本特点：${realmDescription}` : ''}。\n所有生成的事件描述必须与【${realmName}】这个副本的特点紧密关联！`
          : '';

        typeInstructions = `
            玩家正在【副本】中探索${riskText}。${realmContext}
            当前学阶：${player.realm} (Lv.${player.realmLevel})

            【副本环境特点】
            副本是独立于日常校园的特殊场景，环境奇特多变，充满未知的挑战和机遇。

            ${realmName ? `\n【关键要求 - 必须严格遵守】\n你生成的事件描述必须完全符合【${realmName}】这个副本的特点和环境！\n- 如果副本名称包含"实验室"、"实训"，描述应该涉及实验台、示波器、焊台等\n- 如果副本名称包含"竞赛"、"集训"，描述应该涉及赛场、评委、队友等\n- 如果副本名称包含"答辩"、"面试"，描述应该涉及评委席、PPT、追问等\n- 如果副本名称包含"考研"、"自习"，描述应该涉及自习室、背单词、倒计时等\n- 如果副本名称包含"期末"、"考试"，描述应该涉及考场、监考、试卷等\n- 如果副本名称包含"毕业"、"延毕"，描述应该涉及答辩、查重、答辩委员会等\n- 如果副本名称包含"熬夜"、"通宵"，描述应该涉及深夜实验室、咖啡、空旷校园等\n- 如果副本名称包含"网安"、"CTF"，描述应该涉及授权靶场、隔离环境、漏洞排查和防护复盘等\n- 如果副本名称包含"智能车"、"机器人"，描述应该涉及赛道、调参、车模等\n- 如果副本名称包含"电赛"、"电子"，描述应该涉及 PCB、焊台、示波器等\n- 如果副本名称包含"建模"、"数学"，描述应该涉及论文、夜宵、优化等\n- 如果副本名称包含"四六级"、"英语"，描述应该涉及考场、耳机、作文等\n- 如果副本名称包含"图书馆"、"自习"，描述应该涉及书架、占座、夜归等\n- 如果副本名称包含"实习"、"面试"，描述应该涉及 HR、白板、算法题等\n- 如果副本名称包含"答辩"、"盲审"，描述应该涉及评委、修改、压力等\n- 如果副本名称包含"答辩"、"导师"，描述应该涉及导师、修改、压力等\n- 如果副本名称包含"毕业"、"答辩"，描述应该涉及学院、修改、压力等\n\n绝对不能生成与副本名称无关的通用描述！所有场景、环境、事件都必须紧扣副本名称和特点！` : ''}

            【副本场景类型（必须多样化）】
            - 校园地标：如"图书馆深夜区"、"主楼自习室"、"操场夜跑跑道"、"实验室通宵档"等
            - 比赛现场：如"竞赛答辩席"、"机考现场"、"调试现场"、"实验室深夜档"等
            - 教学场所：如"期末考场"、"实训机房"、"通识大教室"、"实验报告收缴处"等
            - 生活场景：如"食堂高峰"、"宿舍熄灯后"、"操场夜跑"、"校园快递站"等

            【风险等级对应的场景氛围】
            - 低风险：环境相对安全，但仍有突发状况
              * 如"图书馆一楼大厅，期末人虽多但空调充足，相对放松"
              * 如"社团招新现场，人来人往但热闹不危险"
            - 中风险：环境开始变得紧张，需要小心应对
              * 如"期末考场里翻卷子声此起彼伏，时间一分一秒流逝"
              * 如"实验室深夜档，导师随时可能 @ 你"
            - 高风险：环境极其紧张，随时可能出大事故
              * 如"答辩现场，评委连续追问细节，空气凝固"
              * 如"竞赛最后一天，所有东西都还没做完"
            - 极度危险：环境极度恶劣，随时可能延毕/挂科
              * 如"毕业前最后一周，所有 deadline 撞在一起"
              * 如"毕业答辩前夜，PPT 还没改完"

            【副本事件类型】
            1. 遭遇强大的对手（如竞赛对手、答辩评委、监考老师，高压高回报）
            2. 发现稀缺资料（如"学长笔记"、"绝版教材"、"老师课件"等）
            3. 触发突发状况（受伤但可能获得资料）
            4. 发现隐藏的捷径或线索（获得丰厚奖励）
            5. 遭遇项目组队友（可能是敌是友）
            6. 发现副本的秘密或解开谜题（获得特殊奖励）
            7. 遭遇系统故障/突发事故（危险但可能获得机缘）

            【副本描述要求】
            - 必须详细描述副本的环境：如实验室的氛围、考场的紧张、答辩的压力等
            - 必须描述玩家的探索过程：如"你小心翼翼地调试"、"你加快脚步走向考场"等
            - 必须描述具体的事件：如对手的表现、资料的外观、突发状况的细节等
            - 根据风险等级，场景应该越来越紧张和危险
            - 每次进入副本都应该有不同的场景描述，避免重复

            【示例场景描述】
            - "你推开实验室的玻璃门，进入一间被暖黄色灯光笼罩的深夜实验室。示波器屏幕上跳动着规律的波形，空气中弥漫着焊锡和咖啡的味道。突然，导师端着咖啡走进，朝你点了点头。"
            - "在一片紧张的竞赛答辩席上，你发现 PPT 第 27 页还没改完。评委席上三位评委面无表情，空气中弥漫着令人窒息的压力。"
            - "你推开考场的门，进入一间被荧光灯照得雪白的教室。桌面上摆满了试卷和草稿纸，监考老师来回走动。突然，前排同学翻卷子的声音格外响亮。"

            环境险恶，但回报丰厚。可能遭遇强大的对手（高伤害风险）或发现稀缺资料。
            如果发生战斗，伤害和奖励都应比平时更高。风险等级越高，奖励越丰厚。
            【重要】副本中虽然危险，但主要是战斗伤害（hpChange可能为负），不应该降低玩家的永久属性（attack、defense、spirit、physique、speed、maxHp）。
            物品稀有度：${rewardRange.rarity}，至少是"稀有"，根据风险等级调整稀有度概率。
            绩点奖励：${Math.floor(rewardRange.expMin * realmMultiplier)}-${Math.floor(rewardRange.expMax * realmMultiplier)}，学分奖励：${Math.floor(rewardRange.stonesMin * realmMultiplier)}-${Math.floor(rewardRange.stonesMax * realmMultiplier)}。
          `;
        break;
      }
      default:
        typeInstructions = `
          这是玩家在校园里的一次普通日常刷副本。
          当前学阶：${player.realm} (Lv.${player.realmLevel})

          事件类型应该多样化，包括但不限于：
          1. 遭遇难题战斗（可能受伤，但获得经验和材料）
          2. 发现稀缺资料或元件（获得物品）
          3. 遇到其他同学（可能交易、切磋、或获得信息）
          4. 发现学长的遗留资料（获得物品和绩点）
          5. 顿悟一个难题（获得绩点）
          6. 遇到意外状况（受伤但可能获得意外收获）
          7. 发现校园隐藏资源（获得学分）
          8. 救助他人（获得品德和奖励）
          9. 发现高人留下的笔记（获得思维）
          10. 拯救室友（获得室友）
          11. 【室友机缘】室友在刷副本中获得机缘（提升等级、进化、提升属性、获得经验）
          12. 运气好,捡到若干抽奖券(获得抽奖券)
          13. 极小概率获得经验包(获得经验,可以直接突破1-4个学阶)
          14. 【危险】遭遇意外冲突（可能受伤、被抢走学分、绩点降低）
          15. 【危险】触发意外状况（可能受伤、属性降低、绩点降低）
          16. 【特殊】触发随机副本（进入副本后触发新的随机事件，风险和收益都更高）

          危险事件概率：约15-20%的概率遭遇危险事件（意外冲突、突发状况）
          随机副本概率：约5%的概率触发随机副本
          大部分时间是普通事件，小概率出现危险或惊喜。
          物品稀有度：${Math.max(0, 60 - realmIndex * 10)}%普通，${Math.min(30 + realmIndex * 5, 50)}%稀有，${Math.min(realmIndex * 3, 20)}%传说。
          绩点奖励：${Math.floor(10 * realmMultiplier)}-${Math.floor(100 * realmMultiplier)}，学分奖励：${Math.floor(5 * realmMultiplier)}-${Math.floor(50 * realmMultiplier)}。
          抽奖券奖励：${Math.floor(1 * realmMultiplier)}-${Math.floor(10 * realmMultiplier)}。
          经验包奖励：${Math.floor(1 * realmMultiplier)}-${Math.floor(4 * realmMultiplier)}。

          【场景描述多样化要求（非常重要）】
          每次刷副本的场景描述必须不同，避免单调重复。描述应该生动详细，包含环境、动作、事件细节。

          【环境描写示例】
          - 地点多样化：如"图书馆三楼靠窗"、"主楼实验室"、"教学楼天台"、"操场看台"、"食堂一楼"、"校史馆"、"快递站"、"自习室"、"操场跑道"、"快递柜"等
          - 氛围多样化：如"键盘声此起彼伏"、"焊锡味弥漫"、"空调嗡嗡作响"、"荧光灯忽闪"、"雨声滴答"、"打印机轰鸣"、"走廊安静"、"走廊喧嚣"等
          - 时间多样化：如"清晨六点"、"上午十点"、"中午十二点"、"下午三点"、"晚上九点"、"午夜十二点"、"凌晨两点"等

          【动作描写多样化】
          - 探索类："你小心翼翼地探索"、"你快步穿过"、"你缓缓前行"、"你加快脚步"、"你屏息凝神地观察"等
          - 发现类："你突然注意到"、"你偶然发现"、"你眼睛一亮"、"你循声而去"、"你驻足观察"等
          - 战斗类："你拔键盘迎战"、"你运转大脑"、"你祭出公式"、"你施展算法"、"你严阵以待"等

          【事件描述多样化示例】
          - "你在图书馆三楼靠窗的位置发现了一份学长留下的笔记，字迹工整但略显潦草，旁边还放着一罐喝了一半的咖啡。"
          - "漫步在校园里，你突然注意到主楼实验室的灯还亮着，里面隐约传来焊台滋滋的声音。你走近一看，门没锁。"
          - "在食堂一楼的高峰期，你发现了一个靠窗的空位，桌面上留着一张写着'秘籍'的纸条。"
          - "凌晨两点，你穿过空旷的校园，突然听见身后传来急促的脚步声，是赶 deadline 的同学。"

          【重要】每次生成的事件描述必须包含：
          1. 具体的地点环境描述（至少10-30字）
          2. 玩家的具体行动描述（至少10-20字）
          3. 事件的具体细节描述（至少20-50字）
          4. 尽量包含玩家的感受或观察（可选但推荐）

          避免使用过于简单的描述，如"你遇到了一个难题"、"你发现了一本笔记"等。
          应该使用丰富的场景描写，如"你推开实验室的门，看到三台显示器都亮着，导师正坐在第一台前敲键盘。空气中弥漫着咖啡和焊锡的味道，桌角的草稿纸已经堆成了小山..."

          【物品生成多样化要求】
          请尽量生成多样化的物品，不要总是生成相同类型的物品。物品类型应该包括：
          - 食材类：咖啡豆、茶包、速溶粉、挂耳、能量棒等（提供临时精力/绩点恢复）
          - 饮品类：美式、奶茶、红牛、特浓、蛋白粉等（提供临时或永久属性提升）
          - 元件类：电阻、杜邦线、开发板、芯片、传感器等
          - 键鼠类：各种键盘、鼠标、轨迹球、数位板等（提供攻击力加成，装备槽位：键鼠）
          - 穿戴类（必须多样化，不要只生成上衣）：
            * 头戴：耳机、鸭舌帽、护目镜、头戴式耳机、头戴等（装备槽位：头戴）
            * 肩背：双肩包、电脑包、斜挎包、单肩包等（装备槽位：肩背）
            * 上衣：卫衣、外套、院服、实验服、T恤等（装备槽位：上衣）
            * 手部：防静电手套、护腕、握力器等（装备槽位：手部）
            * 裤装：工装裤、速干裤、运动裤、牛仔裤等（装备槽位：裤装）
            * 鞋履：板鞋、跑鞋、帆布鞋、凉鞋等（装备槽位：鞋履）
          - 挂件类：校园卡、工牌、挂绳、钥匙扣、徽章等（提供多种属性加成，装备槽位：挂件1-2）
          - 手环类：智能手环、运动环、计数环等（提供属性加成，装备槽位：手环1-4）
          - 外设类：各种显示器、扩展坞、示波器、机械键盘等（提供多种属性加成，但不能提供绩点加成，装备槽位：外设1-2）

          【重要】穿戴类装备生成时，请确保多样化：
          - 头戴、肩背、手部、裤装、鞋履这些装备槽位应该与上衣有相似的生成概率
          - 不要总是生成上衣，应该随机生成不同部位的穿戴
          - 穿戴类装备的命名应该明确体现部位（如"蓝牙耳机"、"双肩包"、"护腕"、"跑鞋"等）

          物品属性应该多样化：
          - 单一属性物品：只提供一种属性加成（如纯攻击、纯防御）
          - 双属性物品：提供两种属性组合（如攻击+速度、防御+精力）
          - 多属性物品：提供3种或更多属性组合（稀有物品）
          - 永久属性物品：使用后永久提升属性（稀有）
          - 临时效果物品：使用后临时恢复精力/绩点（常见）

          请根据事件类型和稀有度，创造性地生成不同名称、不同属性组合的物品，避免重复。
        `;
        break;
    }

    const prompt = `
      你是一个文字校园游戏的GM（Dungeon Master）。
      当前玩家状态：
      - 姓名：${player.name}
      - 学阶：${player.realm} (Lv.${player.realmLevel})
      - 精力：${player.hp}/${player.maxHp}
      - 攻击力：${player.attack}
      - 防御力：${player.defense}
      - 思维：${player.spirit}
      - 体能：${player.physique}
      - 速度：${player.speed}

      请生成一个随机校园事件。
      ${typeInstructions}

      【场景描述多样化要求（极其重要 - 必须严格遵守）】
      事件描述（story）必须生动详细，包含丰富的场景细节，避免单调重复。每次生成都应该有独特的场景和描述。

      【描述结构要求（必须包含所有部分）】
      1. 环境描写（必选，10-40字）：描述所在的具体环境和氛围
         - 地点多样化：如"图书馆三楼靠窗"、"主楼实验室"、"教学楼天台"、"操场看台"、"食堂一楼"、"校史馆"、"快递站"、"自习室"、"操场跑道"、"快递柜"等
         - 氛围多样化：如"键盘声此起彼伏"、"焊锡味弥漫"、"空调嗡嗡作响"、"荧光灯忽闪"、"雨声滴答"、"打印机轰鸣"、"走廊安静"、"走廊喧嚣"等
         - 天气/时间多样化：如"清晨六点"、"上午十点"、"中午十二点"、"下午三点"、"晚上九点"、"午夜十二点"、"凌晨两点"等

      2. 动作描写（必选，10-30字）：描述玩家的具体行动和反应
         - 探索类："你小心翼翼地探索"、"你快步穿过"、"你缓缓前行"、"你加快脚步"、"你屏息凝神地观察"等
         - 发现类："你突然注意到"、"你偶然发现"、"你眼睛一亮"、"你循声而去"、"你驻足观察"等
         - 战斗类："你拔键盘迎战"、"你运转大脑"、"你祭出公式"、"你施展算法"、"你严阵以待"等
         - 反应类："你心中一紧"、"你神色凝重"、"你面露喜色"、"你暗自警惕"等

      3. 事件细节（必选，30-80字）：描述具体发生的事情，包含详细的视觉、听觉、嗅觉等感官细节
         - 敌人：外貌特征（如"熬夜熬出来的黑眼圈"、"手里攥着记号笔"、"眼睛布满血丝"、"满头油光"等）
         - 物品/宝物：外观描述（如"飘着淡淡的咖啡香"、"闪着 RGB 灯光"、"二手但很新的机械键盘"、"精致的钥匙扣"等）
         - 环境变化：如"实验室门缓缓关上"、"答辩 PPT 突然蓝屏"、"地面突然漏水"、"天空中降下暴雨"等
         - 对话/声音：如"远处传来键盘声"、"诡异笑声和吐槽"、"沉重的脚步声"、"答辩评委的追问"等

      4. 感受描写（强烈推荐，10-30字）：描述玩家的感受和体验
         - 如"你感受到 deadline 的压力"、"精力急速下降"、"心中警兆大起"、"你感受到前所未有的危机感"等

      【场景多样化模板示例（参考这些风格，但每次都要变化）】

      【战斗类场景模板】
      - "凌晨两点，你穿过空旷的校园赶 deadline。路灯在身后投下诡异的阴影，空气中弥漫着消毒水的味道。突然，一个熬红了眼的同学从阴影中冲出，朝你扔来一份调试到一半的代码。你立即祭出键盘迎战，代码和算法交织，战斗异常激烈。最终，你将其击退，却也耗去不少精力。"
      - "在图书馆三楼靠窗的位置，参考书堆得比山高，你听到远处传来低沉的叹息声。你循声而去，发现一位同学正和一个题较劲，四周草稿纸遍地。你趁其不备，突袭搭话，获得了意外的收获。"
      - "你在一处人满为患的实验室里挤位置，两侧堆满了示波器和焊台。突然，一台示波器突然冒烟，冒出呛人的烟雾。你立即运转大脑，与这场突发状况展开激烈对决。经过一番苦战，你终于修好了它。"

      【发现物品类场景模板】
      - "你在图书馆三楼靠窗的位置自习时，发现了学长留下的一份笔记。笔记上密密麻麻写满了重点，旁边还放着半罐凉透的咖啡。翻开笔记本，里面还夹着一张写着'秘籍'的纸条。"
      - "漫步在主楼走廊，你正感到有些无聊，突然你的余光瞥见实验室门缝里塞着一份 U 盘。你小心翼翼地靠近，发现 U 盘上贴着'绝版资料'的标签。你将其插入电脑，感受到其中蕴含的丰富干货。"
      - "在食堂一楼的高峰期，你端着餐盘找位置，突然发现一个靠窗的空位，桌面上留着一本包装精美的手账本，封皮上印着学校的标志性建筑。"

      【校园奇事类场景模板】
      - "你在自习时，窗外突然乌云密布，雷电交加。一道紫色闪光从天而降，将你笼罩其中。你感受到一股强大的学习动力涌入体内，思维瞬间清晰，难题瞬间精进。"
      - "在图书馆的角落，你正在背单词，突然听到身后传来脚步声。转身一看，是一位白发苍苍的老教授，他神采奕奕，眼中透着智慧的光芒。他看你资质不错，便传授了你一套独门学习方法，并给了你一些珍贵的笔记。"
      - "你误入一处通宵实验室，里面堆满了焊台和元器件。墙上贴满了看不懂的电路图，散发着咖啡和焊锡的味道。经过一番探索，你解开了一个小型电路，获得了其中调试好的一块开发板。"

      【危险类场景模板】
      - "你在图书馆三楼突然感觉到杀机四伏，四周的键盘声似乎都在颤抖。来不及反应，一组 deadline 从四面八方向你扑来，它们眼露凶光，显然是看上了你剩余的时间。你拼尽全力，施展全力才得以逃脱。"
      - "你推开实验室的门，里面光线昏暗，空调嗡嗡作响。然而，当你走到实验室中央时，示波器突然冒烟。无数根杜邦线从桌面上弹起，向你袭来。你虽然勉强躲过，但也受了不轻的伤。"
      - "在深夜的主楼走廊里，保安的巡逻脚步声让你心神不宁。四周荧光灯忽闪忽亮，能见度极低。更让你心跳加速的是，脚步声忽远忽近，让你无法集中精神。你强行打起精神，护住资料，才从这诡异的环境中脱身，但精力略有损耗。"

      【重要约束】
      1. 事件描述（story）必须符合玩家当前学阶，使用现代校园风格的中文描述，长度控制在50-200字
      2. 每次生成的场景描述必须不同，避免使用相同的模板或句式
      3. 描述应该包含环境、动作、事件细节，推荐包含感受描写
      4. 根据事件类型选择合适的场景模板，但要在模板基础上进行创新和变化
      5. 所有数值必须合理：精力变化不应超过玩家最大精力的50%，绩点和学分变化应符合学阶水平
      3. 事件颜色（eventColor）必须准确反映事件性质：
         - normal：普通事件，无明显收益或损失
         - gain：正面事件，有明显收益（获得物品、绩点、学分等）
         - danger：危险事件，有损失（受伤、被抢、属性降低等）
         - special：特殊事件，罕见且收益丰厚（大机缘、绝版等）
      4. 如果事件描述中提到获得物品，必须在itemObtained或itemsObtained中提供该物品
      5. 物品名称必须符合现代校园风格
      6. 属性降低（attributeReduction）应该非常罕见，且必须与事件描述相符

      请严格以 JSON 格式返回结果。所有文本必须使用中文。
      如果获得物品，请设定合理的属性加成和稀有度。
    `;

    const resultText = await requestSpark(
      [
        {
          role: 'system',
          content:
            `${CAMPUS_THEME.aiSetting}\n你是一名严谨的校园游戏GM，需要严格按照用户要求返回结构化数据。\n\n重要规则：\n1. 只返回JSON格式，不要有任何额外的文字说明、解释或描述\n2. 不要使用代码块标记（如\`\`\`json\`\`\`），直接返回纯JSON\n3. 所有数字值必须是纯数字格式，例如 "spirit": 8 而不是 "spirit": +8\n4. 不要添加任何注释或说明文字\n5. 确保JSON格式完全正确，可以被直接解析`,
        },
        {
          role: 'user',
          content: `${prompt}

【输出要求】
只返回JSON格式，不要有任何额外的文字、说明、解释或描述。不要使用代码块标记，直接返回纯JSON。

【JSON字段定义】
{
  "story": "事件描述（字符串）",
  "hpChange": 精力变化（整数，纯数字，可以是负数）,
  "expChange": 绩点变化（整数，纯数字，可以是负数）,
  "spiritStonesChange": 学分变化（整数，纯数字，可以是负数）,
  "lotteryTicketsChange": 抽奖券变化（整数，可选，纯数字）,
  "inheritanceLevelChange": 经验包等级变化（整数1-4，可选，纯数字）,
  "attributeReduction": {
    "attack": 攻击降低（整数，可选，纯数字）,
    "defense": 防御降低（整数，可选，纯数字）,
    "spirit": 思维降低（整数，可选，纯数字）,
    "physique": 体能降低（整数，可选，纯数字）,
    "speed": 速度降低（整数，可选，纯数字）,
    "maxHp": 精力上限降低（整数，可选，纯数字）
  },
  "triggerSecretRealm": 是否触发随机副本（布尔值，可选）,
  "eventColor": "事件颜色（normal/gain/danger/special）",
  "itemObtained": {
    "name": "物品名称（字符串）",
    "type": "物品类型（食材/饮品/元件/外设/键鼠/穿戴/挂件/手环）",
    "description": "物品描述（字符串，只包含描述文字，不要包含属性信息如[攻+50]等，属性会单独显示）",
    "rarity": "稀有度（普通/稀有/传说/绝版，可选）",
    "isEquippable": 是否可装备（布尔值）,
    "equipmentSlot": "装备槽位（字符串，可选：头戴/肩背/上衣/手部/裤装/鞋履/手环1-4/挂件1-2/外设1-2/键鼠）",
    "effect": {
      "hp": 精力（整数，可选，纯数字）,
      "exp": 绩点（整数，可选，纯数字，注意：装备类物品不能有exp加成）,
      "attack": 攻击（整数，可选，纯数字）,
      "defense": 防御（整数，可选，纯数字）,
      "spirit": 思维（整数，可选，纯数字）,
      "physique": 体能（整数，可选，纯数字）,
      "speed": 速度（整数，可选，纯数字）
    },
    "permanentEffect": {
      "attack": 攻击（整数，可选，纯数字）,
      "defense": 防御（整数，可选，纯数字）,
      "spirit": 思维（整数，可选，纯数字）,
      "physique": 体能（整数，可选，纯数字）,
      "speed": 速度（整数，可选，纯数字）,
      "maxHp": 精力上限（整数，可选，纯数字）
    }
  },
  "itemsObtained": [多个物品数组，格式同itemObtained，可选],
  "petObtained": "室友模板ID（字符串，可选：pet-spirit-fox/pet-thunder-tiger/pet-phoenix，对应'带饭室友/电竞室友/卷王室友'，注意：卷王室友不能进化——它是顶级物种）",
  "petOpportunity": {
    "type": "机缘类型（evolution/level/stats/exp）",
    "petId": "室友ID（字符串，可选）",
    "levelGain": 提升等级数（整数，可选，type为level时必需）,
    "expGain": 获得经验（整数，可选，type为exp时必需）,
    "statsBoost": {
      "attack": 攻击提升（整数，可选，纯数字）,
      "defense": 防御提升（整数，可选，纯数字）,
      "hp": 精力提升（整数，可选，纯数字）,
      "speed": 速度提升（整数，可选，纯数字）
    }
  }
}

【重要规则】
1. 只返回JSON，不要有任何其他文字
2. 所有数字必须是纯数字，不要带+号或其他符号
3. 物品类型必须严格使用：食材、饮品、元件、外设、键鼠、穿戴、挂件、手环
4. 装备类物品必须设置 isEquippable: true 和正确的 equipmentSlot
5. 外设不能提供exp（绩点）加成，只能提供属性加成
6. 【重要】根据物品名称推断装备类型和槽位（优先级从高到低）：
   - 【键鼠类】如果物品名称包含以下关键词，必须使用"键鼠"类型：
     * 键盘（如：机械键盘、青轴键盘、红轴键盘、客制化键盘、静音键盘等）
     * 鼠标（如：电竞鼠标、无线鼠标、人体工学鼠标、轨迹球等）
     * 数位板（如：Wacom 数位板、手绘板等）
     * 注意：即使描述中提到"外设"等词，只要名称包含"键盘/鼠标"等键鼠关键词，就是"键鼠"类型，不是"外设"
   - 【穿戴类】如果物品名称包含以下关键词，使用"穿戴"类型，并明确部位：
     * 头戴：耳机/帽/护目镜/头戴/鸭舌帽/发带/挂耳→头戴
     * 肩背：双肩包/电脑包/斜挎包/单肩包/书包/背包→肩背
     * 上衣：卫衣/外套/院服/实验服/T恤/衬衫/冲锋衣/棉袄→上衣
     * 手部：手套/护腕/防静电手套/握力器/手甲→手部
     * 裤装：工装裤/速干裤/运动裤/牛仔裤/阔腿裤/裤→裤装
     * 鞋履：板鞋/跑鞋/帆布鞋/凉鞋/靴/运动鞋/拖鞋→鞋履
   - 【手环类】如果物品名称包含：手环/运动环/智能手环/计数环/腕带→使用"手环"类型，equipmentSlot为"手环1"（系统会自动分配）
   - 【挂件类】如果物品名称包含：校园卡/工牌/挂绳/钥匙扣/徽章/胸针/挂件→使用"挂件"类型，equipmentSlot为"挂件1"（系统会自动分配）
   - 【外设类】如果物品名称包含以下关键词，且不包含键鼠关键词，使用"外设"类型：
     * 显示器/屏/扩展坞/坞/充电宝/排插/台灯/桌面
     * 耳机/耳麦/音箱（注意：如果同时包含"键鼠"关键词，优先判定为键鼠）
     * U 盘/硬盘/移动电源/USB
     * 注意：如果物品名称同时包含键鼠关键词（如"键盘"）和外设关键词（如"扩展坞"），优先判定为"键鼠"
7. 事件描述必须与奖励/惩罚相匹配：如果描述获得物品，必须提供itemObtained；如果描述受伤，hpChange应为负数
8. 经验包等级变化（inheritanceLevelChange）只能为1-4之间的整数，且应该极其罕见（只有大机缘事件才可能出现）
9. 触发随机副本（triggerSecretRealm）应该非常罕见，只有特殊事件才可能触发
10. 室友机缘（petOpportunity）需要玩家已有室友时才应该出现，且应该合理（如提升等级、获得经验等）

【物品生成多样化规则】
- 尽量生成不同名称、不同类型的物品，避免重复
- 物品属性组合应该多样化：
  * 单一属性：只加攻击、只加防御、只加精力等
  * 双属性组合：攻击+速度、防御+精力、思维+体能等
  * 多属性组合：攻击+防御+速度、精力+思维+体能等（稀有物品）
- 【重要】装备类物品（键鼠/穿戴/挂件/手环/外设）必须使用 effect 字段来提供属性加成，不要使用 permanentEffect
- permanentEffect 仅用于消耗品（饮品等）使用后永久增加玩家属性
- 装备类物品的 effect 会在装备时生效，卸下时失效，这是装备的正常机制
- 根据稀有度调整属性数值：
  * 普通：单一属性10-30，双属性各5-15
  * 稀有：单一属性30-80，双属性各15-40，三属性各10-25
  * 传说：单一属性80-200，双属性各40-100，三属性各25-60
  * 绝版：单一属性200-500，双属性各100-250，三属性各60-150
- 创造性地命名物品，使用现代校园风格的名称（如：静音机械键盘、高刷新率显示器、人体工学鼠标、双肩电脑包等）

【穿戴装备生成概率要求（重要）】
当生成穿戴类装备时，必须确保各部位装备的生成概率相对均衡：
- 头戴装备：约15-20%的概率（如：蓝牙耳机、降噪耳机、鸭舌帽等）
- 肩背装备：约15-20%的概率（如：双肩包、电脑包、斜挎包等）
- 上衣装备：约15-20%的概率（如：卫衣、外套、院服、实验服等）
- 手部装备：约15-20%的概率（如：护腕、防静电手套、握力器等）
- 裤装装备：约15-20%的概率（如：工装裤、速干裤、运动裤等）
- 鞋履装备：约15-20%的概率（如：板鞋、跑鞋、帆布鞋等）
不要总是生成上衣，应该随机选择不同部位的穿戴装备，确保玩家能够获得完整的装备套装。

【副本属性降低规则】
- 属性降低应该非常罕见，只有在极度危险的事件中才发生
- 如果发生属性降低，降低数值应该较小（通常为玩家当前属性的5-10%）
- 属性降低时，必须提供丰厚的补偿（如稀有物品、大量绩点、学分等）
- 建议：只有约10-15%的副本事件是危险的，且危险事件中只有约30%会降低属性`,
        },
      ],
      0.95
    );

    // 清理JSON字符串中的无效格式
    const cleanedJson = cleanJsonString(resultText);

    try {
      const parsed = JSON.parse(cleanedJson) as AdventureResult;
      // 只清理生成文案，不触碰 ID、类型、存档字段或任何数值。
      if (typeof parsed.story === 'string') {
        parsed.story = neutralizeCampusText(parsed.story);
      }
      const generatedItems = [
        parsed.itemObtained,
        ...(Array.isArray(parsed.itemsObtained) ? parsed.itemsObtained : []),
      ];
      for (const item of generatedItems) {
        if (!item) continue;
        if (typeof item.name === 'string') item.name = neutralizeCampusText(item.name);
        if (typeof item.description === 'string') {
          item.description = neutralizeCampusText(item.description);
        }
      }
      return parsed;
    } catch (parseError) {
      console.error('JSON解析失败，原始内容:', resultText);
      console.error('清理后的内容:', cleanedJson);
      console.error('解析错误:', parseError);
      throw new Error(`JSON解析失败: ${parseError}`);
    }
  } catch (error) {
    // AI 调用失败 / 解析失败 / 限流 / 网络错误 → 自动降级到本地模板。
    // 这样局域网多人同时玩、key 被刷爆、key 失效时，游戏都不会卡住。
    console.warn('[aiService] AI 调用失败，降级到本地事件。原因:', error instanceof Error ? error.message : error);
    return generateLocalAdventureEvent(player, adventureType, riskLevel);
  }
};

export const generateBreakthroughFlavorText = async (
  realm: string,
  success: boolean
): Promise<string> => {
  // 每次重读配置：支持用户运行时切换 AI 开关
  const cfg = getAIConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return generateLocalBreakthroughText(realm, success);
  }

  try {
    const prompt = `
      描述一名工科生尝试升级到 ${realm} 的过程。
      结果：${success ? '成功' : '失败'}。
      请保持简短（不超过2句话），使用现代校园风格，提及熬夜苦读、考试紧张、查分等元素。
      请使用中文输出。
    `;

    const content = await requestSpark(
      [
        {
          role: 'system',
          content: `${CAMPUS_THEME.aiSetting}\n你是校园小说作家，擅长以细腻中文描绘学生升级场景。`,
        },
        { role: 'user', content: prompt },
      ],
      0.8
    );

    return neutralizeCampusText(
      content.trim() ||
      generateLocalBreakthroughText(realm, success)
    );
  } catch {
    // AI 失败时降级到本地文案（避免 tokenplan 限额被耗光时游戏崩溃）
    return generateLocalBreakthroughText(realm, success);
  }
};

export const generateEnemyName = async (
  realm: RealmType,
  adventureType: AdventureType
): Promise<{ name: string; title: string }> => {
  // 每次重读配置：支持用户运行时切换 AI 开关
  const cfg = getAIConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return generateLocalEnemyName(realm);
  }

  try {
    // RealmType 枚举的值已经是中文名称（如 '大一'、'大二'）
    const realmName = realm;

    const adventureContext =
      adventureType === 'secret_realm'
        ? '副本中'
        : adventureType === 'lucky'
          ? '机缘之地'
          : '校园里';

    const prompt = `
      在校园游戏中，玩家在${adventureContext}遭遇了一个对手。
      对手学阶：${realmName}

      请生成一个符合现代校园风格的对手名字和称号。
      名字可以是 bug 名（如：段错误、内存泄漏、编译错误）或人物名（如：监考老师、答辩评委、抢课系统）。
      称号应该描述对手的身份（如：深夜 BUG、监考老师、答辩评委）。

      请以JSON格式返回，格式为：
      {
        "name": "对手名字（2-4个字）",
        "title": "对手称号（2-5个字）"
      }

      只返回JSON，不要其他内容。
    `;

    const content = await requestSpark(
      [
        {
          role: 'system',
          content:
            `${CAMPUS_THEME.aiSetting}\n你是校园游戏的设计师，擅长创造符合现代校园风格的对手名称。请严格返回JSON格式。`,
        },
        { role: 'user', content: prompt },
      ],
      0.9
    );

    const cleaned = stripCodeFence(content);
    const parsed = JSON.parse(cleaned);

    if (parsed.name && parsed.title) {
      return {
        name: neutralizeCampusText(parsed.name.trim()),
        title: neutralizeCampusText(parsed.title.trim()),
      };
    }

    return generateLocalEnemyName(realm);
  } catch (e) {
    console.error('AI生成对手名字失败:', e);
    return generateLocalEnemyName(realm);
  }
};
