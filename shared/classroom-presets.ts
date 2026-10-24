import { translate } from './i18n/text';
import type { Locale } from './i18n/locale';
import type { ClassroomCheck, ClassroomPlan } from './classroom';
import type { Rubric } from './types';

interface Milestone {
  title: string;
  task: string;
  examples: string;
  evidence: string[];
}
interface PythonLesson {
  id: string;
  title: string;
  summary: string;
  prerequisite: string;
  boss: string;
  starter: string;
  milestones: [Milestone, Milestone, Milestone];
  teacherNote: string;
}
export interface ClassroomPreset {
  id: string;
  title: string;
  summary: string;
  prerequisite: string;
  minutes: number;
  file: string;
}

const lessons: PythonLesson[] = [
  {
    id: '01-hello', title: '01 · 输出与变量', summary: '用 print、变量和 f-string 制作个人介绍卡。', prerequisite: '零基础；能打开编辑器、运行 Python 3，并提交到 GitHub。', boss: '沉默巨兽',
    starter: 'name = "Ada"\nage = 12\n\n# 在下面完成课堂任务。\n',
    milestones: [
      { title: '让程序开口', task: '输出两行文字：第一行 Hello, Python!，第二行写一句你自己的介绍。先在终端运行成功，再提交代码。', examples: '第一行必须是 Hello, Python!；第二行由你决定。说明一对引号和一对括号分别做什么。', evidence: ['print('] },
      { title: '把信息放进变量', task: '使用 name 和 age 保存姓名与年龄，再输出它们。将姓名改成 Lin、年龄改成 15，只改变量赋值，不改输出语句。', examples: 'name="Lin", age=15 时，输出应包含 Lin 和 15。解释变量名与字符串 "name" 的区别。', evidence: ['name', 'age', 'print('] },
      { title: '升级介绍卡', task: '增加 hobby 变量，用 f-string 输出一条完整介绍。输出明年的年龄 age + 1。记录修改变量前后的两次结果，并解释为什么数字不需要引号。', examples: 'name="Lin", age=15, hobby="coding"：介绍包含 Lin、15、coding；明年年龄为 16。', evidence: ['hobby', 'age + 1'] },
    ],
    teacherNote: '让学生现场修改变量验证输出确实随变量变化，检查是否把变量名写进引号。f-string 可用单引号或双引号；不要按引号风格扣分。',
  },
  {
    id: '02-numbers', title: '02 · 数字、输入与类型转换', summary: '把输入的秒数转换成分钟和秒，理解字符串与整数。', prerequisite: '完成 01：变量、print 和基本表达式。', boss: '时间吞噬者',
    starter: '# 接收用户输入，完成秒数转换器。\n',
    milestones: [
      { title: '读入一个数字', task: '用 input 读取非负整数秒数，用 int 转换类型，再输出秒数加 1。暂时只处理合法整数输入。', examples: '输入 59 → 输出 60；输入 0 → 输出 1。说明为什么不能直接给 input 的结果加整数 1。', evidence: ['input(', 'int('] },
      { title: '拆成分钟与秒', task: '使用 // 和 % 把总秒数拆成分钟和剩余秒数。输出“2 分 5 秒”这样的结果。不要用小数近似余数。', examples: '125 → 2 分 5 秒；60 → 1 分 0 秒；59 → 0 分 59 秒。', evidence: ['//', '%'] },
      { title: '检查边界', task: '测试 0、59、60、125、3600，核对“分钟 * 60 + 余秒”等于原始输入。把支持非负整数的输入约定写入自测记录；字母输入的处理留到条件或异常课程。', examples: '0 → 0 分 0 秒；3600 → 60 分 0 秒。记录每个输入的预期与实际输出。', evidence: ['//', '%', 'print('] },
    ],
    teacherNote: '重点检查 int、/、//、% 的差异；不要求本课捕获 ValueError。不要让学生为尚未教过的非法输入处理丢分。',
  },
  {
    id: '03-strings', title: '03 · 字符串整理器', summary: '清理空格、统一大小写、替换文本并安全截取预览。', prerequisite: '完成 02：读取输入、变量和类型。', boss: '乱码史莱姆',
    starter: 'message = "  Hello PYTHON  "\n\n# 整理 message，并输出处理结果。\n',
    milestones: [
      { title: '去掉首尾空白', task: '对 message 使用 strip，输出清理后的文字与长度。保留中间空格。不要把处理结果只打印出来而忘记保存。', examples: '"  Hello PYTHON  " → "Hello PYTHON"，长度 12；"   " → 空字符串，长度 0。', evidence: ['.strip(', 'len('] },
      { title: '统一和替换', task: '把清理后的文字转成小写，再把 python 替换成 world。保留原始 message，分别输出原文和处理结果，观察字符串方法不会原地修改原文。', examples: '"  Hello PYTHON  " → "hello world"；"PYTHON python" → "world world"。', evidence: ['.lower(', '.replace('] },
      { title: '做一个安全预览', task: '用切片显示处理结果的前 3 个字符。测试空字符串、1 个字符和较长字符串；不要直接读取第 3 个字符，以免短字符串越界。记录切片与索引的差别。', examples: '"hello world" → "hel"；"A" 经处理后预览为 "a"；空字符串的预览仍为空。', evidence: [':3', '.strip('] },
    ],
    teacherNote: '先问原字符串是否改变，再实际打印验证。切片接受负索引等合理扩展，但不要把字符串短于 3 当作错误输入。',
  },
  {
    id: '04-conditions', title: '04 · 条件判断', summary: '给分数分等级，练习 if / elif / else 和边界条件。', prerequisite: '完成 03；知道整数比较和输入转换。', boss: '边界守门员',
    starter: 'score = 85\n\n# 根据 score 输出对应结果。\n',
    milestones: [
      { title: '判断是否通过', task: '使用 if / else：分数至少 60 输出 Pass，否则输出 Retry。先使用 score 变量，不要求交互输入。', examples: '59 → Retry；60 → Pass；100 → Pass。必须测试 59 和 60 两侧的边界。', evidence: ['if ', 'else:'] },
      { title: '加入多个等级', task: '使用 if / elif / else：90–100 为 A，80–89 为 B，60–79 为 C，0–59 为 Retry。从较高分开始判断，保证每次只输出一个等级。', examples: '90 → A；89 → B；80 → B；79 → C；60 → C；59 → Retry。', evidence: ['elif ', 'else:'] },
      { title: '拒绝范围外的分数', task: '在等级判断之前检查范围。小于 0 或大于 100 输出 Invalid score，不再输出等级。使用 or 或等价的比较逻辑。记录 -1、0、100、101 的结果。', examples: '-1、101 → Invalid score；0 → Retry；100 → A。', evidence: ['Invalid score', 'elif '] },
    ],
    teacherNote: '重点检查范围验证的位置和 >= 与 >。接受等价且正确的写法；示例分数都是整数，不要求处理字母输入。',
  },
  {
    id: '05-for', title: '05 · for 与 range', summary: '制作训练计数器：循环、累加和筛选。', prerequisite: '完成 04：比较运算与条件分支。', boss: '重复代码怪',
    starter: 'n = 5\n\n# 用循环完成计数与统计。\n',
    milestones: [
      { title: '重复而不复制', task: '使用 for 和 range，依次输出从 1 到 n 的整数。n=0 时不输出数字。不要手写多条 print 模拟循环。', examples: 'n=3 → 三行 1、2、3；n=0 → 没有数字行。注意 range 的结束值不包含在循环里。', evidence: ['for ', 'range('] },
      { title: '累加训练得分', task: '在循环前创建 total=0，每轮加入当前数字，最后只输出总和。不能在循环内部把 total 重置为 0。', examples: 'n=5 → 15；n=1 → 1；n=0 → 0。先手算，再比较程序结果。', evidence: ['total', 'range('] },
      { title: '只累计偶数', task: '在循环中用条件判断只累计偶数，输出 even_total。使用取余判断偶数；测试不同大小的 n，并记录为什么空循环的总和仍然是 0。', examples: 'n=6 → 12；n=5 → 6；n=1 或 0 → 0。', evidence: ['even_total', '%', 'if '] },
    ],
    teacherNote: '让学生画出每轮 total 的值。接受 += 或等价累加；讲清 range(1, n + 1) 的端点。',
  },
  {
    id: '06-while', title: '06 · while 与循环终止', summary: '做一个有边界的倒计时，再理解 break 与输入哨兵。', prerequisite: '完成 05：循环、累加和条件判断。', boss: '无限循环兽',
    starter: 'remaining = 3\n\n# 保证每一轮都朝终止条件前进。\n',
    milestones: [
      { title: '可终止的倒计时', task: '当 remaining 大于 0 时输出它，每轮减少 1；循环结束后输出 Launch!。运行前先指出哪个语句保证循环结束。', examples: 'remaining=3 → 3、2、1、Launch!；remaining=0 → 只输出 Launch!。', evidence: ['while ', 'remaining', 'Launch!'] },
      { title: '重复读取直到停止', task: '改成持续读取非负整数，输入 -1 时用 break 结束。其他输入加进 total。终止值 -1 不计入总和。只要求处理整数输入。', examples: '依次输入 2、3、-1 → 总和 5；第一次输入 -1 → 总和 0。', evidence: ['while ', 'break', 'input('] },
      { title: '给程序加护栏', task: '增加最多 5 次输入的限制，用 attempts 统计实际读取次数。到达限制或输入 -1 都停止。输出总和与次数；测试一直不输入 -1 的情况。', examples: '输入 1、1、1、1、1 → 总和 5，次数 5；输入 -1 → 总和 0，次数 1。约定终止输入也算一次读取。', evidence: ['attempts', 'while ', 'break'] },
    ],
    teacherNote: '先手工检查终止条件再运行。遇到无限循环可用 Ctrl+C 中断。明确 attempts 统计读取次数，包括 -1；非整数处理不在本课范围。',
  },
  {
    id: '07-lists', title: '07 · 列表与序列', summary: '建立背包列表，添加物品、遍历并处理空列表。', prerequisite: '完成 06；知道字符串、循环和 len。', boss: '杂乱背包怪',
    starter: '# 建立并管理自己的物品列表。\n',
    milestones: [
      { title: '建立与修改背包', task: '创建名为 items 的列表，包含 apple 和 book。用 append 加入 pen，然后输出列表与长度。观察列表在添加前后的变化。', examples: '初始长度 2；添加后长度 3，顺序仍然是 apple、book、pen。', evidence: ['items', '.append(', 'len('] },
      { title: '逐个展示物品', task: '使用 for 遍历 items，每行显示一个物品。再用 count 统计 apple 出现的次数，保留重复物品。', examples: '["apple", "book", "apple"] → apple 出现 2 次，遍历仍输出三行；[] → 0 次且没有物品行。', evidence: ['for ', '.count('] },
      { title: '空背包也能用', task: '取第一个物品之前先检查列表是否为空；空列表输出 Empty bag。创建 tuple(items) 作为只读序列快照，向原列表追加新物品后比较两者长度。', examples: 'items=[] → Empty bag；快照来自两个物品，原列表追加后长度 3，快照长度仍为 2。解释列表与元组的区别。', evidence: ['Empty bag', 'tuple(', '.append('] },
    ],
    teacherNote: '强调列表可以重复且有顺序，索引从 0 开始。元组仅作序列对比，不要求嵌套可变对象或深入不可变性。',
  },
  {
    id: '08-functions', title: '08 · 函数与返回值', summary: '把重复逻辑封装成函数，区分 print 与 return。', prerequisite: '完成 07：列表、条件判断和循环。', boss: '复制粘贴魔王',
    starter: '# 在这里定义函数，并在定义后调用验证。\n',
    milestones: [
      { title: '传入参数，拿回结果', task: '定义 greet(name)，返回字符串 Hello, 后接姓名。调用者负责 print 结果。不要只在函数内部打印而没有返回值。', examples: 'greet("Ada") → "Hello, Ada"；greet("Lin") → "Hello, Lin"。把结果保存到变量后再打印。', evidence: ['def greet(', 'return '] },
      { title: '封装列表求和', task: '定义 total(numbers)，用循环累加列表元素并返回总和。调用两次，确认第二次不会保留第一次的累加结果。', examples: 'total([2, 3]) → 5；total([]) → 0；再次 total([1]) → 1。', evidence: ['def total(', 'for ', 'return '] },
      { title: '用断言防止改坏', task: '写至少三条 assert 检查 total 的正常输入、空列表和负数；增加 greet 的一条断言。运行全部断言，再将结果记录到自测文件。', examples: 'total([-1, 2]) → 1；所有断言通过时程序正常退出。故意改坏一个预期值，观察 AssertionError，再修复。', evidence: ['assert ', 'total(', 'greet('] },
    ],
    teacherNote: '检查函数每次调用是否重新初始化局部累加值，解释 return 与 print。断言是本地自测；平台不会执行上传代码。',
  },
  {
    id: '09-dict', title: '09 · dict：班级物资仓库', summary: '用键值对管理库存，安全查询、更新，并遍历字典。', prerequisite: '完成 08；会使用列表、函数、条件和循环。', boss: '丢失键巨龙',
    starter: '# 使用 inventory 管理物品名称和数量。\n',
    milestones: [
      { title: '从列表升级为键值对', task: '创建 inventory 字典，apple 对应 3，book 对应 2。用 inventory["apple"] 读取数量，再将 apple 更新为 5。添加 pen=1。说明键和值分别表示什么。', examples: '更新后 apple=5、book=2、pen=1；相同的键更新后只保留一个对应项。', evidence: ['inventory[', 'inventory'] },
      { title: '安全查询与入库', task: '定义 add_stock(inventory, name, amount)，使用 get(name, 0) 读取旧数量，再写回增加后的数量。amount 小于 0 时不修改库存，返回 False；成功时返回 True。', examples: '初始 {"apple":3}，增加 apple 2 → 5；增加 pen 1 → 新建 pen=1；增加 apple -1 → 库存不变并返回 False。', evidence: ['def add_stock(', '.get(', 'return '] },
      { title: '生成报告并自测', task: '使用 items() 遍历并输出物品与数量，计算总数量。为已有键、新键、空字典和负数入库写 assert。列表中位置相同与字典中键相同有什么不同？写入反思。', examples: '{"apple":5,"book":2,"pen":1} → 总数量 8；{} → 总数量 0。报告的行顺序不作为评分要求。', evidence: ['.items(', 'assert ', 'add_stock('] },
    ],
    teacherNote: '可直接修改传入字典，不强制复制。检查 .get 的默认值、重复键覆盖、空字典，以及负数入库不应修改数据。不要把字典顺序或单/双引号风格作为功能要求。',
  },
];

