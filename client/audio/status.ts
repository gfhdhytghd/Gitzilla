import type { PhoneAudioState, PlaybackSession } from './phone';

export interface AudioDebugStatus {
  state: PhoneAudioState | 'unsupported';
  session: PlaybackSession;
  musicPlaying: boolean;
  needsGesture: boolean;
  muted: boolean;
  error: string | null;
}
let status: AudioDebugStatus = { state: 'locked', session: 'pending', musicPlaying: false, needsGesture: true, muted: false, error: null };
export const readAudioDebugStatus = (): Readonly<AudioDebugStatus> => status;
export function publishAudioDebugStatus(next: AudioDebugStatus): void { status = next; }
