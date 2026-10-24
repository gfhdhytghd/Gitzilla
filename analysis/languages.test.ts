import { describe, expect, it } from 'vitest';
import { selectPrimaryLanguage } from './files.ts';
import { profileFromFiles } from './graph.ts';

describe('hero primary-language selection', () => {
  it('selects Java even when styles outweigh code and GitHub says CSS', () => {
    const p = profileFromFiles('spring-projects/spring-petclinic', [{ path: 'Main.java', text: 'class Main {}' }], {
      primaryLanguage: 'CSS', languages: { CSS: 278931, Java: 141217, HTML: 19176, SCSS: 7939, Dockerfile: 643 },
    });
    expect(p.primaryLanguage).toBe('Java'); expect(p.languages.CSS).toBe(278931);
  });
  it('ignores markup, styles, structured data, and build files when selecting code', () => {
    expect(selectPrimaryLanguage({ CSS: 1000, SCSS: 900, HTML: 800, Less: 700, JSON: 600, YAML: 500, Dockerfile: 400, Makefile: 300, Shell: 200, Rust: 1 }, 'CSS')).toBe('Rust');
    expect(selectPrimaryLanguage({ HTML: 100, CSS: 200, Makefile: 10, Dockerfile: 10 })).toBe('Unknown');
  });
  it('counts notebook bytes as Python and combines them with regular Python bytes', () => {
    expect(selectPrimaryLanguage({ 'Jupyter Notebook': 500, Python: 100, JavaScript: 550 }, 'Jupyter Notebook')).toBe('Python');
    expect(selectPrimaryLanguage({}, 'Jupyter Notebook')).toBe('Python');
  });
  it('uses Shell only when neither metadata nor measured source offers another programming language', () => {
    expect(selectPrimaryLanguage({ Shell: 1000, TypeScript: 1 }, 'Shell')).toBe('TypeScript');
    expect(selectPrimaryLanguage({ Shell: 1000, CSS: 2000 }, 'CSS', { Java: 10 })).toBe('Java');
    expect(selectPrimaryLanguage({ Shell: 1000, CSS: 2000 }, 'CSS')).toBe('Shell');
    expect(selectPrimaryLanguage({}, 'Shell')).toBe('Shell');
  });
  it('uses measured code when only excluded GitHub metadata is available', () => {
    const p = profileFromFiles('demo/app', [{ path: 'src/main.py', text: 'print(1)' }], { primaryLanguage: 'CSS', languages: { CSS: 1000 } });
    expect(p.primaryLanguage).toBe('Python');
  });
});
