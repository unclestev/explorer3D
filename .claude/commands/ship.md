---
description: Push the current work to main (only when the owner has said "push" or "merge")
---
Only run this if the owner's latest message says "push" or "merge". Otherwise stop and tell him the work is committed and ready.

1. `git fetch origin main` and merge `origin/main` into the current branch (PRs often land in the meantime). Resolve `?v=` conflicts in index.html by setting each number past both sides.
2. `bash tools/check.sh` — must say ALL OK (node --check on everything, every changed JS/CSS file has a new `?v=`, no `//` comment swallowing code).
3. Update CLAUDE.md if any decision, setting, convention or status changed (§7 status, §8 change log).
4. Commit as unclestev with the Co-Authored-By line, then `git push origin HEAD:main`. Never force-push.
5. Poll `gh api repos/unclestev/explorer3D/actions/runs?per_page=3` until the run for the pushed commit is `completed` / `success`, then tell the owner it's live at https://unclestev.github.io/explorer3D/ (about a minute; the installed phone app updates itself on next start).
