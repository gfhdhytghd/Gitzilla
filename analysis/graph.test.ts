import { describe, expect, it } from 'vitest';
import { buildImportGraph, componentTopology, fnv1a, profileFromFiles } from './graph.ts';
import type { SourceFile } from './files.ts';

const files = (entries: Record<string, string>): SourceFile[] => Object.entries(entries).map(([path, text]) => ({ path, text }));
const graph = (entries: Record<string, string>) => buildImportGraph(files(entries));

describe('internal import resolution', () => {
  it('resolves JS/TS import, export-from, require, dynamic import, extension remapping, and index files', () => {
    const g = graph({
      'src/main.ts': `import { a } from './a.js'; export { b } from './b'; const c = require('./lib'); import('./d'); import 'outside';`,
      'src/a.ts': 'export const a = 1;', 'src/b.tsx': 'export const b = 2;',
      'src/lib/index.js': 'module.exports = 3;', 'src/d.mjs': 'export default 4;',
    });
    expect([...g.get('src/main.ts')!].sort()).toEqual(['src/a.ts', 'src/b.tsx', 'src/d.mjs', 'src/lib/index.js']);
  });
  it('resolves workspace package names and tsconfig path aliases', () => {
    const g = graph({
      'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"]}}}',
      'packages/util/package.json': '{"name":"@kaiju/util"}',
      'packages/util/src/index.ts': 'export const x = 1',
      'src/main.ts': `import { x } from '@kaiju/util'; import '@app/core';`,
      'src/core.ts': 'export const core = 1',
    });
    expect([...g.get('src/main.ts')!].sort()).toEqual(['packages/util/src/index.ts', 'src/core.ts']);
  });
  it('resolves Python absolute, relative, from-import, aliases, and multiple imports', () => {
    const g = graph({
      'src/app/main.py': 'import app.core as core, app.other\nfrom . import service\nfrom .core import value\nfrom ..common import util',
      'src/app/core.py': 'value = 1', 'src/app/other.py': '', 'src/app/service.py': '',
      'src/common/__init__.py': '', 'src/common/util.py': '',
    });
    expect([...g.get('src/app/main.py')!].sort()).toEqual(['src/app/core.py', 'src/app/other.py', 'src/app/service.py', 'src/common/__init__.py', 'src/common/util.py']);
  });
  it('resolves Go import blocks using go.mod and ignores external packages and imported tests', () => {
    const g = graph({
      'go.mod': 'module example.com/kaiju\ngo 1.22',
      'cmd/main.go': 'package main\nimport (\n "fmt"\n local "example.com/kaiju/internal/core"\n)\nimport "example.com/kaiju/api"',
      'internal/core/core.go': 'package core', 'internal/core/core_test.go': 'package core', 'api/api.go': 'package api',
    });
    expect([...g.get('cmd/main.go')!].sort()).toEqual(['api/api.go', 'internal/core/core.go']);
  });
  it('resolves Rust module declarations and crate/self/super imports', () => {
    const g = graph({
      'Cargo.toml': '[package]\nname = "kaiju"',
      'src/lib.rs': 'pub mod api; mod core; use crate::core::Thing;',
      'src/core.rs': 'pub struct Thing;',
      'src/api/mod.rs': 'mod child; use super::core::Thing;',
      'src/api/child.rs': 'use crate::{core::Thing, api::Call};',
    });
    expect([...g.get('src/lib.rs')!].sort()).toEqual(['src/api/mod.rs', 'src/core.rs']);
    expect([...g.get('src/api/mod.rs')!].sort()).toEqual(['src/api/child.rs', 'src/core.rs']);
    expect([...g.get('src/api/child.rs')!].sort()).toEqual(['src/api/mod.rs', 'src/core.rs']);
  });
  it('resolves imports across Rust workspace crates', () => {
    const g = graph({
      'crates/core/Cargo.toml': '[package]\nname = "kaiju-core"',
      'crates/core/src/lib.rs': 'pub mod heart;',
      'crates/core/src/heart.rs': 'pub struct Heart;',
      'crates/app/Cargo.toml': '[package]\nname = "kaiju-app"',
      'crates/app/src/main.rs': 'use kaiju_core::heart::Heart;',
    });
    expect([...g.get('crates/app/src/main.rs')!].sort()).toEqual(['crates/core/src/heart.rs', 'crates/core/src/lib.rs']);
  });
  it('resolves Java/Kotlin class, wildcard, and static imports against packages', () => {
    const g = graph({
      'app/Main.java': 'package app;\nimport kaiju.core.Heart;\nimport static kaiju.util.Math.ONE;',
      'core/Heart.java': 'package kaiju.core; public class Heart {}',
      'util/Math.java': 'package kaiju.util; public class Math {}',
      'app/View.kt': 'package app\nimport kaiju.core.*',
    });
    expect([...g.get('app/Main.java')!].sort()).toEqual(['core/Heart.java', 'util/Math.java']);
    expect([...g.get('app/View.kt')!]).toEqual(['core/Heart.java']);
  });
  it('resolves quoted C/C++ headers and Ruby require_relative', () => {
    const g = graph({
      'src/main.cpp': '#include "local.h"\n#include "kaiju/heart.hpp"\n#include <vector>',
      'src/local.h': '', 'include/kaiju/heart.hpp': '',
      'lib/kaiju.rb': `require_relative 'kaiju/heart'\nrequire 'kaiju/math'`,
      'lib/kaiju/heart.rb': '', 'lib/kaiju/math.rb': '',
    });
    expect([...g.get('src/main.cpp')!].sort()).toEqual(['include/kaiju/heart.hpp', 'src/local.h']);
    expect([...g.get('lib/kaiju.rb')!].sort()).toEqual(['lib/kaiju/heart.rb', 'lib/kaiju/math.rb']);
  });
  it('resolves C# namespaces and static/alias using declarations', () => {
    const g = graph({
      'App/Main.cs': 'namespace App;\nusing Kaiju.Core;\nusing static Kaiju.Math.Numbers;\nusing Heart = Kaiju.Core.Heart;',
      'Core/Heart.cs': 'namespace Kaiju.Core; public class Heart {}',
      'Math/Numbers.cs': 'namespace Kaiju.Math { public class Numbers {} }',
    });
    expect([...g.get('App/Main.cs')!].sort()).toEqual(['Core/Heart.cs', 'Math/Numbers.cs']);
  });
  it('ignores vendored/build source and counts each importing file once', () => {
    const p = profileFromFiles('demo/app', files({
      'src/a.ts': `import './heart'; import './heart';\n// import './missing'`,
      'src/b.ts': `export * from './heart'`, 'src/heart.ts': 'export const x = 1',
      'node_modules/foreign/index.ts': 'lots of code', 'vendor/no.c': 'vendor', 'dist/bundle.js': 'build',
    }));
    expect(p.totalFiles).toBe(3); expect(p.heart).toBe('src/heart.ts'); expect(p.heartFanIn).toBe(2);
  });
});