const pathFor = (id: string) => `python/${id.replaceAll('-', '_')}.py`;
const recordFor = (_id: string) => 'README.md';
export const pythonClassroomPresets: readonly ClassroomPreset[] = lessons.map(lesson => ({
  id: lesson.id, title: lesson.title, summary: lesson.summary, prerequisite: lesson.prerequisite, minutes: 30, file: pathFor(lesson.id),
}));
export function getPythonClassroomPresets(lang: Locale): readonly ClassroomPreset[] {
  return pythonClassroomPresets.map(p => ({ ...p, title: translate(p.title, lang), summary: translate(p.summary, lang), prerequisite: translate(p.prerequisite, lang) }));
}
const lessonFor = (id: string, lang: Locale = 'zh') => {
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) throw new Error('Unknown Python classroom preset');
  return { ...lesson, title: translate(lesson.title, lang), summary: translate(lesson.summary, lang), prerequisite: translate(lesson.prerequisite, lang), boss: translate(lesson.boss, lang), starter: translate(lesson.starter, lang), teacherNote: translate(lesson.teacherNote, lang), milestones: lesson.milestones.map(m => ({ ...m, title: translate(m.title, lang), task: translate(m.task, lang), examples: translate(m.examples, lang) })) };
};

export function pythonStarter(id: string, lang: Locale = 'zh'): { filename: string; content: string } {
  const lesson = lessonFor(id, lang);
  return { filename: pathFor(id), content: `# ${lesson.title}\n# ${translate(`Python 3 · 运行：python3 ${pathFor(id)}`, lang)}\n# ${lesson.summary}\n\n${lesson.starter}` };
}
export function pythonTeacherGuide(id: string, lang: Locale = 'zh'): string {
  const lesson = lessonFor(id, lang), tr = (s: string) => translate(s, lang);
  return [lesson.title, tr('建议课时：30 分钟，三个步骤各 10 分钟；可根据班级情况延长。'), tr(`前置知识：${lesson.prerequisite}`), tr(`备课重点：${lesson.teacherNote}`),
    tr('每步建议：演示 2 分钟 → 独立编码 5 分钟 → 同桌检查 2 分钟 → 提交与集体攻击 1 分钟。'),
    tr('检查范围：预设只检查文件、源码片段与自测记录。文本片段可能出现在注释中，检查通过不代表程序正确。请让学生运行示例并解释结果，再用教师复核记录最终功能分数。接受正确的等价实现；可删除不适用的文本检查，或添加自己仓库的 GitHub CI 检查。'),
    ...lesson.milestones.map((m, i) => `${tr(`第 ${i + 1} 步 · ${m.title}`)}\n${m.examples}`),
  ].join('\n\n');
}

