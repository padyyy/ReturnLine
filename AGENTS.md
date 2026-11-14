# AI Agent Instructions

## 0. Project Context
- Product and scope: `PRODUCT.md`, `docs/mission-scenario.md`, `docs/architecture.md`, `docs/data-sources.md`.
- Pre-kickoff research and team decision papers: `docs/preparation/` (record only; no code, design or number from there goes into the product without being redone at the event).
- Claude Code also loads `CLAUDE.md` with the project history and decisions.

## 1. General Rules
- Read this file before starting any task.
- Follow the existing project architecture and conventions.
- Keep changes small, focused, and maintainable.
- Do not modify unrelated files or modules.
- Reuse existing implementations before creating new ones.
- Do not introduce unnecessary dependencies.
- Never commit secrets, credentials, or API keys.

## 2. Repository Navigation
- Use this file as the entry point for understanding the repository.
- Check the relevant module's `AGENTS.md` before exploring its source code.
- Follow the root `AGENTS.md` and all applicable module-level instructions.
- Module-level instructions may extend global rules but must not contradict them.
- Use documented file paths, functions, and interfaces to locate code.
- Avoid recursively scanning the entire repository unless necessary.
- Inspect only files relevant to the current task.
- Verify documented information against the actual source code.
- If documentation is missing or outdated, inspect the relevant code.

## 3. Module Documentation
- Each major module should contain its own `AGENTS.md`.
- Document the module's purpose, architecture, and dependencies.
- List important files, classes, functions, and interfaces.
- Describe input/output formats and communication between modules.
- Update module documentation when interfaces or architecture change.
- Update the relevant `AGENTS.md` in the same Pull Request when architecture, public interfaces, or important file paths change.
- Do not duplicate global instructions in module-level documentation.
- Keep documentation concise and accurate.

## 4. Development Rules
- Follow the existing coding style and naming conventions.
- Respect established module boundaries and interfaces.
- Coordinate interface changes with the Tech Lead.
- Avoid breaking existing functionality.
- Write or update relevant tests when modifying functionality.
- Never overwrite changes made by other developers or AI agents.
- Check existing modifications before editing shared files.
- Avoid unnecessary refactoring during feature development.

## 5. Integration & Testing
- Verify that modified code builds successfully when possible.
- Run relevant tests before proposing integration.
- Check compatibility with dependent modules.
- Do not merge untested or broken code into `main`.
- Report unresolved issues and potential integration conflicts.
- Ensure new features integrate with the existing architecture.

## 6. Git & Collaboration
- Follow the repository's commit and branching conventions.
- Use feature branches for development.
- Use Pull Requests for merging into `main`.
- Follow Conventional Commits with English commit messages.
- Keep commits small and focused.
- Keep `main` stable and demo-ready.
- Do not commit or push changes without developer approval.
- Do not overwrite or revert other developers' commits.

## 7. AI Agent Behavior
- Prefer targeted changes over large refactorings.
- Do not invent functions, interfaces, or file paths.
- Ask for clarification when requirements are ambiguous.
- Explain architectural changes before implementing them.
- Clearly report what was changed and what was tested.
- Explicitly mention incomplete tasks, assumptions, or uncertainties.
- Prioritize working functionality over unnecessary complexity.

## 8. Team State and Documentation Sync
- At the start and end of each project task, apply the workflow in [.agents/skills/team-state-sync/SKILL.md](.agents/skills/team-state-sync/SKILL.md).
- Read this main file and applicable module instructions as the source of project rules; the skill does not replace them.
- Compare Git state and local functionality with the relevant documentation. Update verified gaps within the task scope; for review-only requests, report findings without edits.
- Codex team members can use `$team-state-sync` when the repository skill is discovered. Other AI tools must load this main file and the linked skill instructions through their own project-instruction mechanism.
