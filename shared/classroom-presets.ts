import { translate } from './i18n/text';
import type { Locale } from './i18n/locale';
import type { ClassroomCheck, ClassroomPlan, InAppFile } from './classroom';
import type { Rubric } from './types';
import { presetText } from './classroom-preset-text';

// Step wording (title, brief, starter comments) lives per locale in classroom-preset-text/; this file keeps the checks.
interface Milestone {
  evidence: string[];   // source literals the static checks look for, in check order
}
interface PythonLesson {
  id: string;
  title: string;
  summary: string;
  prerequisite: string;
  boss: string;
  code: string;         // starter skeleton above the step's TODO comment
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
    id: '01-hello', title: '01 · 输出与变量', summary: '用 print、变量和 f-string 制作个人介绍卡。', prerequisite: '零基础；能在课堂编辑器输入并提交代码。', boss: '沉默巨兽',
    code: 'name = "Ada"\nage = 12\n',
    milestones: [
      { evidence: ['print('] },
      { evidence: ['name', 'age', 'print('] },
      { evidence: ['hobby', 'age + 1'] },
    ],
    teacherNote: '让学生现场修改变量验证输出确实随变量变化，检查是否把变量名写进引号。f-string 可用单引号或双引号；不要按引号风格扣分。',
  },
  {
    id: '02-numbers', title: '02 · 数字、输入与类型转换', summary: '把输入的秒数转换成分钟和秒，理解字符串与整数。', prerequisite: '完成 01：变量、print 和基本表达式。', boss: '时间吞噬者',
    code: '',
    milestones: [
      { evidence: ['input(', 'int('] },
      { evidence: ['//', '%'] },
      { evidence: ['//', '%', 'print('] },
    ],
    teacherNote: '重点检查 int、/、//、% 的差异；不要求本课捕获 ValueError。不要让学生为尚未教过的非法输入处理丢分。',
  },
  {
    id: '03-strings', title: '03 · 字符串整理器', summary: '清理空格、统一大小写、替换文本并安全截取预览。', prerequisite: '完成 02：读取输入、变量和类型。', boss: '乱码史莱姆',
    code: 'message = "  Hello PYTHON  "\n',
    milestones: [
      { evidence: ['.strip(', 'len('] },
      { evidence: ['.lower(', '.replace('] },
      { evidence: [':3', '.strip('] },
    ],
    teacherNote: '先问原字符串是否改变，再实际打印验证。切片接受负索引等合理扩展，但不要把字符串短于 3 当作错误输入。',
  },
  {
    id: '04-conditions', title: '04 · 条件判断', summary: '给分数分等级，练习 if / elif / else 和边界条件。', prerequisite: '完成 03；知道整数比较和输入转换。', boss: '边界守门员',
    code: 'score = 85\n',
    milestones: [
      { evidence: ['if ', 'else:'] },
      { evidence: ['elif ', 'else:'] },
      { evidence: ['Invalid score', 'elif '] },
    ],
    teacherNote: '重点检查范围验证的位置和 >= 与 >。接受等价且正确的写法；示例分数都是整数，不要求处理字母输入。',
  },
  {
    id: '05-for', title: '05 · for 与 range', summary: '制作训练计数器：循环、累加和筛选。', prerequisite: '完成 04：比较运算与条件分支。', boss: '重复代码怪',
    code: 'n = 5\n',
    milestones: [
      { evidence: ['for ', 'range('] },
      { evidence: ['total', 'range('] },
      { evidence: ['even_total', '%', 'if '] },
    ],
    teacherNote: '让学生画出每轮 total 的值。接受 += 或等价累加；讲清 range(1, n + 1) 的端点。',
  },
  {
    id: '06-while', title: '06 · while 与循环终止', summary: '做一个有边界的倒计时，再理解 break 与输入哨兵。', prerequisite: '完成 05：循环、累加和条件判断。', boss: '无限循环兽',
    code: 'remaining = 3\n',
    milestones: [
      { evidence: ['while ', 'remaining', 'Launch!'] },
      { evidence: ['while ', 'break', 'input('] },
      { evidence: ['attempts', 'while ', 'break'] },
    ],
    teacherNote: '先手工检查终止条件再运行。遇到无限循环可用 Ctrl+C 中断。明确 attempts 统计读取次数，包括 -1；非整数处理不在本课范围。',
  },
  {
    id: '07-lists', title: '07 · 列表与序列', summary: '建立背包列表，添加物品、遍历并处理空列表。', prerequisite: '完成 06；知道字符串、循环和 len。', boss: '杂乱背包怪',
    code: '',
    milestones: [
      { evidence: ['items', '.append(', 'len('] },
      { evidence: ['for ', '.count('] },
      { evidence: ['Empty bag', 'tuple(', '.append('] },
    ],
    teacherNote: '强调列表可以重复且有顺序，索引从 0 开始。元组仅作序列对比，不要求嵌套可变对象或深入不可变性。',
  },
  {
    id: '08-functions', title: '08 · 函数与返回值', summary: '把重复逻辑封装成函数，区分 print 与 return。', prerequisite: '完成 07：列表、条件判断和循环。', boss: '复制粘贴魔王',
    code: '',
    milestones: [
      { evidence: ['def greet(', 'return '] },
      { evidence: ['def total(', 'for ', 'return '] },
      { evidence: ['assert ', 'total(', 'greet('] },
    ],
    teacherNote: '检查函数每次调用是否重新初始化局部累加值，解释 return 与 print。断言是本地自测；平台不会执行上传代码。',
  },
  {
    id: '09-dict', title: '09 · dict：班级物资仓库', summary: '用键值对管理库存，安全查询、更新，并遍历字典。', prerequisite: '完成 08；会使用列表、函数、条件和循环。', boss: '丢失键巨龙',
    code: '',
    milestones: [
      { evidence: ['inventory[', 'inventory'] },
      { evidence: ['def add_stock(', '.get(', 'return '] },
      { evidence: ['.items(', 'assert ', 'add_stock('] },
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
  return pythonClassroomPresets.map(p => ({ ...p, title: translate(p.title, lang), summary: translate(p.summary, lang), prerequisite: p.id === '01-hello' ? presetText[lang].ui.prerequisite : translate(p.prerequisite, lang) }));
}
const lessonFor = (id: string, lang: Locale = 'zh') => {
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) throw new Error('Unknown Python classroom preset');
  return { ...lesson, title: translate(lesson.title, lang), summary: translate(lesson.summary, lang), prerequisite: lesson.id === '01-hello' ? presetText[lang].ui.prerequisite : translate(lesson.prerequisite, lang), boss: translate(lesson.boss, lang), teacherNote: translate(lesson.teacherNote, lang), steps: presetText[lang].lessons[id] };
};
const fill = (template: string, file: string) => template.replaceAll('{file}', file);

