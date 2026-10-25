import type { RepoSuggestion } from '../shared/types.ts';

// Curated identities and descriptions. Positive stars come from checked-in fallback metadata;
// zero means unavailable (the UI hides that count), never a guessed live star count.
export const CURATED_REPOS: readonly RepoSuggestion[] = [
  {
    "slug": "burntsushi/ripgrep",
    "language": "Rust",
    "stars": 69399,
    "description": "ripgrep recursively searches directories for a regex pattern while respecting your gitignore",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "django/django",
    "language": "Python",
    "stars": 91577,
    "description": "The Web framework for perfectionists with deadlines.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "expressjs/express",
    "language": "JavaScript",
    "stars": 69576,
    "description": "Fast, unopinionated, minimalist web framework for node.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "facebook/react",
    "language": "JavaScript",
    "stars": 251746,
    "description": "The library for web and native user interfaces.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "fastapi/fastapi",
    "language": "Python",
    "stars": 104085,
    "description": "FastAPI framework, high performance, easy to learn, fast to code, ready for production",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "gin-gonic/gin",
    "language": "Go",
    "stars": 89424,
    "description": "Gin is a high-performance HTTP web framework written in Go. It provides a Martini-like API but with significantly better performance—up to 4",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "golang/example",
    "language": "Go",
    "stars": 2981,
    "description": "Go example projects",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "jquery/jquery",
    "language": "JavaScript",
    "stars": 59911,
    "description": "jQuery JavaScript Library",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "karpathy/nanogpt",
    "language": "Python",
    "stars": 64056,
    "description": "The simplest, fastest repository for training/finetuning medium-sized GPTs.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "lodash/lodash",
    "language": "JavaScript",
    "stars": 61280,
    "description": "A modern JavaScript utility library delivering modularity, performance, & extras.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "pallets/flask",
    "language": "Python",
    "stars": 75027,
    "description": "The Python micro framework for building web applications.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "redis/redis",
    "language": "C",
    "stars": 77080,
    "description": "For developers, who are building real-time data-driven applications, Redis is the preferred, fastest, and most feature-rich cache, data stru",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "rust-lang/rustlings",
    "language": "Rust",
    "stars": 64449,
    "description": ":crab: Small exercises to get you used to reading and writing Rust code!",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "spring-projects/spring-petclinic",
    "language": "Java",
    "stars": 9598,
    "description": "A sample Spring-based application",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "vuejs/core",
    "language": "TypeScript",
    "stars": 54804,
    "description": "🖖 Vue.js is a progressive, incrementally-adoptable JavaScript framework for building UI on the web.",
    "source": "curated",
    "fallback": true
  },
  {
    "slug": "chalk/chalk",
    "language": "JavaScript",
    "stars": 0,
    "description": "Small terminal string styling library.",
    "source": "curated"
  },
  {
    "slug": "sindresorhus/p-limit",
    "language": "JavaScript",
    "stars": 0,
    "description": "Tiny concurrency limiter for async functions.",
    "source": "curated"
  },
  {
    "slug": "mrdoob/three.js",
    "language": "JavaScript",
    "stars": 0,
    "description": "Browser 3D graphics engine and examples.",
    "source": "curated"
  },
  {
    "slug": "photonstorm/phaser",
    "language": "JavaScript",
    "stars": 0,
    "description": "A framework for browser games.",
    "source": "curated"
  },
  {
    "slug": "preactjs/preact",
    "language": "JavaScript",
    "stars": 0,
    "description": "Compact UI library with a familiar component model.",
    "source": "curated"
  },
  {
    "slug": "rollup/rollup",
    "language": "JavaScript",
    "stars": 0,
    "description": "JavaScript module bundler.",
    "source": "curated"
  },
  {
    "slug": "nodejs/node",
    "language": "JavaScript",
    "stars": 0,
    "description": "The Node.js JavaScript runtime.",
    "source": "curated"
  },
  {
    "slug": "microsoft/typescript",
    "language": "TypeScript",
    "stars": 0,
    "description": "The TypeScript language and compiler.",
    "source": "curated"
  },
  {
    "slug": "vitejs/vite",
    "language": "TypeScript",
    "stars": 0,
    "description": "Fast frontend tooling and development server.",
    "source": "curated"
  },
  {
    "slug": "excalidraw/excalidraw",
    "language": "TypeScript",
    "stars": 0,
    "description": "Collaborative hand-drawn diagram editor.",
    "source": "curated"
  },
  {
    "slug": "colinhacks/zod",
    "language": "TypeScript",
    "stars": 0,
    "description": "TypeScript-first schema validation.",
    "source": "curated"
  },
  {
    "slug": "trpc/trpc",
    "language": "TypeScript",
    "stars": 0,
    "description": "End-to-end typesafe APIs.",
    "source": "curated"
  },
  {
    "slug": "pmndrs/zustand",
    "language": "TypeScript",
    "stars": 0,
    "description": "Small state management library.",
    "source": "curated"
  },
  {
    "slug": "psf/requests",
    "language": "Python",
    "stars": 0,
    "description": "Friendly HTTP client for Python.",
    "source": "curated"
  },
  {
    "slug": "psf/black",
    "language": "Python",
    "stars": 0,
    "description": "An opinionated Python code formatter.",
    "source": "curated"
  },
  {
    "slug": "pydantic/pydantic",
    "language": "Python",
    "stars": 0,
    "description": "Data validation using Python type annotations.",
    "source": "curated"
  },
  {
    "slug": "pytest-dev/pytest",
    "language": "Python",
    "stars": 0,
    "description": "Python testing framework with rich fixtures.",
    "source": "curated"
  },
  {
    "slug": "textualize/rich",
    "language": "Python",
    "stars": 0,
    "description": "Rich text, tables and progress bars in the terminal.",
    "source": "curated"
  },
  {
    "slug": "fastapi/typer",
    "language": "Python",
    "stars": 0,
    "description": "Build command-line applications with type hints.",
    "source": "curated"
  },
  {
    "slug": "scikit-learn/scikit-learn",
    "language": "Python",
    "stars": 0,
    "description": "Machine learning tools and algorithms.",
    "source": "curated"
  },
  {
    "slug": "astral-sh/uv",
    "language": "Rust",
    "stars": 0,
    "description": "Fast Python package and project manager.",
    "source": "curated"
  },
  {
    "slug": "sharkdp/bat",
    "language": "Rust",
    "stars": 0,
    "description": "A cat replacement with syntax highlighting.",
    "source": "curated"
  },
  {
    "slug": "sharkdp/fd",
    "language": "Rust",
    "stars": 0,
    "description": "A small, friendly filesystem search tool.",
    "source": "curated"
  },
  {
    "slug": "starship/starship",
    "language": "Rust",
    "stars": 0,
    "description": "Cross-shell terminal prompt.",
    "source": "curated"
  },
  {
    "slug": "helix-editor/helix",
    "language": "Rust",
    "stars": 0,
    "description": "A modal text editor with syntax-aware editing.",
    "source": "curated"
  },
  {
    "slug": "bevyengine/bevy",
    "language": "Rust",
    "stars": 0,
    "description": "A data-driven game engine.",
    "source": "curated"
  },
  {
    "slug": "tokio-rs/axum",
    "language": "Rust",
    "stars": 0,
    "description": "Ergonomic asynchronous web application framework.",
    "source": "curated"
  },
  {
    "slug": "ratatui/ratatui",
    "language": "Rust",
    "stars": 0,
    "description": "Build terminal user interfaces.",
    "source": "curated"
  },
  {
    "slug": "junegunn/fzf",
    "language": "Go",
    "stars": 0,
    "description": "Command-line fuzzy finder.",
    "source": "curated"
  },
  {
    "slug": "cli/cli",
    "language": "Go",
    "stars": 0,
    "description": "GitHub from the command line.",
    "source": "curated"
  },
  {
    "slug": "jesseduffield/lazygit",
    "language": "Go",
    "stars": 0,
    "description": "Terminal user interface for Git.",
    "source": "curated"
  },
  {
    "slug": "charmbracelet/bubbletea",
    "language": "Go",
    "stars": 0,
    "description": "A functional framework for terminal applications.",
    "source": "curated"
  },
  {
    "slug": "syncthing/syncthing",
    "language": "Go",
    "stars": 0,
    "description": "Continuous file synchronization.",
    "source": "curated"
  },
  {
    "slug": "caddyserver/caddy",
    "language": "Go",
    "stars": 0,
    "description": "An extensible web server with automatic HTTPS.",
    "source": "curated"
  },
  {
    "slug": "git/git",
    "language": "C",
    "stars": 0,
    "description": "Distributed version control implementation.",
    "source": "curated"
  },
  {
    "slug": "jqlang/jq",
    "language": "C",
    "stars": 0,
    "description": "A lightweight command-line JSON processor.",
    "source": "curated"
  },
  {
    "slug": "curl/curl",
    "language": "C",
    "stars": 0,
    "description": "Transfer data using URLs.",
    "source": "curated"
  },
  {
    "slug": "antirez/kilo",
    "language": "C",
    "stars": 0,
    "description": "A small text editor in a single source file.",
    "source": "curated"
  },
  {
    "slug": "raylib/raylib",
    "language": "C",
    "stars": 0,
    "description": "A simple library for learning games programming.",
    "source": "curated"
  },
  {
    "slug": "ggml-org/llama.cpp",
    "language": "C++",
    "stars": 0,
    "description": "Local language-model inference in C and C++.",
    "source": "curated"
  },
  {
    "slug": "ocornut/imgui",
    "language": "C++",
    "stars": 0,
    "description": "Immediate-mode graphical user interface library.",
    "source": "curated"
  },
  {
    "slug": "fmtlib/fmt",
    "language": "C++",
    "stars": 0,
    "description": "Modern formatting library.",
    "source": "curated"
  },
  {
    "slug": "sfml/sfml",
    "language": "C++",
    "stars": 0,
    "description": "Multimedia library for games and interactive applications.",
    "source": "curated"
  },
  {
    "slug": "godotengine/godot",
    "language": "C++",
    "stars": 0,
    "description": "A cross-platform 2D and 3D game engine.",
    "source": "curated"
  },
  {
    "slug": "google/guava",
    "language": "Java",
    "stars": 0,
    "description": "Core Java libraries and utilities.",
    "source": "curated"
  },
  {
    "slug": "thealgorithms/java",
    "language": "Java",
    "stars": 0,
    "description": "Algorithms implemented in Java.",
    "source": "curated"
  },
  {
    "slug": "jetbrains/kotlin",
    "language": "Kotlin",
    "stars": 0,
    "description": "The Kotlin language and compiler.",
    "source": "curated"
  },
  {
    "slug": "ktorio/ktor",
    "language": "Kotlin",
    "stars": 0,
    "description": "Build asynchronous Kotlin servers and clients.",
    "source": "curated"
  },
  {
    "slug": "square/okio",
    "language": "Kotlin",
    "stars": 0,
    "description": "An efficient I/O library.",
    "source": "curated"
  },
  {
    "slug": "vapor/vapor",
    "language": "Swift",
    "stars": 0,
    "description": "Server-side Swift web framework.",
    "source": "curated"
  },
  {
    "slug": "alamofire/alamofire",
    "language": "Swift",
    "stars": 0,
    "description": "HTTP networking for Swift.",
    "source": "curated"
  },
  {
    "slug": "rails/rails",
    "language": "Ruby",
    "stars": 0,
    "description": "Full-stack web framework.",
    "source": "curated"
  },
  {
    "slug": "sinatra/sinatra",
    "language": "Ruby",
    "stars": 0,
    "description": "A small web application DSL.",
    "source": "curated"
  },
  {
    "slug": "rubocop/rubocop",
    "language": "Ruby",
    "stars": 0,
    "description": "Ruby static code analyzer and formatter.",
    "source": "curated"
  },
  {
    "slug": "dotnet/runtime",
    "language": "C#",
    "stars": 0,
    "description": "The .NET runtime and core libraries.",
    "source": "curated"
  },
  {
    "slug": "folke/lazy.nvim",
    "language": "Lua",
    "stars": 0,
    "description": "A plugin manager for Neovim.",
    "source": "curated"
  },
  {
    "slug": "neovim/nvim-lspconfig",
    "language": "Lua",
    "stars": 0,
    "description": "Language-server configurations for Neovim.",
    "source": "curated"
  },
  {
    "slug": "flutter/flutter",
    "language": "Dart",
    "stars": 0,
    "description": "Toolkit for cross-platform applications.",
    "source": "curated"
  },
  {
    "slug": "elixir-lang/elixir",
    "language": "Elixir",
    "stars": 0,
    "description": "Functional language built on the Erlang VM.",
    "source": "curated"
  },
  {
    "slug": "phoenixframework/phoenix",
    "language": "Elixir",
    "stars": 0,
    "description": "A productive web framework for Elixir.",
    "source": "curated"
  },
  {
    "slug": "koalaman/shellcheck",
    "language": "Haskell",
    "stars": 0,
    "description": "Static analysis for shell scripts.",
    "source": "curated"
  },
  {
    "slug": "jgm/pandoc",
    "language": "Haskell",
    "stars": 0,
    "description": "Universal document converter.",
    "source": "curated"
  },
  {
    "slug": "ziglang/zig",
    "language": "Zig",
    "stars": 0,
    "description": "The Zig language, compiler and standard library.",
    "source": "curated"
  },
  {
    "slug": "zigtools/zls",
    "language": "Zig",
    "stars": 0,
    "description": "Language server for Zig.",
    "source": "curated"
  },
  {
    "slug": "fluxml/flux.jl",
    "language": "Julia",
    "stars": 0,
    "description": "Machine learning library in Julia.",
    "source": "curated"
  },
  {
    "slug": "tidyverse/ggplot2",
    "language": "R",
    "stars": 0,
    "description": "A grammar of graphics for R.",
    "source": "curated"
  },
  {
    "slug": "laravel/framework",
    "language": "PHP",
    "stars": 0,
    "description": "The Laravel web application framework.",
    "source": "curated"
  },
  {
    "slug": "symfony/symfony",
    "language": "PHP",
    "stars": 0,
    "description": "Reusable PHP components and framework.",
    "source": "curated"
  },
  {
    "slug": "ohmyzsh/ohmyzsh",
    "language": "Shell",
    "stars": 0,
    "description": "Configuration framework for the Z shell.",
    "source": "curated"
  },
  {
    "slug": "zsh-users/zsh-autosuggestions",
    "language": "Shell",
    "stars": 0,
    "description": "Interactive suggestions for Z shell commands.",
    "source": "curated"
  }
];
