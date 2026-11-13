import type { ClassroomQuestion, ClassroomStep } from '../shared/classroom';

export const fencedPython = (text: string): string[] => typeof text === 'string' ? [...text.matchAll(/```(?:python|py)?\s*\n([\s\S]*?)```/gi)].map(m => m[1].trim()) : [];

/** A concept can mention outputs, functions or loop termination without asking
 * for an execution result. Code presence alone must never require verification. */
export function asksConcreteExecution(prompt: string, context = ''): boolean {
  const text = prompt.replace(/```[\s\S]*?```/g, '');
  const call = /\b\w+\(\s*\)|\b\w+\([^\n)]*(?:\b\d|\[|["']|\b(?:True|False|None)\b)[^\n)]*\)/.test(text);
  if (/\b(?:purpose|keyword|definition|define|return statement|print statement|why|which statement)\b|(?:关键字|语句的作用|区别|定义|为什么)/i.test(text)) return false;
  if (!call && /\btrue or false\b|判断对错/i.test(text)) return false;
  const value = /\b(?:what|which)\b[\s\S]{0,100}\b(?:return(?:s|ed)?|outputs?|values?|results?|prints?|indices|sequences?|traces?)\b|\b(?:compute|calculate|evaluate|trace)\b|\b(?:how many|number of|count of)\b[\s\S]{0,70}\b(?:iterations?|comparisons?|loops?|calls?|steps?)\b|\b(?:result|value)\s*(?:is\s*)?\{\{|(?:返回什么|返回值|输出什么|运行结果|计算|多少次|几次|结果.*\{\{)/i.test(text);
  const code = [...fencedPython(prompt), ...fencedPython(context)].join('\n');
  const name = /\bwhat\s+(?:is|are)\s+(?:the\s+)?(?:value\s+of\s+)?([a-z_]\w*)(?:\s+(?:in|after|when|given)\b[^?]{0,100})?\s*\?/i.exec(text)?.[1];
  const variable = !!name && new RegExp('(?:^|\\n)\\s*' + name + '\\s*=').test(code);
  const shownCode = !!code;
  return ((value || variable) && (call || shownCode)) || (call && /\b(?:returns?|outputs?|prints?|results?|values?)\b|返回|输出/.test(text));
}

const sorting = ['bubble', 'insertion', 'selection', 'merge', 'quick', 'heap', 'shell', 'radix', 'counting'] as const;
const sortingChinese: Record<string, string> = { 'bubble sort': '冒泡排序', 'insertion sort': '插入排序', 'selection sort': '选择排序', 'merge sort': '归并排序', 'quick sort': '快速排序', 'heap sort': '堆排序', 'shell sort': '希尔排序', 'radix sort': '基数排序', 'counting sort': '计数排序' };
/** Heading/image-only references do not teach an algorithm. A real explanation
 * or implementation in that topic's own section is required, not a later task. */
export function unsupportedSortingTopics(reference: string): string[] {
  const lines = reference.replace(/\f/g, '\n').split('\n');
  return sorting.filter(name => {
    const label = new RegExp(`\\b${name}[\\s_-]*sort(?:ing)?\\b|${sortingChinese[name + ' sort']}`, 'i');
    for (let i = 0; i < lines.length; i++) if (label.test(lines[i])) {
      const section = [lines[i].replace(label, '')];
      for (let j = i + 1; j < lines.length && section.length < 30; j++) {
        if (/^\s*(?:[#*\s]*\b(?:bubble|insertion|selection|merge|quick|heap|shell|radix|counting)[\s_-]*sort|(?:question|exercise)\s*\d+|[#*\s]*(?:冒泡|插入|选择|归并|快速|堆|希尔|基数|计数)排序|第\s*\d+\s*题)/i.test(lines[j])) break;
        section.push(lines[j]);
      }
      const body = section.join('\n').replace(/sample solution/gi, '');
      if (body.length >= 35 && /\b(?:compar\w*|swap\w*|partition\w*|pivot\w*|heapify|recurs\w*|gap|buckets?|digits?|adjacent)\b|def\s+\w*sort\w*\s*\(/i.test(body) || body.length >= 20 && /比较|交换|枢轴|递归|相邻|分区/.test(body)) return false;
    }
    return true;
  }).map(name => name + ' sort');
}
export function unsupportedSortingError(text: string, reference?: string): string | undefined {
  if (reference === undefined) return;
  const missing = unsupportedSortingTopics(reference).filter(topic => new RegExp('\\b' + topic.replace(' ', '[\\s_-]*') + '(?:ing)?\\b', 'i').test(text) || text.includes(sortingChinese[topic]));
  if (missing.length) return `Sorting content is unavailable beyond headings or absent from the reference: ${missing.join(', ')}; omit these topics until their explanations/figures are available`;
}
export function questionContentError(q: ClassroomQuestion, reference?: string): string | undefined {
  const text = q.prompt;
  if (/\b(?:cover(?:s|ed)?|included?|discussed|taught|topics?|syllabus|course outline)\b[\s\S]{0,100}\b(?:module|chapter|unit|syllabus)\b|\b(?:module|chapter|unit)\s*\d*\b[\s\S]{0,100}\b(?:cover(?:s|ed)?|included?|topics?|algorithms?|discussed|taught)\b|(?:课程|模块|章节|大纲).{0,40}(?:包含|涵盖|讲过|讲授|哪些算法|哪些主题)/i.test(text)) return 'Do not generate syllabus-recall questions about which topics/algorithms a module covers';
  const unavailable = unsupportedSortingError([text, ...(q.kind === 'blank' ? [] : q.options.map(o => o.text))].join('\n'), reference);
  if (unavailable) return unavailable;
  if (q.kind === 'multi' && (q.options.length - q.answer.length < 2 || q.answer.length > Math.floor(q.options.length / 2))) return 'Multi-select requires at least two plausible wrong options and no more than half its options correct; rewrite claims, do not guess distractors';
}

/** Conservative reading/trace budget, independent of a model's timer estimate. */
export function questionWorkSeconds(q: ClassroomQuestion, context = ''): number {
  if (!q || typeof q.prompt !== 'string') return 0;
  const own = fencedPython(q.prompt).join('\n'), code = context + '\n' + own;
  const options = q.kind === 'blank' || !Array.isArray(q.options) ? [] : q.options.map(o => typeof o?.text === 'string' ? o.text : '');
  const lists = [...[context, q.prompt, ...options].join('\n').matchAll(/\[([^\]\n]*)\]/g)];
  const length = Math.max(0, ...lists.map(m => m[1].split(',').filter(v => v.trim()).length));
  const multiple = /\b(?:counterexample|which input|for which|which.*(?:fix|change)|each (?:input|option))\b|反例|哪个输入|哪项修改/i.test(q.prompt);
  const execution = asksConcreteExecution(q.prompt, context ? '```python\n' + context + '\n```' : '') || multiple;
  let seconds = q.kind === 'multi' ? 25 : q.kind === 'blank' ? 20 : 15;
  if (execution) {
    const functions = Math.max(1, (code.match(/^def\s/gm) ?? []).length), loops = (code.match(/\b(?:for|while)\b/g) ?? []).length;
    seconds = multiple ? Math.max(90, options.length * Math.min(functions, 3) * 15) : 45;
    seconds += Math.max(0, length - 5) * 5 + Math.min(4, loops) * 5 + Math.max(0, own.split('\n').length - 8) * 2;
  }
  return seconds;
}
export function stepQuestionSeconds(step: Pick<ClassroomStep, 'questions' | 'questionContext'>): number {
  const context = fencedPython(step.questionContext ?? '').join('\n');
  return (Array.isArray(step.questions) ? step.questions : []).reduce((n, q) => n + questionWorkSeconds(q, context), 0) + (context ? Math.ceil(context.split('\n').length * 1.5) : 0);
}

/** Hints may name variables, but must not give executable replacement code. */
export function exactFixHint(hint: string): boolean {
  return fencedPython(hint).length > 0 || /(?:`[^`]*(?:<=|>=|==|!=|\+=|-=|(?<![<>=!])=(?!=)|\breturn\b|\bwhile\b|\bfor\b|\w+\s*\([^)]*\))[^`]*`)|\b(?:replace|change|insert|add|use|keep|set|update)\b[^.\n]{0,100}(?:<=|>=|==|!=|\+=|-=|(?<![<>=!])=(?!=)|\breturn\s+[^\s.,;]+)|(?:改为|替换为|插入|补上).{0,50}(?:[<>=]|return|while|for)/i.test(hint);
}
export function missingLineAnswer(q: ClassroomQuestion): boolean {
  if (!/\b(?:missing|complete|fix|change|replace|insert|add|line)\b|缺失|补全|修复|哪行|修改/i.test(q.prompt)) return false;
  const keys = q.kind === 'single' ? [q.answer] : q.kind === 'multi' ? q.answer : [];
  const answers = q.kind === 'blank' ? q.blanks.flatMap(b => b.accept) : q.options.filter(o => keys.includes(o.id)).map(o => o.text);
  return answers.some(s => /\b(?:return|while|for|if|elif|else|raise|def)\b|(?:<=|>=|==|!=|\+=|-=|(?<![<>=!])=(?!=))|\b\w+(?:\.\w+)?\([^)]*\)/.test(s));
}
