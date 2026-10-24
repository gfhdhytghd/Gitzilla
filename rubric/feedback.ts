import type { CriterionResult, RepoProfile, Rubric, StudentFeedback } from '../shared/types.ts';
import { evidenceFile, weightedScore } from './scoring.ts';

export interface FeedbackMatchStats {
  playerId: string;
  name: string;
  rank: number;
  kos: number;
  damage: number;
  roundWins: number;
  quiz?: string;
}

/** Rubric grade depends only on the repository; combat and quiz results are separate context. */
export function buildFeedback(profile: RepoProfile, rubric: Rubric, results: CriterionResult[], matchStats: FeedbackMatchStats, quiz = matchStats.quiz): StudentFeedback {
  const rows = rubric.criteria.flatMap(criterion => {
    const result = results.find(row => row.criterionId === criterion.id);
    return result ? [{ criterion, result }] : [];
  });
  const strongest = [...rows].filter(row => row.result.score >= 0.64).sort((a, b) => b.result.score - a.result.score || b.criterion.weight - a.criterion.weight).slice(0, 3);
  const strengths = strongest.map(({ criterion, result }) => `${criterion.name}: ${result.evidence}`);
  if (!strengths.length) strengths.push(rows.length ? `Your starting point is visible: ${rows[0].result.evidence}` : `${profile.slug} is ready for a teacher-reviewed rubric; no measurable criteria were provided.`);
  const next = [...rows].filter(row => row.result.score < 0.82).sort((a, b) => (1 - b.result.score) * b.criterion.weight - (1 - a.result.score) * a.criterion.weight).slice(0, 3);
  const improvements = next.map(({ criterion, result }) => {
    const file = evidenceFile(profile, criterion);
    return { text: `${criterion.name}: ${result.tip ?? `Review the evidence with your teacher: ${result.evidence}`}`, ...(file ? { file } : {}) };
  });
  if (!improvements.length) improvements.push(rows.length ? { text: 'You met the measured targets. Add an edge-case test for the heart module and keep the README examples current.', ...(profile.heart ? { file: profile.heart } : {}) } : { text: 'Ask your teacher to map the unparsed requirements before using this score as a grade.' });
  const rubricScore = weightedScore(rubric, results);
  const incomplete = rows.some(row => /not measured|review required|unavailable|sampled tree/i.test(row.result.evidence)) || !!rubric.unparsed?.length || !rows.length;
  const summary = `${profile.slug} earned ${rubricScore.toFixed(1)}/100 on the measured rubric${incomplete ? '; some requirements need teacher review' : ''}. You finished rank ${matchStats.rank} with ${matchStats.kos} KO${matchStats.kos === 1 ? '' : 's'} and ${matchStats.roundWins} round win${matchStats.roundWins === 1 ? '' : 's'}; your next step is ${next[0]?.criterion.name.toLowerCase() ?? 'keeping these engineering habits as the project grows'}.`;
  return { playerId: matchStats.playerId, name: matchStats.name, repo: profile.slug, rubricScore,
    results: results.map(result => ({ ...result })), strengths, improvements,
    match: { rank: matchStats.rank, kos: matchStats.kos, damage: matchStats.damage, roundWins: matchStats.roundWins, ...(quiz ? { quiz } : {}) }, summary };
}
