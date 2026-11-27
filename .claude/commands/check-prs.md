---
description: Review open pull requests (usually jjcodesnow's) the way the owner wants, without merging
---
Review the pull requests on unclestev/explorer3D, following CLAUDE.md §2 "Pull requests":

1. `gh api 'repos/unclestev/explorer3D/pulls?state=all&per_page=10'` — list what's open and anything merged since the last check. $ARGUMENTS
2. For each open PR: fetch its branch, read the diff, `node --check` every changed .js, check it merges cleanly with `origin/main` and with any unpushed local work, check the `?v=` bumps in index.html (`bash tools/check.sh origin/main` on a local merge), and run/render it where it's visual (local server or a githack link of the PR's full sha).
3. Summarise each PR in plain words: what it changes, what you checked, any caveats or conflicts (especially two sides bumping the same `?v=`).
4. End with "Tell me to merge it." Do NOT merge, approve, comment or post on GitHub. Merge only when the owner says so, then wait for the Pages deploy and say when it's live.