export function pythonClassroomPlan(id: string, lang: Locale = 'zh'): ClassroomPlan {
  const lesson = lessonFor(id, lang), file = pathFor(id), record = recordFor(id);
  const tr = (s: string) => translate(s, lang);
  const rubric: Rubric = { title: tr('Python 课堂提交证据（教师复核功能）'), source: 'default', criteria: [
    { id: 'python-file', name: tr('提交本课 Python 文件'), weight: 1, signal: 'check', description: tr(`检查 ${file} 是否存在；不执行代码。`), check: { kind: 'path-exists', value: file } },
  ] };
  return {
    title: tr(`Python 基础 · ${lesson.title}`), bossName: lesson.boss,
    steps: lesson.milestones.map((milestone, i) => {
      const checks: ClassroomCheck[] = [
        { id: 'source', kind: 'file', path: file, label: tr('本课 Python 文件已提交') },
        ...milestone.evidence.map((text, index) => ({ id: `syntax-${index}`, kind: 'contains' as const, path: file, text, label: tr(`源码片段：${text}（不是运行结果）`) })),
      ];
      if (i > 0) checks.push({ id: 'record', kind: 'file', path: record, label: tr('自测与改进记录已提交') });
      return {
        id: `${id}-${i + 1}`, title: milestone.title, durationSec: 600, rubric: structuredClone(rubric), checks, checksWeight: 100,
        instructions: [tr('学习目标'), lesson.summary, tr('本步任务'), milestone.task,
          tr('文件与运行'), tr(`在仓库创建 ${file}，使用 Python 3。运行：python3 ${file}。`),
          i === 0 ? `${tr('可以从下面的起始代码开始：')}\n\n${pythonStarter(id, lang).content}` : tr('继续修改同一个文件，保留前一步仍需要的功能。'),
          tr('自测示例'), milestone.examples, tr('记录与提交'),
          (i === 0 ? tr('运行成功后，') : tr(`在仓库根目录的 ${record} 中添加本课标题，并记录至少两个案例，每个写“输入 / 预期 / 实际”，再写一句你改进了什么。然后`)) + tr('保存、commit、push 到 GitHub，回课堂提交最新分支。'),
          tr('评分说明'), tr('当前分数是静态提交证据分，不是程序正确率。源码片段和记录通过后，仍需运行上面的示例并请教师复核。正确的等价写法可由教师调整检查。'),
        ].join('\n\n'),
      };
    }),
  };
}
