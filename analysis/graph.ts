import { posix as path } from 'node:path';
import type { RepoProfile } from '../shared/types.ts';
import { notableTree, readmeFromFiles } from './context.ts';
import { countLoc, isSourcePath, isTestFile, languageOf, selectPrimaryLanguage, type SourceFile } from './files.ts';

export interface RepoMetadata {
  description?: string; stars?: number; primaryLanguage?: string;
  languages?: Record<string, number>; commits?: number; contributors?: number; ageDays?: number;
}
const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte'];
const SOURCE_EXTS = [...JS_EXTS, '.py', '.pyi', '.go', '.rs', '.java', '.kt', '.cs', '.c', '.h', '.cpp', '.hpp', '.cc', '.rb'];

export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value)) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

function matches(text: string, regex: RegExp): string[] {
  return Array.from(text.matchAll(regex), match => match[1]);
}
function cleanPath(value: string): string {
  return path.normalize(value).replace(/^\.\//, '');
}

/** Regex imports deliberately favor useful internal edges over complete language semantics. */
export function buildImportGraph(input: SourceFile[]): Map<string, Set<string>> {
  const sources = input.filter(file => isSourcePath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  const byPath = new Map(sources.map(file => [cleanPath(file.path), file]));
  const graph = new Map(sources.map(file => [file.path, new Set<string>()]));
  const folders = new Map<string, string[]>();
  for (const file of sources) {
    const dir = path.dirname(file.path);
    folders.set(dir, [...(folders.get(dir) ?? []), file.path]);
  }
  const packages = new Map<string, string>();
  const goModules = new Map<string, string>();
  const cargoRoots: string[] = [];
  const rustCrates = new Map<string, string>();
  const aliases: { base: string; prefix: string; suffix: string; targets: string[]; wildcard: boolean }[] = [];
  for (const file of input) {
    if (path.basename(file.path) === 'go.mod') {
      const name = file.text.match(/^\s*module\s+["']?([^\s"']+)/m)?.[1];
      if (name) goModules.set(name, path.dirname(file.path));
    }
    if (path.basename(file.path) === 'Cargo.toml') {
      const dir = path.dirname(file.path);
      cargoRoots.push(dir);
      const pkg = file.text.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
      const lib = file.text.match(/\[lib\]([\s\S]*?)(?=\n\[|$)/)?.[1];
      const name = (lib?.match(/^\s*name\s*=\s*["']([^"']+)/m) ?? pkg?.match(/^\s*name\s*=\s*["']([^"']+)/m))?.[1];
      if (name) rustCrates.set(name.replace(/-/g, '_'), path.join(dir, 'src'));
    }
    if (path.basename(file.path) === 'package.json') {
      try {
        const pkg = JSON.parse(file.text) as { name?: string; source?: string; module?: string; main?: string };
        if (pkg.name) packages.set(pkg.name, path.dirname(file.path));
      } catch { /* JSONC and broken manifests do not block source analysis. */ }
    }
    if (/^(?:tsconfig(?:\..+)?|jsconfig)\.json$/.test(path.basename(file.path))) {
      try {
        const config = JSON.parse(file.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
        const base = path.join(path.dirname(file.path), config.compilerOptions?.baseUrl ?? '.');
        for (const [pattern, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
          if (!Array.isArray(targets)) continue;
          const [prefix, suffix = ''] = pattern.split('*');
          aliases.push({ base, prefix, suffix, targets, wildcard: pattern.includes('*') });
        }
      } catch { /* Optional aliases; relative imports still work. */ }
    }
  }
  const symbols = new Map<string, Set<string>>();
  const namespaces = new Map<string, Set<string>>();
  const register = (map: Map<string, Set<string>>, key: string, file: string) => {
    const set = map.get(key) ?? new Set<string>(); set.add(file); map.set(key, set);
  };
  for (const file of sources) {
    if (/\.(?:java|kt|kts)$/.test(file.path)) {
      const pkg = file.text.match(/^\s*package\s+([\w.]+)/m)?.[1] ?? '';
      register(symbols, `${pkg ? pkg + '.' : ''}${path.basename(file.path).replace(/\.[^.]+$/, '')}`, file.path);
      for (const name of matches(file.text, /\b(?:class|interface|object|enum|record)\s+(\w+)/g)) register(symbols, `${pkg ? pkg + '.' : ''}${name}`, file.path);
      register(namespaces, pkg, file.path);
    }
    if (file.path.endsWith('.cs')) {
      for (const ns of matches(file.text, /\bnamespace\s+([\w.]+)/g)) {
        register(namespaces, ns, file.path);
        for (const name of matches(file.text, /\b(?:class|interface|struct|enum|record)\s+(\w+)/g)) register(symbols, `${ns}.${name}`, file.path);
      }
    }
  }
  function resolve(base: string, extensions = SOURCE_EXTS): string | undefined {
    base = cleanPath(base);
    if (byPath.has(base)) return base;
    const stem = /\.(?:[cm]?js|jsx)$/.test(base) ? base.replace(/\.[^.]+$/, '') : base;
    for (const ext of extensions) if (byPath.has(stem + ext)) return stem + ext;
    for (const name of ['index', '__init__', 'mod']) {
      for (const ext of extensions) {
        const candidate = path.join(base, name + ext);
        if (byPath.has(candidate)) return candidate;
      }
    }
  }
  function resolveJs(spec: string, from: string): string | undefined {
    spec = spec.replace(/[?#].*$/, '');
    if (spec.startsWith('.')) return resolve(path.join(path.dirname(from), spec), JS_EXTS);
    for (const alias of aliases) {
      if (!spec.startsWith(alias.prefix) || !spec.endsWith(alias.suffix)) continue;
      if (!alias.wildcard && spec !== alias.prefix) continue;
      const middle = spec.slice(alias.prefix.length, alias.suffix ? -alias.suffix.length : undefined);
      for (const target of alias.targets) {
        const found = resolve(path.join(alias.base, target.replace('*', middle)), JS_EXTS);
        if (found) return found;
      }
    }
    const parts = spec.split('/');
    const packageName = parts.slice(0, spec.startsWith('@') ? 2 : 1).join('/');
    const packageDir = packages.get(packageName);
    if (packageDir) {
      const subpath = parts.slice(spec.startsWith('@') ? 2 : 1).join('/');
      for (const candidate of [path.join(packageDir, subpath), path.join(packageDir, 'src', subpath)]) {
        const found = resolve(candidate, JS_EXTS); if (found) return found;
      }
    }
    // Common repository-local aliases, including React's shared/* and @/foo.
    const local = spec.replace(/^@\//, '');
    for (const root of ['', 'src', 'lib', 'packages']) {
      const found = resolve(path.join(root, local), JS_EXTS); if (found) return found;
    }
  }
  function resolvePython(module: string, from: string): string | undefined {
    const dots = module.match(/^\.+/)?.[0].length ?? 0;
    const rest = module.slice(dots).replace(/\./g, '/');
    if (dots) return resolve(path.join(path.dirname(from), ...Array(dots - 1).fill('..'), rest), ['.py', '.pyi']);
    for (const root of ['', 'src', 'lib']) {
      const found = resolve(path.join(root, rest), ['.py', '.pyi']); if (found) return found;
    }
  }
  function rustRoot(from: string): string {
    const root = cargoRoots.filter(dir => dir === '.' || from.startsWith(dir + '/')).sort((a, b) => b.length - a.length)[0];
    if (root) return path.join(root, 'src');
    const index = from.lastIndexOf('/src/');
    return index >= 0 ? from.slice(0, index + 4) : 'src';
  }
  function rustModuleDir(from: string): string {
    return /(?:^|\/)(?:lib|main|mod)\.rs$/.test(from) ? path.dirname(from) : from.replace(/\.rs$/, '');
  }
  for (const file of sources) {
    const out = graph.get(file.path)!;
    const add = (target: string | undefined) => { if (target && target !== file.path) out.add(target); };
    const addAll = (targets: Iterable<string> | undefined) => { for (const target of targets ?? []) add(target); };
    const ext = path.extname(file.path);
    // Remove comment-only lines to keep examples in comments out of the graph.
    const text = file.text.replace(/^\s*(?:\/\/|#(?!\s*include)|\*).*$/gm, '');
    if (JS_EXTS.includes(ext)) {
      for (const spec of matches(text, /\b(?:import|export)\s+(?:type\s+)?(?:[^;"'`]*?\s+from\s*)?["']([^"']+)["']/g)) add(resolveJs(spec, file.path));
      for (const spec of matches(text, /\b(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g)) add(resolveJs(spec, file.path));
    } else if (ext === '.py' || ext === '.pyi') {
      for (const statement of matches(text, /^\s*import\s+([^\n;#]+)/gm)) {
        for (const item of statement.split(',')) add(resolvePython(item.trim().split(/\s+/)[0], file.path));
      }
      for (const match of text.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n;#]+)/gm)) {
        add(resolvePython(match[1], file.path));
        for (const item of match[2].replace(/[()\n]/g, '').split(',')) {
          const name = item.trim().split(/\s+/)[0];
          if (name && name !== '*') add(resolvePython(`${match[1]}${match[1].endsWith('.') ? '' : '.'}${name}`, file.path));
        }
      }
    } else if (ext === '.go') {
      const specs = matches(text, /\bimport\s+(?:[\w.]+\s+)?"([^"]+)"/g);
      for (const block of matches(text, /\bimport\s*\(([\s\S]*?)\)/g)) specs.push(...matches(block, /"([^"]+)"/g));
      for (const spec of specs) {
        for (const [module, root] of goModules) {
          if (spec !== module && !spec.startsWith(module + '/')) continue;
          const dir = path.join(root, spec.slice(module.length));
          addAll((folders.get(dir) ?? []).filter(name => name.endsWith('.go') && !name.endsWith('_test.go')));
        }
      }
    } else if (ext === '.rs') {
      for (const name of matches(text, /\bmod\s+(\w+)\s*;/g)) add(resolve(path.join(rustModuleDir(file.path), name), ['.rs']));
      const specs = matches(text, /\buse\s+([\w]+(?:::[^;]+)?);/g);
      for (const spec of specs) {
        const expanded = spec.includes('{') ? spec.slice(spec.indexOf('{') + 1, spec.lastIndexOf('}')).split(',').map(part => spec.slice(0, spec.indexOf('{')) + part.trim()) : [spec];
        for (const item of expanded) {
          const parts = item.split(/\s+as\s+/)[0].split('::');
          const first = parts.shift();
          const externalRoot = rustCrates.get(first!);
          if (!['crate', 'super', 'self'].includes(first!) && !externalRoot) continue;
          let base = externalRoot ?? (first === 'crate' ? rustRoot(file.path) : rustModuleDir(file.path));
          if (externalRoot) add(resolve(externalRoot, ['.rs']) ?? resolve(path.join(externalRoot, 'lib'), ['.rs']));
          if (first === 'super') base = path.dirname(base);
          while (parts[0] === 'super') { base = path.dirname(base); parts.shift(); }
          while (parts.length) {
            const found = resolve(path.join(base, ...parts), ['.rs']);
            if (found) { add(found); break; }
            parts.pop();
          }
        }
      }
    } else if (['.java', '.kt', '.kts', '.cs'].includes(ext)) {
      const specs = ext === '.cs'
        ? matches(text, /\busing\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)/g)
        : matches(text, /\bimport\s+(?:static\s+)?([\w.*]+)/g);
      for (const spec of specs) {
        let name = spec.replace(/\.\*$/, '');
        while (name) {
          const targets = symbols.get(name) ?? namespaces.get(name);
          if (targets) { addAll(targets); break; }
          name = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '';
        }
      }
    } else if (['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.m', '.mm'].includes(ext)) {
      for (const spec of matches(text, /^\s*#\s*include\s*"([^"]+)"/gm)) {
        for (const root of [path.dirname(file.path), '', 'include', 'src']) {
          const found = resolve(path.join(root, spec)); if (found) { add(found); break; }
        }
      }
    } else if (ext === '.rb' || ext === '.rake') {
      for (const match of text.matchAll(/\brequire(_relative)?\s*(?:\(\s*)?["']([^"']+)["']/g)) {
        const roots = match[1] ? [path.dirname(file.path)] : ['lib', ''];
        for (const root of roots) { const found = resolve(path.join(root, match[2]), ['.rb']); if (found) { add(found); break; } }
      }
    }
  }
  return graph;
}

/** Tarjan on the small component graph; longest path is measured in DAG edges. */
export function componentTopology(names: string[], edges: [number, number][]): { cycles: string[][]; maxDepth: number } {
  const adjacency = names.map(() => new Set<number>());
  for (const [from, to] of edges) adjacency[from].add(to);
  const indices = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const onStack = new Set<number>();
  const groups: number[][] = [];
  let cursor = 0;
  function visit(node: number): void {
    indices.set(node, cursor); low.set(node, cursor++); stack.push(node); onStack.add(node);
    for (const target of adjacency[node]) {
      if (!indices.has(target)) { visit(target); low.set(node, Math.min(low.get(node)!, low.get(target)!)); }
      else if (onStack.has(target)) low.set(node, Math.min(low.get(node)!, indices.get(target)!));
    }
    if (low.get(node) === indices.get(node)) {
      const group: number[] = [];
      let item: number;
      do { item = stack.pop()!; onStack.delete(item); group.push(item); } while (item !== node);
      groups.push(group.sort((a, b) => a - b));
    }
  }
  names.forEach((_, i) => { if (!indices.has(i)) visit(i); });
  const groupFor = new Map<number, number>();
  groups.forEach((group, i) => group.forEach(node => groupFor.set(node, i)));
  const dag = groups.map(() => new Set<number>());
  for (const [from, to] of edges) if (groupFor.get(from) !== groupFor.get(to)) dag[groupFor.get(from)!].add(groupFor.get(to)!);
  const depths = new Map<number, number>();
  function depth(node: number): number {
    if (depths.has(node)) return depths.get(node)!;
    const result = Math.max(0, ...Array.from(dag[node], target => 1 + depth(target)));
    depths.set(node, result); return result;
  }
  return {
    cycles: groups.filter(group => group.length > 1).map(group => group.map(i => names[i])),
    maxDepth: Math.max(0, ...groups.map((_, i) => depth(i))),
  };
}

export function profileFromFiles(slug: string, input: SourceFile[], metadata: RepoMetadata = {}): RepoProfile {
  const files = input.filter(file => isSourcePath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  const graph = buildImportGraph(input);
  const locs = new Map(files.map(file => [file.path, countLoc(file.text)]));
  const totalLoc = Array.from(locs.values()).reduce((sum, loc) => sum + loc, 0);
  const topLocs = new Map<string, number>();
  for (const file of files) {
    const top = file.path.includes('/') ? file.path.split('/')[0] : 'root';
    topLocs.set(top, (topLocs.get(top) ?? 0) + locs.get(file.path)!);
  }
  // Tests and demos can exceed the library itself; expand the dominant production tree.
  const productionLocs = new Map<string, number>();
  for (const file of files) {
    if (isTestFile(file.path) || /^(?:docs?|examples?|fixtures|benchmarks?|solutions|exercises|website|docs_src)(?:\/|$)/.test(file.path)) continue;
    const top = file.path.includes('/') ? file.path.split('/')[0] : 'root';
    productionLocs.set(top, (productionLocs.get(top) ?? 0) + locs.get(file.path)!);
  }
  const candidates = productionLocs.size ? productionLocs : topLocs;
  const productionLoc = Array.from(candidates.values()).reduce((sum, loc) => sum + loc, 0);
  const dominant = Array.from(candidates).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const overall = Array.from(topLocs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const expand = dominant && dominant[0] !== 'root' && dominant[1] >= productionLoc * 0.6
    ? dominant[0]
    : overall && overall[0] !== 'root' && !/^(?:tests?|specs?|docs?|examples?|fixtures|benchmarks?)$/.test(overall[0]) && overall[1] >= totalLoc * 0.6
      ? overall[0] : undefined;
  const componentName = (file: string): string => {
    const parts = file.split('/');
    if (parts.length === 1) return 'root';
    return parts[0] === expand && parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
  };
  const counts = new Map<string, { name: string; files: number; loc: number; fanIn: number; fanOut: number }>();
  for (const file of files) {
    const name = componentName(file.path);
    const component = counts.get(name) ?? { name, files: 0, loc: 0, fanIn: 0, fanOut: 0 };
    component.files++; component.loc += locs.get(file.path)!; counts.set(name, component);
  }
  let components = Array.from(counts.values()).sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
  const merged = new Set<string>();
  if (components.length > 8) {
    // Reserve the eighth slot for all the remaining components, including an existing misc/.
    const keep = components.filter(component => component.name !== 'misc').slice(0, 7);
    const rest = components.filter(component => !keep.includes(component));
    rest.forEach(component => merged.add(component.name));
    components = [...keep, { name: 'misc', files: rest.reduce((n, c) => n + c.files, 0), loc: rest.reduce((n, c) => n + c.loc, 0), fanIn: 0, fanOut: 0 }];
    components.sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
  }
  const index = new Map(components.map((component, i) => [component.name, i]));
  const fileComponent = (file: string) => { const name = componentName(file); return index.get(merged.has(name) ? 'misc' : name)!; };
  const edgeKeys = new Set<string>();
  const incoming = new Map(files.map(file => [file.path, 0]));
  for (const [from, targets] of graph) {
    for (const to of targets) {
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
      const a = fileComponent(from), b = fileComponent(to);
      if (a !== b) edgeKeys.add(`${a},${b}`);
    }
  }
  const edges = Array.from(edgeKeys, key => key.split(',').map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [from, to] of edges) { components[from].fanOut++; components[to].fanIn++; }
  const heart = files.map(file => file.path).sort((a, b) => incoming.get(b)! - incoming.get(a)! || a.localeCompare(b))[0] ?? 'README.md';
  const measuredLanguages: Record<string, number> = {};
  for (const file of files) {
    const language = languageOf(file.path)!;
    measuredLanguages[language] = (measuredLanguages[language] ?? 0) + Buffer.byteLength(file.text);
  }
  const languages = metadata.languages && Object.keys(metadata.languages).length ? metadata.languages : measuredLanguages;
  const primaryLanguage = selectPrimaryLanguage(languages, metadata.primaryLanguage, measuredLanguages);
  return {
    slug, description: metadata.description ?? '', stars: metadata.stars ?? 0,
    primaryLanguage, languages, totalFiles: files.length, totalLoc,
    commits: metadata.commits ?? 0, contributors: metadata.contributors ?? 0, ageDays: metadata.ageDays ?? 0,
    components, heart, heartFanIn: incoming.get(heart) ?? 0, edges,
    ...componentTopology(components.map(component => component.name), edges),
    testRatio: files.length ? files.filter(file => isTestFile(file.path)).length / files.length : 0,
    seed: fnv1a(slug.toLowerCase()),
    readme: readmeFromFiles(input), tree: notableTree(input, graph, heart),
  };
}
