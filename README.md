# Social effects in label coining

This fork develops and tests a German-language lab experiment on how a partner influences the labels people coin and adopt for pictured concepts. One participant and one confederate use separate browsers connected to the same server. The confederate follows a script that varies assertiveness and label goodness.

The working entry point is **`main_social_basic.html`**. It implements the three experimental phases without consent, demographics, questionnaires or automatic pair-ID allocation. **`main_social.html` is an unfinished full-study scaffold**, with missing supporting files and task sections marked `TODO`.

## Repository structure

The experiment retains its existing folder name, including the space and trailing `2`:

```text
.
├── README.md
├── .gitignore
├── social_effects_in_label_coining-main 2/
│   ├── 00_stimuli_selection/
│   │   └── select_stimuli_main.py      # Regenerates stimuli from upstream Exp2 inputs
│   └── 01_jspsych_main_social/
│       ├── README.md                   # Detailed experiment and deployment notes
│       ├── main_social_basic.html      # Implemented three-phase experiment
│       ├── main_social.html            # Unfinished full-study scaffold
│       ├── local_server.py             # Static files, pair synchronization and CSV saving
│       ├── start_local.bat             # Windows launcher for the Python server
│       ├── resources/
│       │   ├── experiment_config.js    # Conditions, timing, ordering and confederate script
│       │   ├── label_similarity.js      # Spelling distance and compound-part reversal hints
│       │   ├── pair_sync.js            # Handshake, polling, retries and shared-step barriers
│       │   └── plugin-pair-trial.js     # Custom jsPsych screens and timer cleanup
│       ├── jspsych/                    # Bundled jsPsych 7.3.0 and plugins
│       ├── stimuli/
│       │   ├── concepts.csv            # 20 concepts: 16 targets and 4 fillers
│       │   ├── labels_long.csv         # 36 assigned labels and selection measures
│       │   └── pictures/               # Bundled images; 20 referenced by concepts.csv
│       ├── save_data.php               # CSV saving on a PHP host
│       ├── save_data_test.php          # Separate test CSV saving on a PHP host
│       ├── sync/
│       │   ├── sync.php                # Pair-state endpoint on a PHP host
│       │   └── state/                  # Ordinary-session pair-state JSON files
│       └── data/                       # Ordinary-session CSV output
└── tests/                              # JavaScript and Python regression checks
```

`data_test/` and `sync/state_test/` are created when test sessions use the Python server. The checkout also contains two tracked session CSV files in `data/` and a tracked `sync/state/pair_2.json`; these are session output rather than required source assets. The root `.gitignore` excludes test data and test state, but does not exclude ordinary-session output.

## Run the basic experiment

You need Python 3 on the server computer and a browser on each participant computer. The basic experiment uses bundled JavaScript, plugins and images: no npm packages, Python packages or internet connection are required. Both computers must be able to reach the same server over the local network.

On **one computer only**:

- **Windows:** open `social_effects_in_label_coining-main 2/01_jspsych_main_social/` and double-click `start_local.bat`. It finds Python, starts the server on port 8000 and opens the browser after binding successfully.
- **macOS/Linux:** from the repository root, run:

  ```sh
  cd "social_effects_in_label_coining-main 2/01_jspsych_main_social"
  python3 local_server.py 8000 --open
  ```

For a manual Windows start, use `py -3 local_server.py 8000 --open` from the experiment folder. The port is optional and defaults to `8000`; `--open` is optional. Keep the server running for the whole session and allow local-network access if the operating system asks.

Open `http://localhost:8000/main_social_basic.html` on the server computer. On the other computer, use the **other computer** address printed by the server, for example `http://192.168.0.12:8000/main_social_basic.html`. Choose a different role on each computer and enter the same pair ID, from 1 to 999999. Use a distinct pair ID for each concurrent pair.

For a short test in two browsers or tabs on the server computer, use:

