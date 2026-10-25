import { describe, expect, it } from 'vitest';
import { clampText } from './text.ts';

describe('bounded flavor text', () => {
  it('reserves room for an ellipsis and keeps whole words', () => {
    expect(clampText('alpha beta gamma', 12)).toBe('alpha beta…');
    expect(clampText('anIdentifierTooLongToFit', 10)).toBe('…');
    expect(clampText('Complete short line.', 40, true)).toBe('Complete short line.');
  });
  it('keeps complete code calls and drops calls that cannot fit', () => {
    expect(clampText("Use foo('ok') while the waves crash", 16)).toBe("Use foo('ok')…");
    expect(clampText("Invoke foo('long code argument') then attack", 22)).toBe('Invoke…');
    expect(clampText("Raise [foo('bar')] before the next wave", 15)).toBe('Raise…');
  });
  it('repairs already-clipped cached prose without leaving an open quote or parenthesis', () => {
    expect(clampText("Running on 127.0.0.1:5000 — @app.route('", 40, true)).toBe('Running on 127.0.0.1:5000…');
    expect(clampText('Ready for route(', 40, true)).toBe('Ready for…');
    expect(clampText('Ready for "unfinished code', 40, true)).toBe('Ready for…');
    const call = "Use foo('ok')";
    expect(clampText(call, call.length, true)).toBe(call);
  });
  it('treats apostrophes in contractions and possessives as prose', () => {
    expect(clampText("Don't lose the party's shields during a storm", 28)).toBe("Don't lose the party's…");
    expect(clampText("Players' shields are ready.", 40, true)).toBe("Players' shields are ready.");
  });
  it('handles escaped quotes, nested calls and smart quotes as whole tokens', () => {
    expect(clampText('Use f("one\\"two") before another attack', 20)).toBe('Use f("one\\"two")…');
    expect(clampText('Say “come back later” before attacking', 15)).toBe('Say…');
  });
  it('is idempotent after truncation and does not alter source excerpts that need no clamp', () => {
    const line = clampText('alpha beta gamma', 12, true);
    expect(clampText(line, 12, true)).toBe(line);
    expect(clampText('def route(', 80)).toBe('def route(');
    expect(clampText('return {', 80)).toBe('return {');
  });
});
