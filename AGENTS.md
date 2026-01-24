# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents working in this codebase.

## Project Overview

Web PDF Viewer application using PDFium WebAssembly. TypeScript/React monorepo built with:

- **Frontend**: React 19.x, Vite 7.x, Tailwind CSS 4.x
- **Monorepo**: Turborepo with pnpm workspaces (pnpm 8.12.0)
- **WebAssembly**: PDFium compiled to WASM via Emscripten

### Package Structure

```
packages/
├── pdf-viewer/     # Main React application (Vite)
├── ui/             # Shared UI components (source-only, no build)
├── controller/     # PDF controller utilities
└── pdfium-wasm/    # PDFium WASM wrapper
```

## Build/Lint/Test Commands

### Root-level Commands

```bash
pnpm lint              # Run ESLint across all packages
pnpm lint:fix          # Run ESLint with auto-fix
pnpm format            # Format code with Prettier
pnpm dev               # Run dev servers for all packages
pnpm dev:viewer        # Dev mode for pdf-viewer + dependencies
pnpm build             # Build all packages via Turborepo
pnpm build:pdfium      # Build pdfium-wasm package only
```

### Package-specific Commands

```bash
# pdf-viewer
pnpm --filter pdf-viewer dev      # Start Vite dev server
pnpm --filter pdf-viewer build    # Build for production
pnpm --filter pdf-viewer preview  # Preview production build

# controller
pnpm --filter @pdfviewer/controller build  # Compile TypeScript
pnpm --filter @pdfviewer/controller dev    # Watch mode

# pdfium-wasm
pnpm --filter @pdfviewer/pdfium-wasm build       # Build WASM + TypeScript
pnpm --filter @pdfviewer/pdfium-wasm build:wasm  # Build WASM only
```

### Running Tests

No test framework is currently configured in this project.

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2020
- **Module**: ESNext with bundler resolution
- **Strict mode**: Enabled
- **JSX**: react-jsx (automatic runtime)
- No unused locals/parameters allowed
- No fallthrough cases in switch statements

### Interface Naming Convention (REQUIRED)

All TypeScript interfaces MUST be prefixed with `I` and use PascalCase:

```typescript
// Correct
export interface IPoint {
  x: number;
  y: number;
}
export interface IRenderOptions {
  scale?: number;
}
export interface IPdfController {
  /* ... */
}

// Incorrect - will fail linting
export interface Point {
  x: number;
  y: number;
}
export interface RenderOptions {
  scale?: number;
}
```

### Formatting (Prettier)

- **Semicolons**: Required
- **Tab width**: 2 spaces
- **Print width**: 100 characters
- **Quotes**: Single quotes for JS/TS, double quotes for JSX
- **Trailing commas**: All (including function parameters)
- **Bracket spacing**: Yes

### Import Organization

- Type imports should use `import type` syntax
- Group imports logically (external, internal, relative)

```typescript
import { type PDFiumModule, createPdfiumModule } from '@pdfviewer/pdfium-wasm';
import { useState, useRef } from 'react';
import { PdfEditor } from './components/PdfEditor';
```

### React Components

- Use functional components with hooks
- Use `type` for component props unless shared across files
- Export components as named exports (not default, except App)

```typescript
type Props = {
  onFileSelect: (file: File) => void;
};

export function LandingPage({ onFileSelect }: Props) {
  // ...
}
```

### Error Handling

- Throw descriptive errors with context
- Use early returns for guard clauses
- Check for null/undefined before using resources

```typescript
if (!this.pdfiumModule || !this.docPtr) {
  throw new Error('PDF not loaded. Call loadFile() first.');
}
```

### Memory Management (WASM)

When working with PDFium WASM, always:

1. Use `_malloc` to allocate memory
2. Use `_free` to release memory in finally blocks
3. Clean up page/document handles when done

```typescript
const ptr = pdfium._malloc(size);
try {
  // Use allocated memory
} finally {
  pdfium._free(ptr);
}
```

### Naming Conventions

- **Variables/Functions**: camelCase
- **Classes**: PascalCase
- **Interfaces**: IPascalCase (with I prefix)
- **Constants**: UPPER_SNAKE_CASE for true constants, camelCase for const variables
- **Files**: PascalCase for components, camelCase for utilities

### Comments

- Use JSDoc-style comments for public APIs
- Inline comments for complex logic
- Comments may be in Chinese for internal documentation

## Commit Conventions

Uses conventional commits with commitizen (cz-git):

```
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Code style (no logic change)
refactor: Code change (no fix/feature)
perf:     Performance improvement
test:     Adding/correcting tests
build:    Build system/dependencies
ci:       CI configuration
chore:    Other changes
revert:   Revert previous commit
```

Pre-commit hooks run:

- **lint-staged**: ESLint fix on staged .ts/.tsx/.js/.jsx files
- **commitlint**: Validates commit message format

## Project Dependencies

### Core Technologies

- React 19.x, React DOM 19.x
- TypeScript 5.9.x
- Vite 7.x
- Tailwind CSS 4.x

### UI Libraries

- Radix UI (dialog, tooltip, separator, slot)
- Lucide React (icons)
- class-variance-authority, clsx, tailwind-merge

### Development Tools

- ESLint 9.x (flat config)
- Prettier 3.x
- Husky 9.x + lint-staged 15.x
- Turborepo 2.6.x

## Key Files Reference

| File                   | Purpose                       |
| ---------------------- | ----------------------------- |
| `tsconfig.base.json`   | Base TypeScript configuration |
| `eslint.config.js`     | ESLint flat config (v9)       |
| `.prettierrc`          | Prettier formatting rules     |
| `turbo.json`           | Turborepo task configuration  |
| `pnpm-workspace.yaml`  | Workspace package definitions |
| `commitlint.config.js` | Commit message rules          |

## Tips for Agents

1. Always run `pnpm lint:fix` before committing
2. Interface names must start with `I` - this is enforced by ESLint
3. Use workspace protocol for internal dependencies: `"@pdfviewer/ui": "workspace:*"`
4. The `ui` package is source-only (no build step)
5. PDFium WASM operations require careful memory management
6. Check `packages/pdfium-wasm/README.md` for WASM API documentation
