import type { ClassroomPlan } from '../../shared/classroom';
import { h } from './util';
import { questionPreview } from '../edu/question-view';
import { MODE_LABEL } from '../edu/question-editor';
import { hasQuestions, stepMode } from '../edu/questions';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Generated course difficulty, sent as ?difficulty= on POST /api/course/generate. */
export const COURSE_DIFFICULTIES = ['easy', 'medium', 'hard', 'very-hard', 'extreme'] as const;
export type CourseDifficulty = typeof COURSE_DIFFICULTIES[number];
const DIFFICULTY_LABEL: Record<CourseDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', 'very-hard': 'Very hard', extreme: 'Extreme' };
/** What kind of class session to generate, sent as ?preset=. */
export const COURSE_PRESETS = ['lesson', 'quiz', 'exercise', 'warmup', 'exam'] as const;
export type CoursePreset = typeof COURSE_PRESETS[number];
const PRESET_TEXT: Record<CoursePreset, [string, string]> = {
  lesson: ['Lesson', 'Teach the material step by step, with code tasks and checkpoint questions.'],
  quiz: ['Quiz', 'A quick TopHat-style check of what the class understood.'],
  exercise: ['Exercise', 'Pearson-style practice with instant feedback on every answer.'],
  warmup: ['Warm-up', 'A lively icebreaker to energize the class.'],
  exam: ['Exam', 'No hints, and the answers are never revealed.'],
};
export const COURSE_PROMPT_MAX = 2000;
const remember = { get(key: string) { try { return localStorage.getItem(key); } catch { return null; } }, set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* optional */ } } };
/** Apply only course content; keep the teacher's guidance and review settings. */
export function mergeCourseDraft(current: ClassroomPlan, generated: ClassroomPlan): ClassroomPlan {
  return { ...structuredClone(current), title: generated.title, bossName: generated.bossName, steps: structuredClone(generated.steps) };
}
export function createCourseUpload(options: { room: string; token?: string; onApply(plan: ClassroomPlan): void; fetch?: typeof fetch }) {
  let disposed = false, generation = 0;
  const controller = new AbortController();
  const file = h('input', { type: 'file', accept: '.pdf,.md,.txt', 'aria-label': 'Course source file', 'data-testid': 'course-file' });
  const status = h('p', { role: 'status', 'aria-live': 'polite', 'data-testid': 'course-status' });
  const preview = h('div', { 'data-testid': 'course-preview' });
  const generate = h('button.btn', { type: 'button', 'data-testid': 'course-generate' }, 'Generate course preview');
  // difficulty: a native range input (arrow keys, Home/End, touch drag) with both ends labeled and the current level named
  const savedDifficulty = COURSE_DIFFICULTIES.indexOf(remember.get('kaiju.course.difficulty') as CourseDifficulty);
  const slider = h('input.cu-difficulty-range', { type: 'range', min: 0, max: COURSE_DIFFICULTIES.length - 1, step: 1, value: savedDifficulty >= 0 ? savedDifficulty : 1, 'aria-label': 'Course difficulty', 'data-testid': 'course-difficulty' }) as HTMLInputElement;
  const level = h('output.cu-difficulty-level', { 'data-testid': 'course-difficulty-level', 'aria-live': 'polite' });
  const difficulty = (): CourseDifficulty => COURSE_DIFFICULTIES[Math.max(0, Math.min(COURSE_DIFFICULTIES.length - 1, Math.round(Number(slider.value))))];
  const showLevel = () => { const name = DIFFICULTY_LABEL[difficulty()]; level.textContent = name; slider.setAttribute('aria-valuetext', name); };
  slider.addEventListener('input', () => { showLevel(); remember.set('kaiju.course.difficulty', difficulty()); }); showLevel();
  const difficultyField = h('div.cu-difficulty', { role: 'group', 'aria-label': 'Difficulty' },
    h('div.cu-difficulty-head', null, h('span.cu-label', null, 'Difficulty'), level),
    slider,
    h('div.cu-difficulty-ends', { 'aria-hidden': 'true' }, h('small', null, 'Easy'), h('small', null, 'Extreme')));
  // preset: native radios (arrow keys move between them), one compact row each with a one-line description
  const savedPreset = remember.get('kaiju.course.preset') as CoursePreset | null;
  let preset: CoursePreset = savedPreset && COURSE_PRESETS.includes(savedPreset) ? savedPreset : 'lesson';
  const presetName = `cu-preset-${Math.random().toString(36).slice(2, 8)}`;
  const presetField = h('fieldset.cu-presets', { 'data-testid': 'course-preset' }, h('legend.cu-label', null, 'Session type'),
    ...COURSE_PRESETS.map(id => {
      const radio = h('input', { type: 'radio', name: presetName, value: id, checked: id === preset || undefined, 'data-testid': `course-preset-${id}` }) as HTMLInputElement;
      radio.onchange = () => { if (radio.checked) { preset = id; remember.set('kaiju.course.preset', id); } };
      return h('label.cu-preset', null, radio, h('span.cu-preset-text', null, h('b', null, PRESET_TEXT[id][0]), h('small', null, PRESET_TEXT[id][1])));
    }));
  // extra instructions for the AI (optional): X-Course-Prompt header, omitted when empty
  const promptBox = h('textarea.cu-prompt', { rows: 3, maxlength: COURSE_PROMPT_MAX, 'data-testid': 'course-prompt', 'aria-describedby': 'cu-prompt-count',
    placeholder: 'Example: Focus on binary search; 8 questions; include one trace-the-code question.' }) as HTMLTextAreaElement;
  const promptCount = h('small.cu-count', { id: 'cu-prompt-count', 'data-testid': 'course-prompt-count', 'aria-live': 'polite' });
  const showCount = () => { promptCount.textContent = `${promptBox.value.length} / ${COURSE_PROMPT_MAX}`; promptCount.classList.toggle('cu-count-full', promptBox.value.length >= COURSE_PROMPT_MAX); };
  promptBox.addEventListener('input', showCount); showCount();
  const promptField = h('label.cu-prompt-field', null, h('span.cu-prompt-head', null, h('span.cu-label', null, 'Extra instructions for the AI (optional)'), promptCount), promptBox);
  const settings = h('div.cu-settings', { 'data-testid': 'course-settings' }, presetField, difficultyField, promptField);
  const clear = () => { generation++; preview.replaceChildren(); status.textContent = ''; };
  file.onchange = clear;
  generate.onclick = async () => {
    if (generate.disabled) return;
    clear(); const ticket = generation;
    const selected = file.files?.[0];
    if (!selected || !/\.(pdf|md|txt)$/i.test(selected.name)) { status.textContent = 'Choose a .pdf, .md or .txt file.'; return; }
    if (!selected.size || selected.size > MAX_FILE_BYTES) { status.textContent = 'Choose a non-empty file up to 8 MB.'; return; }
    if (!options.token) { status.textContent = 'Reconnect as the classroom owner before generating a course.'; return; }
    generate.disabled = true; status.textContent = 'Generating course preview…';
    try {
      const extra = promptBox.value.trim().slice(0, COURSE_PROMPT_MAX);
      const res = await (options.fetch ?? fetch)(`/api/course/generate?room=${encodeURIComponent(options.room)}&filename=${encodeURIComponent(selected.name)}&preset=${preset}&difficulty=${difficulty()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Room-Token': options.token, ...(extra ? { 'X-Course-Prompt': encodeURIComponent(extra) } : {}) }, body: selected, signal: controller.signal,
      });
      const data = await res.json();
      if (disposed || ticket !== generation) return;
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'AI course generation failed. Retry the upload.');
      const plan = data.plan as ClassroomPlan;
      if (!plan || typeof plan.title !== 'string' || typeof plan.bossName !== 'string' || !Array.isArray(plan.steps) || !plan.steps.length) throw new Error('AI returned an invalid course preview. Retry the upload.');
      const title = h('input', { value: plan.title, maxlength: 120, 'aria-label': 'Generated lesson title', 'data-testid': 'course-preview-title' });
      const boss = h('input', { value: plan.bossName, maxlength: 80, 'aria-label': 'Generated boss name', 'data-testid': 'course-preview-boss' });
      const steps = plan.steps.map((step, index) => {
        const name = h('input', { value: step.title, maxlength: 120, 'aria-label': `Generated step ${index + 1} title`, 'data-testid': `course-preview-step-title-${index}` });
        const instructions = h('textarea', { rows: 5, maxlength: 8000, 'aria-label': `Generated step ${index + 1} instructions`, 'data-testid': `course-preview-step-instructions-${index}` }, step.instructions);
        name.oninput = () => { step.title = name.value; };
        instructions.oninput = () => { step.instructions = instructions.value; delete step.brief; };
        // generated question sets: shown read-only with their answer keys (edit them in the lesson editor after Apply)
        const questions = hasQuestions(step) ? h('details.cr-course-questions', { open: true, 'data-testid': `course-preview-questions-${index}` },
          h('summary', null, `${MODE_LABEL[stepMode(step)]} · ${step.questions!.length === 1 ? '1 question' : `${step.questions!.length} questions`} (read only)`),
          questionPreview(step.questions!, `course-preview-q-${index}`, step.questionContext)) : null;
        return h('div', null, h('h4', null, `Step ${index + 1}`), name, instructions, questions);
      });
      const apply = h('button.btn.btn-primary', { type: 'button', 'data-testid': 'course-apply' }, 'Apply draft');
      apply.onclick = () => {
        if (disposed || ticket !== generation) return;
        if (!title.value.trim() || !boss.value.trim() || plan.steps.some(s => !s.title.trim() || !s.instructions.trim())) { status.textContent = 'Enter a title, boss name, and instructions for every step.'; return; }
        options.onApply({ ...plan, title: title.value.trim(), bossName: boss.value.trim() });
      };
      preview.replaceChildren(title, boss, ...steps, apply);
      status.textContent = 'AI preview ready. Review and edit it, then Apply draft. Publish lesson separately to share it with students.';
    } catch (error) {
      if (!disposed && ticket === generation) status.textContent = error instanceof Error ? error.message : 'AI course generation failed. Retry the upload.';
    } finally { if (!disposed) generate.disabled = false; }
  };
  const el = h('section.cr-measurements', { 'data-testid': 'course-upload' }, h('h3', null, 'Generate a course from a file'),
    h('p', null, 'Upload a PDF (including scans, images and charts), Markdown (.md), or plain text (.txt). Up to 8 MB. PDFs: 100 pages by default (server-configurable), sent directly to Gemini. Text files and the DeepSeek PDF fallback: up to 80000 UTF-8 bytes; fallback requires selectable text. Generation only creates a preview.'), file, settings, generate, status, preview);
  return { el, dispose() { disposed = true; generation++; controller.abort(); } };
}
