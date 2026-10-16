/** 仅适配已知旧设定文案；不用于玩家姓名、ID、配方键或数值字段。 */
const LEGACY_CAMPUS_COPY: ReadonlyArray<readonly [RegExp, string]> = [
  [/电子与光学工程学院/g, '电路学部'],
  [/通信与信息工程学院/g, '信号学部'],
  [/网络空间安全学院/g, '网络学部'],
  [/柔性电子（未来技术）学院/g, '光电学部'],
  [/材料科学与工程学院/g, '材料学部'],
  [/计算机学院/g, '算法学部'],
  [/物联网学院/g, '物联学部'],
  [/自动化学院/g, '自控学部'],
  [/南邮修仙传/g, '校园成长记'],
  [/南京邮电大学|南京邮电|南邮|\b(?:NJUPT|NUPT)\b/gi, '学园'],
  [/\bNPU\b(?=\s*(?:入学新生|历年期末|校园|学子|学院|大学|课程|研习|手记|期末|工科))/gi, '学园'],
  [/三牌楼/g, '西区'],
  [/仙林/g, '东区'],
  [/信达天下[，,、\s]*自强不息/g, '一页日常，一点成长'],
  [/厚德[ ·、，]*弘毅[ ·、，]*求是[ ·、，]*笃行/g, '学习 · 实践 · 记录 · 成长'],
  [/南京的冬天/g, '校园的冬天'],
  [/中国科学院院士/g, '学园荣誉导师'],
];

export function neutralizeCampusText(text: string | null | undefined): string {
  return LEGACY_CAMPUS_COPY.reduce(
    (copy, [pattern, replacement]) => copy.replace(pattern, replacement),
    typeof text === 'string' ? text : ''
  );
}
