import { posix as path } from 'node:path';
import type { RepoProfile } from '../shared/types.ts';
import type { SourceFile } from './files.ts';

export interface DeclaredDependency { name: string; ecosystem: string; version: string; file: string; component?: string }
export function componentForManifest(profile: RepoProfile, file: string): string | undefined {
  const candidates = profile.components.filter(component => !['root', 'misc'].includes(component.name) && file.startsWith(component.name + '/')).sort((a, b) => b.name.length - a.name.length);
  if (candidates[0]) return candidates[0].name;
  if (!file.includes('/')) return profile.components.some(component => component.name === 'root') ? 'root' : undefined;
  return profile.components.some(component => component.name === 'misc') ? 'misc' : undefined;
}

function exactVersion(value: string): string | undefined {
  const version = value.trim().replace(/^=(?!=)/, '');
  if (/SNAPSHOT|[\s^~*><|,]/i.test(version)) return undefined;
  return /^v?\d+(?:\.\d+)*(?:(?:a|b|rc|post|dev)\d+)?(?:[-+._][a-z\d.+_-]+)?$/i.test(version) ? version : undefined;
}
function uncommentToml(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    if (quote === '"' && line[i] === '\\') { i++; continue; }
    if (quote) { if (line[i] === quote) quote = ''; }
    else if (line[i] === '"' || line[i] === "'") quote = line[i];
    else if (line[i] === '#') return line.slice(0, i);
  }
  return line;
}
const assignment = (body: string, field: string) => body.match(new RegExp(`^\\s*${field}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1];

/** Only exact/pinned declarations are queried: ranges are not evidence of an installed vulnerable version. */
export function declaredDependencies(files: SourceFile[], profile: RepoProfile, limit = 100): DeclaredDependency[] {
  const found = new Map<string, DeclaredDependency>();
  const add = (file: string, ecosystem: string, name: string, raw: string) => {
    const version = exactVersion(raw);
    if (!version || !name || /[\s\\]/.test(name)) return;
    const validNames: Record<string, RegExp> = { npm: /^(?:@[\w.-]+\/)?[\w.-]+$/, PyPI: /^[\w.-]+$/, 'crates.io': /^[\w-]+$/, Go: /^[\w.!~+-]+(?:\/[\w.!~+-]+)+$/, Maven: /^[\w.-]+:[\w.-]+$/ };
    if (!validNames[ecosystem]?.test(name)) return;
    if (['npm', 'crates.io', 'Go'].includes(ecosystem) && !/^v?\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) return;
    const component = componentForManifest(profile, file);
    const dependency = { name, ecosystem, version, file, ...(component ? { component } : {}) };
    const key = [ecosystem, name, version, component ?? ''].join('\0');
    if (!found.has(key)) found.set(key, dependency);
  };
  const pythonRequirement = (file: string, value: string) => {
    const match = value.match(/^\s*([\w.-]+)(?:\[[^\]]+\])?\s*==(?!=)\s*([^\s;#]+)\s*(?:;[^#]*)?(?:#.*)?$/);
    if (match) add(file, 'PyPI', match[1], match[2]);
  };
  // Lockfile transitive versions fill remaining slots after direct manifest declarations.
  const ordered = files.slice().sort((a, b) => Number(a.path.endsWith('Cargo.lock')) - Number(b.path.endsWith('Cargo.lock')) || a.path.localeCompare(b.path));
  for (const file of ordered) {
    const base = path.basename(file.path);
    if (base === 'package.json') {
      try {
        const json = JSON.parse(file.text);
        for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
          for (const [name, version] of Object.entries(json[field] ?? {})) if (typeof version === 'string') add(file.path, 'npm', name, version);
        }
      } catch { /* Broken optional manifest is ignored. */ }
    } else if (/^requirements[^/]*\.txt$/i.test(base) || /(?:^|\/)requirements\/[^/]+\.txt$/i.test(file.path)) {
      file.text.split(/\r?\n/).forEach(line => pythonRequirement(file.path, line));
    } else if (base === 'pyproject.toml') {
      let section = '', dependencyArray = false;
      for (const rawLine of file.text.split(/\r?\n/)) {
        const line = uncommentToml(rawLine);
        const heading = line.match(/^\s*\[([^\]]+)\]/);
        if (heading) { section = heading[1]; dependencyArray = false; }
        if (section === 'project' && /^\s*dependencies\s*=/.test(line)) dependencyArray = true;
        if ((section === 'project' && dependencyArray) || section.startsWith('project.optional-dependencies')) {
          for (const value of line.matchAll(/["']([^"']+)["']/g)) pythonRequirement(file.path, value[1]);
          if (line.includes(']')) dependencyArray = false;
        } else if (/^tool\.poetry(?:\.group\.[^.]+)?\.(?:dev-)?dependencies$/.test(section)) {
          const dependency = line.match(/^\s*["']?([\w.-]+)["']?\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+)["'])/);
          if (dependency && dependency[1] !== 'python' && !/\b(?:git|path|url)\s*=/.test(line)) add(file.path, 'PyPI', dependency[1], dependency[2] ?? dependency[3]);
        }
      }
    } else if (base === 'Cargo.lock') {
      for (const block of file.text.split(/\r?\n/).map(uncommentToml).join('\n').split(/\[\[package\]\]/).slice(1)) {
        const source = assignment(block, 'source');
        if (!source || !/registry\+.*(?:crates\.io-index|index\.crates\.io)/.test(source)) continue;
        const name = assignment(block, 'name'), version = assignment(block, 'version');
        if (name && version) add(file.path, 'crates.io', name, version);
      }
    } else if (base === 'Cargo.toml') {
      let section = '';
      for (const rawLine of file.text.split(/\r?\n/)) {
        const line = uncommentToml(rawLine);
        const heading = line.match(/^\s*\[([^\]]+)\]/); if (heading) section = heading[1];
        if (!/^(?:(?:target\..+\.)?)(?:dependencies|dev-dependencies|build-dependencies)$/.test(section) || /\b(?:git|path|registry)\s*=/.test(line)) continue;
        const dependency = line.match(/^\s*["']?([\w-]+)["']?\s*=\s*(?:["'](=[^"']+)["']|\{[^}]*version\s*=\s*["'](=[^"']+)["'])/);
        if (dependency) {
          const actualName = line.match(/\bpackage\s*=\s*["']([^"']+)["']/)?.[1] ?? dependency[1];
          add(file.path, 'crates.io', actualName, dependency[2] ?? dependency[3]);
        }
      }
    } else if (base === 'go.mod') {
      const replaced = new Set(Array.from(file.text.matchAll(/^\s*(?:replace\s+)?([\w./-]+)(?:\s+v[^\s]+)?\s+=>/gm), match => match[1]));
      let requireBlock = false;
      for (const rawLine of file.text.split(/\r?\n/)) {
        const line = rawLine.replace(/\/\/.*$/, '').trim();
        if (/^require\s*\($/.test(line)) { requireBlock = true; continue; }
        if (line === ')') { requireBlock = false; continue; }
        const match = (requireBlock ? line : /^require\s/.test(line) ? line.replace(/^require\s+/, '') : '').match(/^([\w./-]+)\s+(v\d[^\s]+)$/);
        if (match && !replaced.has(match[1])) add(file.path, 'Go', match[1], match[2]);
      }
    } else if (base === 'pom.xml') {
      const properties = new Map<string, string>();
      const xml = file.text.replace(/<!--[\s\S]*?-->/g, '');
      const body = xml.match(/<properties>([\s\S]*?)<\/properties>/)?.[1] ?? '';
      for (const property of body.matchAll(/<([\w.-]+)>\s*([^<]+)\s*<\/\1>/g)) properties.set(property[1], property[2].trim());
      const tag = (body: string, name: string) => body.match(new RegExp(`<${name}>\\s*([^<]+)\\s*</${name}>`))?.[1].trim();
      for (const match of xml.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
        const group = tag(match[1], 'groupId'), artifact = tag(match[1], 'artifactId');
        const version = tag(match[1], 'version')?.replace(/\$\{([^}]+)\}/g, (_, name: string) => properties.get(name) ?? '${' + name + '}');
        if (group && artifact && version) add(file.path, 'Maven', `${group}:${artifact}`, version);
      }
    }
  }
  return [...found.values()].slice(0, limit);
}
