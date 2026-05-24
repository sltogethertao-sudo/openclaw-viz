# Contributing to OpenClaw Viz

Thanks for your interest! 🌀

## Ways to Contribute

**Report bugs** — Open a [GitHub Issue](https://github.com/sltogethertao-sudo/openclaw-viz/issues/new) with:
- Your OpenClaw version and Viz version
- Browser console errors (if any)
- Steps to reproduce

**Suggest features** — Open an Issue with the `enhancement` label. We're especially interested in:
- New visualization panels
- Additional data collectors
- Integration with more OpenClaw subsystems

**Submit code** — Pull requests welcome.

## Development Setup

```bash
git clone https://github.com/sltogethertao-sudo/openclaw-viz.git
cd openclaw-viz
npm run install:all
npm run dev
```

OpenClaw Gateway must be running locally for the API to have data.

## Pull Request Guidelines

1. **One PR = one concern.** Don't bundle unrelated changes.
2. **Test locally** with a running OpenClaw instance before opening the PR.
3. **Include evidence.** Screenshots, terminal output, or a short demo video help reviewers understand what changed.
4. **Keep it small.** PRs over ~1000 changed lines are hard to review.

## Code Style

- Frontend: React + JSX + Tailwind utility classes
- Backend: Node.js ESM (`import` / `export`)
- D3.js: Prefer readable variable names over cryptic abbreviations
- No Prettier / ESLint config enforced — use common sense

## Questions?

Open a [Discussion](https://github.com/sltogethertao-sudo/openclaw-viz/discussions) or ping us in the repo.
