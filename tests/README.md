# Regression checks

Run these commands from the repository root. They use only Node.js and Python standard libraries:

```sh
node tests/test_trial_order.cjs
node tests/test_experiment_interactions.cjs
node tests/test_label_similarity.cjs
node tests/test_pair_sync.cjs
node tests/test_test_condition.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
```

- Trial ordering builds the actual experiment timelines across 250 full-run pair IDs and 50 shortened-run pair IDs (`n=1` through `20`), for both roles, with deterministic rebuilds. It checks counts, membership, label balance, phase seeds, matching roles, target-only edges, no consecutive fillers and unchanged filler positions after boundary repair. Both final pictures of each preceding phase are checked against both opening positions of the next phase, including a case where repairing Phase 2 changes its tail before Phase 3 is built. Short subsets check the remaining conflicts, setup warning and saved diagnostics when the restrictions cannot be satisfied. Boundary cases also cover exact-capacity gaps, relaxed edges, empty inputs and zero/invalid edge settings.
- Interaction tests run the actual screen callbacks with a small DOM and paired transport substitute. They cover text validation and uppercase expansion, assigned confederate labels and typed diagnostics, automatic discussion completion at offset deadlines, early clicks, mixed click/timeout completion, click/timeout races, fresh concept barriers, and role-specific response data. Phase 1 label-entry timing, Phase 2 instruction readiness in both role orders, and Phase 2 feedback barriers/retries are checked separately.
- Synchronization tests use two isolated browser contexts and a simulated server/clock to check confirmations, fresh step keys, simultaneous clicks, failures and recovery.
- Phase 1 panel checks reuse each role's display across target → filler → target trials in both conditions, covering label entry, discussion and private choice. They verify the filler-specific class, the existing filler/strategy text, the return to the default target panel, no participant panels, and the default Phase 2 filler panel before and after a term arrives. Browser rendering of the yellow/blue colors still needs a visual check.
- Label-similarity checks cover Unicode normalization and code-point edit distance, generated distance comparisons, compound reversal with linking elements (including `CDPFANNE → PFANNENCD`), and negative cases such as arbitrary anagrams. Interaction checks cover all traffic-light colors, the condition/filler rules, manual feedback choices, confederate-only diagnostics and single submission per attempt. Missing/throwing similarity helpers are checked in both role orders to ensure received words and feedback remain usable and exact-use data still completes on both computers. The interaction harness loads the helper through the path declared in the actual HTML.
- Test condition checks cover role/test visibility, URL validation, both startup orders, delayed synchronization, matching data and condition-specific feedback.
- Server startup tests check optional ports, browser opening after binding, bind failures and interruption cleanup.

These checks do not render browser layout or execute the Windows batch launcher. Verify long-label wrapping, native typing/pasting and a full session on both Windows lab computers before collecting data.
