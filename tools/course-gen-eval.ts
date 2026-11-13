/** Manual paid-provider evaluation only. No imports or calls from the automated test suite. */
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { createCourseGenerator, CourseGenerationError, MAX_COURSE_TEXT_BYTES, type CourseDifficulty, courseGeminiModel, courseProviderTimeout } from '../server/course-generation';
import { DEEPSEEK_MODEL } from '../design/provider';
import { COURSE_PRESETS, normalizeTeacherPrompt } from '../server/course-presets';
import { courseEvaluationSummary } from '../server/course-evaluation';
import { extractRubricText } from '../rubric/pdf';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Manual only: npx tsx tools/course-gen-eval.ts --real --file <pdf|md|txt> --out <new-directory> [--provider auto|gemini|deepseek] [--seed 123] [--timeout-ms 180000] [--teacher-prompt "Exactly 5 questions in Simplified Chinese."]');
    return;
  }
  if (!args.includes('--real')) throw new Error('Refusing provider calls: run by hand with --real. Use --help for usage.');
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--real') continue;
    const equal = args[i].indexOf('='), name = equal < 0 ? args[i] : args[i].slice(0, equal);
    if (!['--file', '--out', '--seed', '--timeout-ms', '--teacher-prompt', '--provider'].includes(name)) throw new Error(`Unknown argument: ${name}`);
    const value = equal < 0 ? args[++i] : args[i].slice(equal + 1);
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.set(name, value);
  }
  if (!values.has('--file') || !values.has('--out')) throw new Error('--file and --out are required');
  const providerChoice = values.get('--provider') ?? 'auto';
  if (!['auto', 'gemini', 'deepseek'].includes(providerChoice)) throw new Error('--provider must be auto, gemini or deepseek');
  const file = resolve(values.get('--file')!), out = resolve(values.get('--out')!);
  const seed = Number(values.get('--seed') ?? '20261113'), timeoutMs = Number(values.get('--timeout-ms') ?? String(courseProviderTimeout()));
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be an unsigned 32-bit integer');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000) throw new Error('--timeout-ms must be 1000..600000');
  const teacherPrompt = normalizeTeacherPrompt(values.get('--teacher-prompt') ?? 'Exactly 5 questions. Write everything in Simplified Chinese.');
  const size = (await stat(file)).size;
  if (!size || size > 8 * 1024 * 1024) throw new Error('Input file must contain 1 byte through 8 MiB');
  const bytes = await readFile(file), extension = extname(file).toLowerCase();
  if (!['.pdf', '.md', '.txt'].includes(extension)) throw new Error('Use a .pdf, .md or .txt file');
  const text = extension === '.pdf' || bytes.subarray(0, 5).toString() === '%PDF-'
    ? await extractRubricText(bytes, file, 'application/pdf', MAX_COURSE_TEXT_BYTES)
    : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.trim() || Buffer.byteLength(text) > MAX_COURSE_TEXT_BYTES) throw new Error('Extracted text must contain 1..80000 UTF-8 bytes');
  const geminiModel = courseGeminiModel();
  const models = { gemini: geminiModel, deepseek: DEEPSEEK_MODEL };
  const cases = COURSE_PRESETS.flatMap(preset => (['easy', 'extreme'] as const).map(difficulty => ({ name: `${preset}-${difficulty}`, preset, difficulty: difficulty as CourseDifficulty, teacherPrompt: '' })));
  cases.push({ name: 'quiz-medium-teacher', preset: 'quiz', difficulty: 'medium', teacherPrompt });
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length) throw new Error('Use a new empty output directory');
  // Exclusive manifest creation prevents overwriting another run or paying for a run with conflicting outputs.
  await writeFile(join(out, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), file, sha256: createHash('sha256').update(bytes).digest('hex'), textBytes: Buffer.byteLength(text), provider: providerChoice, models, seed, timeoutMs, cases }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ event: 'evaluation-start', provider: providerChoice, models, timeoutMs }));
  const summaries: object[] = [];
  let failed = 0;
  for (let index = 0; index < cases.length; index++) {
    const test = cases[index], started = performance.now();
    let rawIndex = 0;
    const generate = createCourseGenerator({ timeoutMs, model: geminiModel, ...(providerChoice === 'deepseek' ? { apiKey: '' } : providerChoice === 'gemini' ? { deepseekApiKey: '' } : {}), seed: (seed + index) >>> 0, onRawResponse: response => {
      const provider = response.provider.replace(/[^a-z0-9_-]/gi, '_');
      const filename = `${test.name}.attempt-${++rawIndex}-${provider}`;
      writeFileSync(join(out, filename + '.txt'), response.content, { flag: 'wx' });
      writeFileSync(join(out, filename + '.meta.json'), JSON.stringify({ provider: response.provider, model: response.model, repair: response.repair, finishReason: response.finishReason, characters: response.content.length }, null, 2) + '\n', { flag: 'wx' });
    } });
    try {
      const result = await generate(text, test.difficulty, test.preset, test.teacherPrompt);
      const summary = courseEvaluationSummary(test.name, performance.now() - started, result);
      summaries.push(summary); console.log(JSON.stringify(summary));
      await writeFile(join(out, `${test.name}.json`), JSON.stringify({ ...summary, ...result }, null, 2) + '\n', { flag: 'wx' });
    } catch (error) {
      failed++;
      const diagnostics = error instanceof CourseGenerationError ? error.diagnostics : undefined;
      const summary = courseEvaluationSummary(test.name, performance.now() - started, undefined, error);
      summaries.push(summary); console.log(JSON.stringify(summary));
      await writeFile(join(out, `${test.name}.json`), JSON.stringify({ ...summary, diagnostics }, null, 2) + '\n', { flag: 'wx' });
    }
  }
  await writeFile(join(out, 'summary.json'), JSON.stringify({ passed: cases.length - failed, failed, cases: summaries }, null, 2) + '\n', { flag: 'wx' });
  if (failed) process.exitCode = 1;
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Course evaluation failed'); process.exitCode = 1; });
