import type { CriterionResult, Rubric } from './types';

export interface ClassroomCheck {
  id: string;
  label: string;
  kind: 'file' | 'contains' | 'ci';
  path: string; // repository-relative file, or exact GitHub check name
  text?: string;
}
export interface ClassroomStep {
  id: string;
  title: string;
  instructions: string;
  durationSec: number; // 0 = teacher advances manually
  rubric: Rubric;
  checks: ClassroomCheck[];
  checksWeight: number; // 0..100; only used when checks exist
}
export interface ClassroomPlan { title: string; bossName: string; steps: ClassroomStep[] }
export type ClassroomPhase = 'setup' | 'coding' | 'paused' | 'raid' | 'feedback' | 'complete';
export interface ClassroomRow {
  id: string; name: string; connected: boolean;
  status: 'empty' | 'queued' | 'submitted' | 'error';
  repo?: string; commit?: string; score?: number; improvement: number;
  damage: number; totalDamage: number; attempts: number;
}
export interface ClassroomAttack {
  id: string; name: string; score: number; improvement: number; damage: number; commit: string;
}
export interface ClassroomRound {
  stepId: string; attempt: number; at: number; bossBefore: number; bossAfter: number;
  attacks: ClassroomAttack[];
}
export interface ClassroomReport {
  stepId: string; attempt: number; repo: string; commit: string; submittedAt: number;
  score: number; improvement: number; checks: { label: string; passed: boolean; detail: string }[];
  criteria: CriterionResult[]; advice: string[];
  teacherReview?: { score: number; note: string };
}
export interface ClassroomState {
  plan: ClassroomPlan; phase: ClassroomPhase; stepIndex: number; attempt: number;
  deadline: number | null; remainingMs: number | null; serverTime: number;
  raidEndsAt: number | null; bossHp: number; bossMaxHp: number;
  rows: ClassroomRow[]; rounds: ClassroomRound[];
  notice?: string;
}
export type ClassroomCommand = 'start' | 'pause' | 'resume' | 'attack' | 'next' | 'retry' | 'finish' | 'extend';
