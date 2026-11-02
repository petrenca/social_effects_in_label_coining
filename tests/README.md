# Regression checks

Run these commands from the repository root. They use only Node.js and Python standard libraries:

```sh
node tests/test_trial_order.cjs
node tests/test_experiment_interactions.cjs
node tests/test_pair_sync.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
```

- Trial ordering builds the actual experiment timelines across 250 full-run pair IDs and 50 shortened-run pair IDs (`n=1` through `20`), for both roles, with deterministic rebuilds. It checks counts, membership, label balance, phase seeds, matching roles and target-only edges, including the short-run exception.
- Interaction tests run the actual screen callbacks with a small DOM and paired transport substitute. They cover text validation and uppercase expansion, assigned confederate labels and typed diagnostics, both-click barriers, countdown expiry, retries and role-specific response data.
- Synchronization tests use two isolated browser contexts and a simulated server/clock to check confirmations, fresh step keys, simultaneous clicks, failures and recovery.
- Server startup tests check optional ports, browser opening after binding, bind failures and interruption cleanup.

These checks do not render browser layout or execute the Windows batch launcher. Verify long-label wrapping, native typing/pasting and a full session on both Windows lab computers before collecting data.
