import type { ClassroomPlan } from '../../shared/classroom';
import { h } from './util';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
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
      const res = await (options.fetch ?? fetch)(`/api/course/generate?room=${encodeURIComponent(options.room)}&filename=${encodeURIComponent(selected.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Room-Token': options.token }, body: selected, signal: controller.signal,
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
        return h('div', null, h('h4', null, `Step ${index + 1}`), name, instructions);
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
    h('p', null, 'Upload a PDF with selectable text, Markdown (.md), or plain text (.txt). Up to 8 MB; extracted text up to 80000 UTF-8 bytes. The document is sent to the configured AI provider. Generation only creates a preview.'), file, generate, status, preview);
  return { el, dispose() { disposed = true; generation++; controller.abort(); } };
}
