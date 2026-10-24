import type { Concept, GameEvent } from '../shared/types.ts';

type Lesson = Extract<GameEvent, { type: 'lesson' }>;
/** One non-blocking card per eight seconds; unseen concepts beat repeats in the queue. */
export class LessonQueue {
  private pending = new Map<Concept, Lesson>();
  private seen = new Set<Concept>();
  private last = -Infinity;
  offer(concept: Concept, ref: string, facts: Record<string, string | number>) {
    this.pending.set(concept, { type: 'lesson', concept, ref, facts });
  }
  removePlayer(id: string) {
    for (const [concept, lesson] of this.pending) if (lesson.ref === id) this.pending.delete(concept);
  }
  step(now: number, emit: (event: GameEvent) => void) {
    if (now - this.last < 8 || !this.pending.size) return;
    const lessons = [...this.pending.values()];
    const lesson = lessons.find(l => !this.seen.has(l.concept)) ?? lessons[0];
    this.pending.delete(lesson.concept); this.seen.add(lesson.concept); this.last = now;
    emit(lesson);
  }
}