```text
http://localhost:8000/main_social_basic.html?role=naive&pair=101&test=1&n=1
http://localhost:8000/main_social_basic.html?role=confederate&pair=101&test=1&n=1
```

On a second computer, replace `localhost` with the server's network address. Both roles must use the same server, pair ID, test-mode setting and concept count. Click **Start** on both screens, then follow the on-screen instructions. Open the page through the server rather than as a local HTML file.

| URL option | Behavior in `main_social_basic.html` |
|---|---|
| `role=naive` / `role=confederate` | Selects the participant or scripted confederate view. |
| `pair=<ID>` | Identifies the pair and determines conditions and reproducible trial order. |
| `test=1` | Uses separate test data and synchronization folders. |
| `n=<count>` | Selects a reproducible subset for shorter runs; omit for all 20 concepts. This option alone does **not** enable test mode. |
| `test_condition=assertive` / `test_condition=compliant` | Overrides assertiveness on the confederate's test URL only; the choice is shared with the participant browser. |

The launcher also exposes the test condition selector when **Confederate** and **Testmodus** are selected.

## Implemented task and conditions

1. **Shared label generation and discussion:** both people independently enter a label, see both labels, discuss them, then privately choose their preferred label. Discussion ends automatically at the time limit, or early if both click **Weiter**. Each browser signals completion on its click or timeout; both advance after the signals synchronize. Label-entry timeout only prompts a response and does not submit or cut off entry. Choices are revealed afterward by default.
2. **Sender–receiver task:** both people must click **Weiter** after reading their Phase 2 instructions before either enters the task. The participant describes a picture. The confederate sees the description and a traffic light, then supplies **Richtig** or **Falsch** feedback; the current implementation does not present a picture-selection grid to the confederate. Both must acknowledge each feedback screen before the next attempt or concept. There are up to three attempts per concept.
3. **Private naming:** the participant names the pictures again without the confederate. Responses are scored for adoption of the confederate's assigned label.

Pair IDs cycle through the following assignments:

| Pair ID | Assertiveness on targets | Label list |
|---|---|---|
| 1, 5, 9, … | Assertive | A |
| 2, 6, 10, … | Compliant | A |
| 3, 7, 11, … | Assertive | B |
| 4, 8, 12, … | Compliant | B |

List A assigns good labels to odd-numbered targets and bad labels to even-numbered targets; list B reverses this. Each full run has 8 good and 8 bad target labels. Fillers use middle labels and the opposite assertiveness strategy. Confederates receive highlighted labels, strategies and response recommendations. Their assigned stimulus label remains authoritative even if their typed entry differs; typed entries and mismatch diagnostics are retained in the data.

Change parameters in [`resources/experiment_config.js`](<social_effects_in_label_coining-main 2/01_jspsych_main_social/resources/experiment_config.js>). Defaults include 60 seconds for label entry, 60 seconds for discussion, a 40-character input limit and a 500 ms synchronization polling interval. Each phase has a reproducible order based on pair ID, with the first and last three concepts restricted to targets. Short subsets with fewer than six targets use an unrestricted seeded shuffle.

The Phase 2 traffic light appears only on the confederate's response screen. For assertive targets and compliant fillers, an exact match to the assigned Phase 1 label is green and recommends **Richtig**. A non-identical label within Levenshtein distance 3 (configurable), or a possible reversal of two compound parts such as `CDPFANNE → PFANNENCD`, is yellow and asks for manual review without recommending an answer. Other labels are red and recommend **Falsch**, but the confederate can still approve them with **Richtig**. Compliant targets and assertive fillers always show green and recommend **Richtig**, regardless of the label. Nothing is submitted automatically.

Similarity checks ignore case and surrounding whitespace and normalize equivalent Unicode representations. Compound reversal is a spelling heuristic with optional German linking elements, not a semantic judgement; both parts must otherwise match. Synonyms and other plausible descriptions can still be approved manually. The [experiment guide](<social_effects_in_label_coining-main 2/01_jspsych_main_social/README.md>) documents the exact rules and saved diagnostics.

