# Contributing

## Reporting a bug

Open an issue with:

- The tool name (Friends, Groups, or DM)
- Browser and version
- What you did, what happened, what you expected
- Console output, with your token redacted

## Suggesting a feature

Open an issue with the `enhancement` label. Describe the use case before the solution.

## Submitting a PR

1. Fork and create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run `node --check friends-cleaner/friends-cleaner.js` and the same for the other scripts
4. Commit with a clear message: `feat(friends): add country filter`
5. Open the pull request

## Code style

- Vanilla JS only. No build step, no npm dependencies.
- Must work when pasted into the console.
- Comments in English.
- One file per tool, no shared code.

## UI conventions

- Colors: `#313338` background, `#2b2d31` surface, `#1e1f22` input, `#5865f2` primary, `#da373c` danger, `#23a55a` success, `#faa61a` warning
- Radius: `12px` cards, `4px` to `10px` buttons
- Font: `"gg sans", "Noto Sans", sans-serif`
- Every interactive element has a visible hover state
- Every destructive action is confirmed

## Checklist

- Tested in Chrome and Firefox, or a note explaining why one is enough
- No console errors on the normal flow
- No hardcoded IDs, tokens, or personal data
- README updated if behavior changed