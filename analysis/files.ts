import { posix as path } from 'node:path';

export interface SourceFile { path: string; text: string }

const LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.vue': 'Vue', '.svelte': 'Svelte', '.py': 'Python', '.pyi': 'Python', '.go': 'Go',
  '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.cs': 'C#',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.hh': 'C++',
  '.rb': 'Ruby', '.rake': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.scala': 'Scala',
  '.lua': 'Lua', '.r': 'R', '.jl': 'Julia', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
  '.erl': 'Erlang', '.clj': 'Clojure', '.cljs': 'Clojure', '.pl': 'Perl', '.pm': 'Perl',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.sql': 'SQL', '.css': 'CSS',
  '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less', '.html': 'HTML', '.m': 'Objective-C',
  '.mm': 'Objective-C++', '.f90': 'Fortran', '.zig': 'Zig', '.nim': 'Nim', '.ml': 'OCaml',
};
const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'vendor', 'vendors', 'vendored',
  'third_party', 'third-party', 'thirdparty', 'external', 'deps', 'dependencies', 'dist', 'build', 'target', 'coverage',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', '.turbo', '.yarn',
]);

export function languageOf(file: string): string | undefined {
  return LANGUAGES[path.extname(file).toLowerCase()];
}

export function isSourcePath(file: string): boolean {
  if (file.split('/').some(part => SKIP_DIRS.has(part.toLowerCase()))) return false;
  if (/(?:\.min\.(?:[cm]?js|css)|\.bundle\.js|\.generated\.[^.]+|\.g\.cs|\.designer\.cs|\.pb\.go)$/i.test(file)) return false;
  return languageOf(file) !== undefined;
}

export function shouldKeep(file: string): boolean {
  if (file.split('/').some(part => SKIP_DIRS.has(part.toLowerCase()))) return false;
  return isSourcePath(file) || /(?:^|\/)(?:go\.mod|Cargo\.toml|package\.json|(?:tsconfig(?:\.[^/]+)?|jsconfig)\.json)$/.test(file);
}

export function isTestFile(file: string): boolean {
  return /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|(?:^|\/)(?:test_|spec_)[^/]+|(?:[._-](?:test|spec))\.[^.]+$|_test\.go$|(?:Test|Tests|Spec)\.(?:java|kt|cs)$/.test(file);
}

export function countLoc(text: string): number {
  return text.split('\n').reduce((count, line) => count + Number(line.trim().length > 0), 0);
}