// No lesson title/summary in the .py header: titles like "for and range" would satisfy the `for ` check by themselves.
function starterSource(id: string, stepIndex: number, lang: Locale): string {
  const lesson = lessonFor(id, lang), [first, ...rest] = lesson.steps[stepIndex].comment;
  return `# ${fill(presetText[lang].ui.run, pathFor(id))}\n\n${lesson.code}${lesson.code ? '\n' : ''}`
    + `# TODO: ${first}\n${rest.map(line => `#       ${line}\n`).join('')}`;
}
export function pythonStarter(id: string, lang: Locale = 'zh'): { filename: string; content: string } {
  return { filename: pathFor(id), content: starterSource(id, 0, lang) };
}
function stepStarter(id: string, stepIndex: number, lang: Locale): InAppFile[] {
  const lesson = lessonFor(id, lang), step = lesson.steps[stepIndex], ui = presetText[lang].ui;
  const readme = [`# ${lesson.title}`, `## ${ui.step.replace('{n}', String(stepIndex + 1))} · ${step.title}`, step.goal,
    `### ${ui.readmeTask}\n\n${step.todo.map(item => `- [ ] ${item}`).join('\n')}`,
    `## ${ui.cases}\n\n| ${ui.input} | ${ui.expected} | ${ui.actual} |\n| --- | --- | --- |\n| TODO | TODO | TODO |\n| TODO | TODO | TODO |`,
    `## ${ui.improvement}\n\nTODO\n`].join('\n\n');
  return [{ path: pathFor(id), content: starterSource(id, stepIndex, lang) }, { path: recordFor(id), content: readme }];
}
export function pythonTeacherGuide(id: string, lang: Locale = 'zh'): string {
  const lesson = lessonFor(id, lang), tr = (s: string) => translate(s, lang), ui = presetText[lang].ui;
  return [lesson.title, tr('建议课时：30 分钟，三个步骤各 10 分钟；可根据班级情况延长。'), tr(`前置知识：${lesson.prerequisite}`), tr(`备课重点：${lesson.teacherNote}`),
    ui.teacher,
    tr('每步建议：演示 2 分钟 → 独立编码 5 分钟 → 同桌检查 2 分钟 → 提交与集体攻击 1 分钟。'),
    tr('检查范围：预设只检查文件、源码片段与自测记录。文本片段可能出现在注释中，检查通过不代表程序正确。请让学生运行示例并解释结果，再用教师复核记录最终功能分数。接受正确的等价实现；可删除不适用的文本检查，或添加自己仓库的 GitHub CI 检查。'),
    ...lesson.steps.map((step, i) => `${ui.step.replace('{n}', String(i + 1))} · ${step.title}\n${step.summary}${step.example ? `\n\n${step.example.output}` : ''}`),
  ].join('\n\n');
}