If the similarity script is missing or its comparison fails, the confederate still receives the word and can give feedback. The screen explicitly shows **Ampel nicht verfügbar** for comparisons requiring review, rather than staying on the waiting message. Ensure `resources/label_similarity.js` is copied along with the HTML when moving the experiment to another computer; a missing helper also produces a warning on the confederate's setup screen.

## Communication and saved data

The basic page runs jsPsych trials and calls `PairSync` for communication. Browsers exchange values through a shared JSON store rather than communicating directly:

```text
Participant browser ──┐
                     ├── HTTP server / sync endpoint ── pair-state JSON
Confederate browser ──┘
```

`pair_sync.js` supplies a fresh-session handshake, polling and barriers that wait for both roles. Failed requests retry automatically. Each discussion and feedback step has its own key. Discussion rows record the local completion trigger as `ended_by=confirmed` or `ended_by=timeout`.

`local_server.py` serves the files and implements the `sync/sync.php`, `save_data.php` and `save_data_test.php` routes in Python; it does not execute PHP. For deployment on a PHP host, the included PHP scripts provide those endpoints instead. Create writable `data/`, `data_test/`, `sync/state/` and `sync/state_test/` directories on that host.

The basic experiment saves after Phase 1, Phase 2 and at completion, updating the same file for each role and browser start time:

| Session | CSV file | Pair state |
|---|---|---|
| Ordinary | `data/social_<pair>_<role>_<start_time>.csv` | `sync/state/pair_<pair>.json` |
| Test | `data_test/TEST_social_<pair>_<role>_<start_time>.csv` | `sync/state_test/pair_<pair>.json` |

If server saving fails, the browser downloads the CSV instead. Data includes pair ID, role, effective and assigned assertiveness, test-condition override, label list and test mode, plus trial-specific concept and response fields. Pair the two roles' files using `pair_id` and the relevant trial identifiers.

## Stimuli and unfinished work

The supplied stimuli are provisional outputs based on Exp2 pilot ratings. All 20 referenced images are present; the picture folder currently also contains four unused images. Running the experiment with these files does not require regenerating them.

[`select_stimuli_main.py`](<social_effects_in_label_coining-main 2/00_stimuli_selection/select_stimuli_main.py>) selects target/filler concepts and labels using human ratings and SigLIP2 similarity measures. Regeneration requires pandas, upstream `pair_summary.csv` and the Exp2 source pictures. Those upstream inputs and analysis scripts are **not included in this fork**; update the script's paths and supply the inputs before rerunning it. It rewrites the stimulus CSVs and picture selection. The script documents that selection must be rerun with the main ratings before participant testing.

The separate `main_social.html` scaffold still needs its experimental phases, demographics, questionnaire, consent resources and ID-management infrastructure completed and integrated. It uses CDN dependencies and is not supported by the basic Python server's limited PHP-route emulation. Its test-mode synchronization also needs wiring. See the [experiment guide](<social_effects_in_label_coining-main 2/01_jspsych_main_social/README.md>) for the inherited setup notes and remaining full-study work.

## Regression checks

Run from the repository root with Node.js and Python 3. The tests use standard libraries; no dependency installation is needed.

```sh
node tests/test_trial_order.cjs
node tests/test_experiment_interactions.cjs
node tests/test_label_similarity.cjs
node tests/test_pair_sync.cjs
node tests/test_test_condition.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
```

These checks cover trial ordering, input validation, confederate labels, discussion deadlines and races, feedback barriers, synchronization failures/recovery, test-condition sharing and server startup. They use simulated DOM/transport contexts rather than rendering a real paired browser session. Layout, native typing/pasting, the Windows batch launcher and a complete run on both lab computers still require manual verification. See [`tests/README.md`](tests/README.md) for coverage details.
