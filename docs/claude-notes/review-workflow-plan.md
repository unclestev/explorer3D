# Plan for later: pull-request reviews by Claude, merges by the owner

Status: **not set up**. The owner asked on 2026-11-21 to keep this as a note for later ("i don't want to make these updates now"). Nothing below has been changed yet.

## Why
On 2026-11-21 the owner added **jjcodesnow** as a collaborator on `unclestev/explorer3D`. The repo is owned by a personal account, so a collaborator has full write access:
- he can push straight to `main`, which GitHub Pages serves live;
- he can merge pull requests, his own included.

There is no "pull requests only" level for personal-account repos. The owner wants Claude to review changes and to be prompted to merge them himself.

## The plan
1. **Only the owner can merge into `main`:**
   - add `.github/CODEOWNERS` with `* @unclestev` (Claude can commit this);
   - the owner adds a ruleset in GitHub (Settings → Rules → Rulesets, target `main`): require a pull request before merging, 1 approval, require review from Code Owners. Claude can't change repo settings from its session; the branch-protection API returned 403.
   - As owner, unclestev can still merge without approvals. Collaborators (and Claude, acting through the owner's account) can't merge without his approval.
2. **Claude reviews every pull request:**
   - a scheduled task checks every few hours for new or updated pull requests (frequency not yet chosen; offered 2 h, 4 h or daily);
   - for each one: read the diff, check the code for errors (`node --check`, logic review), run it in the test setup where useful, then post a review on the pull request (summary, problems, recommendation).
   - **Comment reviews only, never "Approve":** reviews post from the owner's GitHub account, so an approval would count as his and unlock the merge.
3. **The owner is prompted:** a phone notification with a one-line summary and a link. He approves and merges on GitHub, or doesn't.
4. **Claude's own changes** also go through pull requests once this is on (branch, then the pull request is opened via `gh api repos/unclestev/explorer3D/pulls`), instead of direct pushes to `main`.

## Caveats told to the owner
- **Not instant:** a pull request waits until the next scheduled check.
- **Fresh session per check:** each run starts without the chat's context, so reviews rely on the code and these project notes.
- **Usage cost:** each run uses Claude usage even when there's nothing new.

## To turn it on later
1. Confirm the check frequency with the owner.
2. Commit `CODEOWNERS`.
3. Give the owner the ruleset steps.
4. Create the scheduled task with push notifications.
5. Switch to pull requests for Claude's own changes.
