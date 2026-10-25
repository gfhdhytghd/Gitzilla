import type { InAppFile } from '../shared/classroom.ts';
import type { RepoProfile } from '../shared/types.ts';
import { shouldKeep } from './files.ts';
import { profileFromFiles } from './graph.ts';

/** Static, synchronous analysis of server-validated editor files. No network, cache or execution. */
export function analyzeFiles(files: InAppFile[], name: string): RepoProfile {
  const sources = files.filter(file => shouldKeep(file.path)).map(file => ({ path: file.path, text: file.content }));
  return profileFromFiles(name.trim() || 'in-app', sources);
}