export function pythonClassroomPlan(id: string, lang: Locale = 'zh'): ClassroomPlan {
  const lesson = lessonFor(id, lang), file = pathFor(id), record = recordFor(id), ui = presetText[lang].ui;
  const tr = (s: string) => translate(s, lang);
  const rubric: Rubric = { title: tr('Python 课堂提交证据（教师复核功能）'), source: 'default', criteria: [
    { id: 'python-file', name: tr('提交本课 Python 文件'), weight: 1, signal: 'check', description: tr(`检查 ${file} 是否存在；不执行代码。`), check: { kind: 'path-exists', value: file } },
  ] };
  return {
    title: tr(`Python 基础 · ${lesson.title}`), bossName: lesson.boss,
    steps: lesson.milestones.map((milestone, i) => {
      const text = lesson.steps[i];
      const checks: ClassroomCheck[] = [
        { id: 'source', kind: 'file', path: file, label: fill(ui.checkFile, file) },
        ...milestone.evidence.map((text, index) => ({ id: `syntax-${index}`, kind: 'contains' as const, path: file, text, label: ui.checkCode.replace('{text}', text) })),
      ];
      // doneWhen pairs with checks by index: file, one row per evidence literal, then the README record.
      const doneWhen = [fill(ui.fileDone, file), ...text.done];
      if (i > 0) { checks.push({ id: 'record', kind: 'file', path: record, label: fill(ui.checkRecord, record) }); doneWhen.push(fill(ui.recordDone, record)); }
      return {
        id: `${id}-${i + 1}`, title: text.title, durationSec: 600, rubric: structuredClone(rubric), checks, checksWeight: 100,
        language: 'python', starter: stepStarter(id, i, lang),
        instructions: `${text.summary}\n\n${fill(ui.where, file)}`,
        brief: { goal: text.goal, todo: [...text.todo], doneWhen, ...(text.example ? { example: { ...text.example } } : {}), hints: [...text.hints], concepts: [...text.concepts] },
      };
    }),
  };
}