describe('profile graph metrics', () => {
  it('finds the real heart, component cycle, longest condensed path, test ratio, and stable seed', () => {
    const p = profileFromFiles('demo/kaiju', files({
      'src/a/index.ts': `import '../b';\nexport const a = 1;`,
      'src/b/index.ts': `import '../a';\nimport '../c';`,
      'src/c/index.ts': `export const c = 1;`,
      'src/c/index.test.ts': `import './index';`,
    }));
    expect(p.components.map(c => c.name).sort()).toEqual(['src/a', 'src/b', 'src/c']);
    expect(p.cycles).toEqual([['src/a', 'src/b']]);
    expect(p.maxDepth).toBe(1); expect(p.heart).toBe('src/c/index.ts'); expect(p.heartFanIn).toBe(2);
    expect(p.testRatio).toBe(0.25); expect(p.totalLoc).toBe(6);
    expect(p.seed).toBe(fnv1a('demo/kaiju'));
    expect(p.components.find(c => c.name === 'src/b')?.fanOut).toBe(2);
    expect(p.languages.TypeScript).toBeGreaterThan(0);
  });
  it('caps components at eight and merges the remainder while preserving counts and edge indices', () => {
    const source = Array.from({ length: 12 }, (_, i) => ({ path: `packages/p${i}/index.ts`, text: `${i ? `import '../p${i - 1}';` : ''}\n${'const x = 1;\n'.repeat(i + 1)}` }));
    const p = profileFromFiles('demo/large', source);
    expect(p.components).toHaveLength(8);
    expect(p.components.some(c => c.name === 'misc')).toBe(true);
    expect(p.components.reduce((n, c) => n + c.files, 0)).toBe(12);
    expect(p.components.reduce((n, c) => n + c.loc, 0)).toBe(p.totalLoc);
    expect(p.edges.every(([a, b]) => a >= 0 && a < 8 && b >= 0 && b < 8 && a !== b)).toBe(true);
    expect(p.components.map(c => c.loc)).toEqual(p.components.map(c => c.loc).sort((a, b) => b - a));
  });
  it('expands the production directory even when tests account for most LOC', () => {
    const p = profileFromFiles('demo/tested', files({
      'src/core/heart.ts': 'export const heart = 1',
      'src/api/main.ts': "import '../core/heart'",
      'tests/big.test.ts': 'expect(true);\n'.repeat(100),
    }));
    expect(p.components.map(c => c.name).sort()).toEqual(['src/api', 'src/core', 'tests']);
    expect(p.edges).toHaveLength(1);
  });
  it('handles an existing misc component without duplicate names', () => {
    const source = files(Object.fromEntries(['misc', ...Array.from({ length: 9 }, (_, i) => `p${i}`)].map(name => [`${name}/a.py`, 'x = 1'])));
    const p = profileFromFiles('demo/misc', source);
    expect(new Set(p.components.map(c => c.name)).size).toBe(8);
    expect(p.components.reduce((n, c) => n + c.files, 0)).toBe(10);
  });
  it('collapses cycles before computing depth, including disconnected nodes', () => {
    expect(componentTopology(['a', 'b', 'c', 'd', 'e'], [[0, 1], [1, 0], [1, 2], [2, 3]])).toEqual({ cycles: [['a', 'b']], maxDepth: 2 });
    expect(componentTopology([], [])).toEqual({ cycles: [], maxDepth: 0 });
  });
  it('uses metadata language bytes and handles repos with no supported source', () => {
    const p = profileFromFiles('demo/readme', [], { primaryLanguage: 'Rust', languages: { Rust: 42 }, stars: 10 });
    expect(p.primaryLanguage).toBe('Rust'); expect(p.languages).toEqual({ Rust: 42 });
    expect(p.totalFiles).toBe(0); expect(p.testRatio).toBe(0); expect(p.maxDepth).toBe(0);
    expect(fnv1a('hello')).toBe(0x4f9f2cab);
  });
});
