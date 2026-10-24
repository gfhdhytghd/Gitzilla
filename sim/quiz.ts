import type { Concept, PerkOffer, PlayerState } from '../shared/types.ts';
import type { ClassroomKit } from './quality.ts';
import { random } from './math.ts';

interface Question { question: string; answer: string; wrong: string[]; explain: string; concept: Concept }
export interface ClassroomQuiz { offer: PerkOffer; correctId: string; explain: string; subject: string; endsAt: number }

export function classroomQuiz(players: PlayerState[], round: number, seed: number, now: number, width: number, height: number): ClassroomQuiz {
  const rng = random(seed ^ (round * 7919));
  const subject = players[Math.floor(rng() * players.length)], facts = (subject.kit as ClassroomKit).classroom;
  const questions: Question[] = [];
  if (facts) {
    const wrong = [...new Set([...facts.files, ...players.map(p => (p.kit as ClassroomKit).classroom?.heart ?? ''), ...facts.components.map(c => c.name)])]
      .filter(file => file && file !== facts.heart).slice(0, 2);
    if (facts.heart && wrong.length === 2) questions.push({
      question: `Which file is ${subject.name}'s heart module?`, answer: facts.heart, wrong,
      explain: `${facts.heart} has the highest analyzed file fan-in: ${facts.heartFanIn} incoming dependencies.`, concept: 'heart-module',
    });
    for (const [metric, label, concept] of [['loc', 'largest by LOC', 'component'], ['fanIn', 'imported by the most components', 'fan-in'], ['fanOut', 'dependent on the most other components', 'fan-out']] as const) {
      const sorted = [...facts.components].sort((a, b) => b[metric] - a[metric]);
      if (sorted.length >= 3 && sorted[0][metric] > sorted[1][metric]) questions.push({
        question: `Which component of ${subject.name}'s repo is ${label}?`, answer: sorted[0].name, wrong: sorted.slice(1, 3).map(c => c.name),
        explain: `${sorted[0].name} has ${sorted[0][metric]} ${metric}; the other answers have ${sorted[1][metric]} and ${sorted[2][metric]}.`, concept,
      });
    }
    if (facts.cycles.length) {
      const wrongPairs: string[] = [];
      for (let i = 0; i < facts.components.length; i++) for (let j = i + 1; j < facts.components.length; j++) {
        const a = facts.components[i].name, b = facts.components[j].name;
        if (!facts.cycles.some(c => c.includes(a) && c.includes(b))) wrongPairs.push(`${a} ↔ ${b}`);
      }
      if (wrongPairs.length >= 2) questions.push({ question: `Which modules form a cycle in ${subject.name}'s repo?`, answer: facts.cycles[0].join(' ↔ '), wrong: wrongPairs.slice(0, 2),
        explain: `The analyzer found ${facts.cycles.length} strongly connected group(s); ${facts.cycles[0].join(' ↔ ')} is one of them.`, concept: 'circular-dependency' });
    }
  }
  const armor = subject.kit.quality?.find(q => q.stat === 'armor');
  questions.push({ question: `Which stat reflects tests in ${subject.name}'s report card?`, answer: 'armor (try/catch)', wrong: ['speed (modularity)', 'damage (cohesion)'],
    explain: `${subject.name}'s armor grade is ${armor?.grade ?? 'C'}. ${armor?.signal ?? 'Source analysis is unavailable; re-analyze for a report card.'}`, concept: 'test-coverage' });
  const q = questions[Math.floor(rng() * questions.length)];
  const answers = [{ text: q.answer, correct: true }, ...q.wrong.map(text => ({ text, correct: false }))];
  for (let i = answers.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [answers[i], answers[j]] = [answers[j], answers[i]]; }
  let correctId = '';
  const pads = answers.map((answer, i) => {
    const id = `quiz-${round}-${i}`; if (answer.correct) correctId = id;
    return { id, name: answer.text, answer: answer.text, desc: 'Stand here for one second to answer', x: width * (i + 1) / 4, y: height / 2, r: 26 };
  });
  return { subject: subject.id, correctId, explain: q.explain, endsAt: now + 15,
    offer: { endsAt: now + 12, pads, picked: {}, quiz: { question: q.question, explain: '', concept: q.concept } } };
}
