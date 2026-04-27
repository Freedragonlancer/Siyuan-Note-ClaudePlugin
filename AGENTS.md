# Repository Guidelines

## Project Structure & Module Organization

This is a SiYuan Note frontend plugin built with TypeScript, Svelte, and Vite. Source lives in `src/`: `src/index.ts` controls plugin lifecycle, `src/ai/` and `src/ai/providers/` define multi-provider AI access, `src/quick-edit/` owns the Quick Edit pipeline, `src/filter/` handles response cleanup, `src/settings/` manages profiles/presets, and `src/sidebar/` contains the unified chat UI. Tests are in `tests/unit/` and `tests/integration/`. Plugin metadata/assets are `plugin.json`, `icon.png`, `preview.png`, and `i18n/`.

## Architecture Notes

Register SiYuan docks and topbar actions in `onLayoutReady()`, not `onload()`; dock `init()` is lazy. Quick Edit flows through selection extraction, prompt building, provider streaming, filter pipeline, inline preview, then accept/reject/retry. When adding providers, update the provider class, exports, `AIProviderFactory`, `AIProviderType`, `DEFAULT_SETTINGS.providers`, settings UI, display-name mapping, and sidebar badge.

## Build, Test, and Development Commands

- `npm run build`: build with Vite into `dist/`.
- `npm run deploy`: build and copy plugin files into the local SiYuan plugin folder.
- `npm run dev`: watch build; hot reload is not supported.
- `npm run test`: run all Vitest tests.
- `npm run test:unit` / `npm run test:integration`: run scoped suites.
- `npm run test:coverage`: generate coverage output.
- `npm run clean-deploy`: remove duplicate deployed artifacts and redeploy.
- `npm run clean-cache`: clear SiYuan cached HTML/CSS when UI changes do not appear.

Mandatory final step after code changes: run relevant validation, then `npm run deploy`. Tell the user if deployment fails. Restart SiYuan with F5 and check the plugin dock plus F12 console.

## Coding Style & Naming Conventions

Use TypeScript ES modules and `@/` imports for `src/`. Match formatting in touched files. Classes and Svelte components use `PascalCase`; functions, methods, and variables use `camelCase`; established constants use `UPPER_SNAKE_CASE`. Prefer explicit interfaces for cross-module contracts. For streaming, collect chunks in arrays and `join()` rather than repeated string concatenation. For large block edits, use `BlockOperations` batch helpers.

## Testing Guidelines

Vitest is configured with `happy-dom`. Add unit tests under `tests/unit/` and integration tests under `tests/integration/`; name files `*.test.ts`, for example `tests/unit/providers/OpenAIProvider.test.ts`. Use targeted tests while developing and `npm run test` for broad validation.

## Commit, Release & Pull Request Guidelines

Use Conventional Commits: `feat: ...`, `fix: ...`, `chore: ...`. Release scripts map `feat:` to minor, `fix:` to patch, and `BREAKING CHANGE:` to major; `npm run release` bumps version, tags, and triggers GitHub Actions. PRs should include a concise description, test results, linked issues, and screenshots or recordings for UI changes. Mention restart, cache clearing, and deploy steps needed for verification.

## Security & Configuration Tips

API keys are stored locally and are not encrypted; never log secrets or commit local configuration. Escape HTML before assigning `innerHTML`, using `SecurityUtils` where applicable. Validate SiYuan block IDs with the expected `^[0-9]{14}-[0-9a-z]{7}$` pattern before SQL/API operations, and use existing timeout/retry helpers for provider calls.
