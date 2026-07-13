---
    name: Diarias production deploy target
    description: Production hosting for diarias is Railway, not Replit Deployments — pushes to GitHub main do not auto-verify from inside Replit
    ---

    The diarias app's production environment (workspacediarias-production.up.railway.app) is
    hosted on Railway, connected via GitHub (DecargoProjetos/decargo-diarias, branch main).

    Pushing to origin/main does NOT guarantee Railway redeploys — auto-deploy from GitHub can be
    disabled or the webhook can be broken. Confirmed case: three consecutive test rounds after real
    code fixes were pushed (and confirmed on GitHub) showed byte-identical error text in the browser,
    because Railway simply never ran the new commits. The user confirmed via Railway's Deployments tab
    that no new deploy had been triggered.

    **Why this matters:** from inside Replit there is no visibility into Railway's deploy status or
    logs. If a fix is pushed and the user reports the exact same symptom afterward, do NOT assume the
    fix was wrong — first ask the user to check the Railway Deployments tab for the commit hash that
    is actually live, before spending more debugging cycles on the code itself.

    **How to apply:** after pushing a fix intended for this production target, remind the user to
    verify (a) Settings → Source has auto-deploy enabled and points at the right repo/branch, and
    (b) the Deployments tab shows the new commit hash as deployed — or trigger a manual redeploy —
    before re-testing.
    