import type { RepoSuggestion } from '../shared/types.ts';

import STAR_SNAPSHOT from './suggestion-stars.json' with { type: 'json' };

export type CuratedSuggestion = Omit<RepoSuggestion, 'stars'> & { stars?: number };
// Identities are curated; positive counts come from the checked-in public GitHub snapshot.
const catalog: readonly Omit<RepoSuggestion, 'stars'>[] = [
  {
    "slug": "burntsushi/ripgrep",
    "language": "Rust",
    "description": "ripgrep recursively searches directories for a regex pattern while respecting your gitignore",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "django/django",
    "language": "Python",
    "description": "The Web framework for perfectionists with deadlines.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "expressjs/express",
    "language": "JavaScript",
    "description": "Fast, unopinionated, minimalist web framework for node.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "facebook/react",
    "language": "JavaScript",
    "description": "The library for web and native user interfaces.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "fastapi/fastapi",
    "language": "Python",
    "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "gin-gonic/gin",
    "language": "Go",
    "description": "Gin is a high-performance HTTP web framework written in Go. It provides a Martini-like API but with significantly better performance—up to 4",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "golang/example",
    "language": "Go",
    "description": "Go example projects",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "jquery/jquery",
    "language": "JavaScript",
    "description": "jQuery JavaScript Library",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "karpathy/nanogpt",
    "language": "Python",
    "description": "The simplest, fastest repository for training/finetuning medium-sized GPTs.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "lodash/lodash",
    "language": "JavaScript",
    "description": "A modern JavaScript utility library delivering modularity, performance, & extras.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "pallets/flask",
    "language": "Python",
    "description": "The Python micro framework for building web applications.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "redis/redis",
    "language": "C",
    "description": "For developers, who are building real-time data-driven applications, Redis is the preferred, fastest, and most feature-rich cache, data stru",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "rust-lang/rustlings",
    "language": "Rust",
    "description": ":crab: Small exercises to get you used to reading and writing Rust code!",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "spring-projects/spring-petclinic",
    "language": "Java",
    "description": "A sample Spring-based application",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "vuejs/core",
    "language": "TypeScript",
    "description": "🖖 Vue.js is a progressive, incrementally-adoptable JavaScript framework for building UI on the web.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "chalk/chalk",
    "language": "JavaScript",
    "description": "Small terminal string styling library.",
    "source": "curated"
  },
  {
    "slug": "sindresorhus/p-limit",
    "language": "JavaScript",
    "description": "Tiny concurrency limiter for async functions.",
    "source": "curated"
  },
  {
    "slug": "mrdoob/three.js",
    "language": "JavaScript",
    "description": "Browser 3D graphics engine and examples.",
    "source": "curated"
  },
  {
    "slug": "photonstorm/phaser",
    "language": "JavaScript",
    "description": "A framework for browser games.",
    "source": "curated"
  },
  {
    "slug": "preactjs/preact",
    "language": "JavaScript",
    "description": "Compact UI library with a familiar component model.",
    "source": "curated"
  },
  {
    "slug": "rollup/rollup",
    "language": "JavaScript",
    "description": "JavaScript module bundler.",
    "source": "curated"
  },
  {
    "slug": "nodejs/node",
    "language": "JavaScript",
    "description": "The Node.js JavaScript runtime.",
    "source": "curated"
  },
  {
    "slug": "microsoft/typescript",
    "language": "TypeScript",
    "description": "The TypeScript language and compiler.",
    "source": "curated"
  },
  {
    "slug": "vitejs/vite",
    "language": "TypeScript",
    "description": "Fast frontend tooling and development server.",
    "source": "curated"
  },
  {
    "slug": "excalidraw/excalidraw",
    "language": "TypeScript",
    "description": "Collaborative hand-drawn diagram editor.",
    "source": "curated"
  },
  {
    "slug": "colinhacks/zod",
    "language": "TypeScript",
    "description": "TypeScript-first schema validation.",
    "source": "curated"
  },
  {
    "slug": "trpc/trpc",
    "language": "TypeScript",
    "description": "End-to-end typesafe APIs.",
    "source": "curated"
  },
  {
    "slug": "pmndrs/zustand",
    "language": "TypeScript",
    "description": "Small state management library.",
    "source": "curated"
  },
  {
    "slug": "psf/requests",
    "language": "Python",
    "description": "Friendly HTTP client for Python.",
    "source": "curated"
  },
  {
    "slug": "psf/black",
    "language": "Python",
    "description": "An opinionated Python code formatter.",
    "source": "curated"
  },
  {
    "slug": "pydantic/pydantic",
    "language": "Python",
    "description": "Data validation using Python type annotations.",
    "source": "curated"
  },
  {
    "slug": "pytest-dev/pytest",
    "language": "Python",
    "description": "Python testing framework with rich fixtures.",
    "source": "curated"
  },
  {
    "slug": "textualize/rich",
    "language": "Python",
    "description": "Rich text, tables and progress bars in the terminal.",
    "source": "curated"
  },
  {
    "slug": "fastapi/typer",
    "language": "Python",
    "description": "Build command-line applications with type hints.",
    "source": "curated"
  },
  {
    "slug": "scikit-learn/scikit-learn",
    "language": "Python",
    "description": "Machine learning tools and algorithms.",
    "source": "curated"
  },
  {
    "slug": "astral-sh/uv",
    "language": "Rust",
    "description": "Fast Python package and project manager.",
    "source": "curated"
  },
  {
    "slug": "sharkdp/bat",
    "language": "Rust",
    "description": "A cat replacement with syntax highlighting.",
    "source": "curated"
  },
  {
    "slug": "sharkdp/fd",
    "language": "Rust",
    "description": "A small, friendly filesystem search tool.",
    "source": "curated"
  },
  {
    "slug": "starship/starship",
    "language": "Rust",
    "description": "Cross-shell terminal prompt.",
    "source": "curated"
  },
  {
    "slug": "helix-editor/helix",
    "language": "Rust",
    "description": "A modal text editor with syntax-aware editing.",
    "source": "curated"
  },
  {
    "slug": "bevyengine/bevy",
    "language": "Rust",
    "description": "A data-driven game engine.",
    "source": "curated"
  },
  {
    "slug": "tokio-rs/axum",
    "language": "Rust",
    "description": "Ergonomic asynchronous web application framework.",
    "source": "curated"
  },
  {
    "slug": "ratatui/ratatui",
    "language": "Rust",
    "description": "Build terminal user interfaces.",
    "source": "curated"
  },
  {
    "slug": "junegunn/fzf",
    "language": "Go",
    "description": "Command-line fuzzy finder.",
    "source": "curated"
  },
  {
    "slug": "cli/cli",
    "language": "Go",
    "description": "GitHub from the command line.",
    "source": "curated"
  },
  {
    "slug": "jesseduffield/lazygit",
    "language": "Go",
    "description": "Terminal user interface for Git.",
    "source": "curated"
  },
  {
    "slug": "charmbracelet/bubbletea",
    "language": "Go",
    "description": "A functional framework for terminal applications.",
    "source": "curated"
  },
  {
    "slug": "syncthing/syncthing",
    "language": "Go",
    "description": "Continuous file synchronization.",
    "source": "curated"
  },
  {
    "slug": "caddyserver/caddy",
    "language": "Go",
    "description": "An extensible web server with automatic HTTPS.",
    "source": "curated"
  },
  {
    "slug": "git/git",
    "language": "C",
    "description": "Distributed version control implementation.",
    "source": "curated"
  },
  {
    "slug": "jqlang/jq",
    "language": "C",
    "description": "A lightweight command-line JSON processor.",
    "source": "curated"
  },
  {
    "slug": "curl/curl",
    "language": "C",
    "description": "Transfer data using URLs.",
    "source": "curated"
  },
  {
    "slug": "antirez/kilo",
    "language": "C",
    "description": "A small text editor in a single source file.",
    "source": "curated"
  },
  {
    "slug": "raysan5/raylib",
    "language": "C",
    "description": "A simple library for learning games programming.",
    "source": "curated"
  },
  {
    "slug": "ggml-org/llama.cpp",
    "language": "C++",
    "description": "Local language-model inference in C and C++.",
    "source": "curated"
  },
  {
    "slug": "ocornut/imgui",
    "language": "C++",
    "description": "Immediate-mode graphical user interface library.",
    "source": "curated"
  },
  {
    "slug": "fmtlib/fmt",
    "language": "C++",
    "description": "Modern formatting library.",
    "source": "curated"
  },
  {
    "slug": "sfml/sfml",
    "language": "C++",
    "description": "Multimedia library for games and interactive applications.",
    "source": "curated"
  },
  {
    "slug": "godotengine/godot",
    "language": "C++",
    "description": "A cross-platform 2D and 3D game engine.",
    "source": "curated"
  },
  {
    "slug": "google/guava",
    "language": "Java",
    "description": "Core Java libraries and utilities.",
    "source": "curated"
  },
  {
    "slug": "thealgorithms/java",
    "language": "Java",
    "description": "Algorithms implemented in Java.",
    "source": "curated"
  },
  {
    "slug": "jetbrains/kotlin",
    "language": "Kotlin",
    "description": "The Kotlin language and compiler.",
    "source": "curated"
  },
  {
    "slug": "ktorio/ktor",
    "language": "Kotlin",
    "description": "Build asynchronous Kotlin servers and clients.",
    "source": "curated"
  },
  {
    "slug": "square/okio",
    "language": "Kotlin",
    "description": "An efficient I/O library.",
    "source": "curated"
  },
  {
    "slug": "vapor/vapor",
    "language": "Swift",
    "description": "Server-side Swift web framework.",
    "source": "curated"
  },
  {
    "slug": "alamofire/alamofire",
    "language": "Swift",
    "description": "HTTP networking for Swift.",
    "source": "curated"
  },
  {
    "slug": "rails/rails",
    "language": "Ruby",
    "description": "Full-stack web framework.",
    "source": "curated"
  },
  {
    "slug": "sinatra/sinatra",
    "language": "Ruby",
    "description": "A small web application DSL.",
    "source": "curated"
  },
  {
    "slug": "rubocop/rubocop",
    "language": "Ruby",
    "description": "Ruby static code analyzer and formatter.",
    "source": "curated"
  },
  {
    "slug": "dotnet/runtime",
    "language": "C#",
    "description": "The .NET runtime and core libraries.",
    "source": "curated"
  },
  {
    "slug": "folke/lazy.nvim",
    "language": "Lua",
    "description": "A plugin manager for Neovim.",
    "source": "curated"
  },
  {
    "slug": "neovim/nvim-lspconfig",
    "language": "Lua",
    "description": "Language-server configurations for Neovim.",
    "source": "curated"
  },
  {
    "slug": "flutter/flutter",
    "language": "Dart",
    "description": "Toolkit for cross-platform applications.",
    "source": "curated"
  },
  {
    "slug": "elixir-lang/elixir",
    "language": "Elixir",
    "description": "Functional language built on the Erlang VM.",
    "source": "curated"
  },
  {
    "slug": "phoenixframework/phoenix",
    "language": "Elixir",
    "description": "A productive web framework for Elixir.",
    "source": "curated"
  },
  {
    "slug": "koalaman/shellcheck",
    "language": "Haskell",
    "description": "Static analysis for shell scripts.",
    "source": "curated"
  },
  {
    "slug": "jgm/pandoc",
    "language": "Haskell",
    "description": "Universal document converter.",
    "source": "curated"
  },
  {
    "slug": "ziglang/zig",
    "language": "Zig",
    "description": "The Zig language, compiler and standard library.",
    "source": "curated"
  },
  {
    "slug": "zigtools/zls",
    "language": "Zig",
    "description": "Language server for Zig.",
    "source": "curated"
  },
  {
    "slug": "fluxml/flux.jl",
    "language": "Julia",
    "description": "Machine learning library in Julia.",
    "source": "curated"
  },
  {
    "slug": "tidyverse/ggplot2",
    "language": "R",
    "description": "A grammar of graphics for R.",
    "source": "curated"
  },
  {
    "slug": "laravel/framework",
    "language": "PHP",
    "description": "The Laravel web application framework.",
    "source": "curated"
  },
  {
    "slug": "symfony/symfony",
    "language": "PHP",
    "description": "Reusable PHP components and framework.",
    "source": "curated"
  },
  {
    "slug": "ohmyzsh/ohmyzsh",
    "language": "Shell",
    "description": "Configuration framework for the Z shell.",
    "source": "curated"
  },
  {
    "slug": "zsh-users/zsh-autosuggestions",
    "language": "Shell",
    "description": "Interactive suggestions for Z shell commands.",
    "source": "curated"
  }
];

const savedStars: Record<string, number> = STAR_SNAPSHOT.stars;
export const CURATED_REPOS: readonly CuratedSuggestion[] = catalog.map(repo => {
  const stars = savedStars[repo.slug];
  return Number.isSafeInteger(stars) && stars > 0 ? { ...repo, stars } : { ...repo };
});
