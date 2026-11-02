# Main experiment: social influence on label adoption

Two participants (a naive participant and a confederate) sit at two computers in the lab and take part in the same session. `main_social_basic.html` implements the three main phases and runs with the included local server. `main_social.html` is the separate scaffold for the full study, including consent, demographics and ID management; its remaining setup is described below.

## Folder structure

| Path | Content | Status |
|---|---|---|
| `main_social_basic.html` | The three main phases, paired across two browsers, without consent, questionnaires or ID allocation. | implemented |
| `main_social.html` | The experiment (jsPsych 7.2.3). Sections 0, 1 and 7 (ID, consent, saving) are written but need the infrastructure below; all other sections contain instructions marked `TODO`. | to do |
| `resources/experiment_config.js` | Conditions, timing, text length, trial-order constraints, confederate behaviour and stimuli paths. | implemented |
| `resources/pair_sync.js` | Browser side of the communication between the two computers. | implemented |
| `sync/sync.php` | Shared response store for a PHP server; `local_server.py` provides the same endpoint locally. | implemented |
| `stimuli/concepts.csv` | 20 concepts from Exp2: 16 targets with good/bad labels and 4 fillers with middle labels, plus selection measures. Made by `../00_stimuli_selection/select_stimuli_main.py`. Read by the experiment. | done (provisional: Exp2 pilot ratings) |
| `stimuli/labels_long.csv` | The matching 36 labels: 32 target labels and 4 filler labels, with cosine, rating, z-scores, absolute z difference, ranks, novelty and Exp1 production counts. | done (provisional) |
| `stimuli/pictures/` | Images referenced by the 20 selected concepts (same resized files as Exp2). Unreferenced files are not used. | done |
| `jspsych/` | Local jsPsych plugins (same as Exp2). | done |
| `data/`, `data_test/`, `sync/state/`, `sync/state_test/` | Runtime output folders created by the local server; create writable folders when deploying with PHP. | created when used |
| `ID_management/`, `ID_management_test/` | Pair-ID allocation for the full-study scaffold; copy and adapt from Exp2 as described below. | to add for full study |

## Basic version: main phases only, run locally in the lab

`main_social_basic.html` contains only the three main phases (no consent, demographics, questionnaire or ID queue). It uses the same `PairSync` / `sync.php` architecture described below, and everything is loaded locally (no internet needed).

1. Connect both computers to the same network. On **one** of them, double-click `start_local.bat`. It finds a working Python 3 interpreter (`py -3` or `python`) and starts `local_server.py` (standard library only), which serves this folder and does the job of `sync/sync.php` and `save_data*.php`. The launcher reports an error and keeps the window open if Python is unavailable or the server exits. Windows asks once whether Python may accept network connections: allow it for private networks. The window prints the address for the other computer, e.g. `http://192.168.0.12:8000/main_social_basic.html`. Keep the server window open for the whole session.
2. Open the page on both computers, choose the role (Versuchsperson / Confederate) and enter the **same pair ID** on both. Or open the URLs directly: `main_social_basic.html?role=naive&pair=1` and `...?role=confederate&pair=1`. Add `&test=1` for test runs (`data_test/`, `sync/state_test/`) and `&n=3` to use only 3 concepts.
3. **Assertiveness** varies between pairs: the confederate is assertive or compliant on all 16 targets, and does the opposite on the 4 fillers. **Label goodness** varies within pairs: the confederate uses the good label for 8 targets and the bad label for the other 8. List A gives odd-numbered targets the good label and even-numbered ones the bad label; list B is the reverse. Fillers always use their middle label. Both follow from the pair ID: pair 1 = assertive/list A, 2 = compliant/A, 3 = assertive/B, 4 = compliant/B, 5 = assertive/A, and so on. The confederate's screens show the strategy, the scripted label and the answer to give, highlighted in yellow.
4. Test run with one item per phase: tick "Testmodus" and enter 1 for "Anzahl Bilder" (or add `&test=1&n=1` to both URLs). The item is picked by pair ID, so different pair IDs test different items, targets and fillers.

For test runs, selecting **Confederate** and enabling **Testmodus** reveals a condition selector on the start page. Choose **Compliant**, **Assertive**, or leave **Automatisch (Paar-ID)** selected to keep the usual assignment. The selector is hidden for the participant role and for regular sessions. The confederate's test selection is shared during connection, so both computers save the same effective `assertiveness`; `assigned_assertiveness` retains the pair-ID assignment and `test_condition_override` records whether a test condition was chosen. Label list, stimulus selection and ordering remain based on pair ID. Direct test URLs can use `&test_condition=compliant` or `&test_condition=assertive` on the confederate URL only; regular sessions and participant URLs ignore this parameter.

The Windows launcher probes interpreters by importing the server dependency rather than relying on their presence on PATH. If `py -3` and `python` fail, it also checks default uv installations under `%APPDATA%\uv\python\cpython-3.*-windows-x86_64-none\python.exe`. Custom uv locations need to be added to PATH. The browser opens only after the server binds successfully; startup failures stay visible in the console. Manual starts still work with `python local_server.py [port]`; add `--open` to open the browser.

### Stimuli and order

Each full phase uses **20 concepts: 16 targets + 4 fillers** (`item_type` in `stimuli/concepts.csv`). The selected concepts retain numbers 1–20: the same 16 targets and the first 4 previously selected fillers (concept IDs 89, 29, 24 and 85). `stimuli/labels_long.csv` contains the matching 36 rows.

`../00_stimuli_selection/select_stimuli_main.py` sets `N_TARGETS = 16` and `N_FILLERS = 4`. The selection rules and `FILLER_SEED = 1` are unchanged. A filler's middle label has a mean rating of 45–55, |z(cosine)| ≤ 0.5 and |z(rating) − z(cosine)| ≤ 0.5. Fillers are sampled from eligible non-target concepts with this fixed seed, so every pair uses the same set. The current selection is based on Exp2 pilot ratings and must be regenerated from the main ratings before participant testing.

Every phase has a reproducible order shared by both computers. The phase seeds are `pairID * 10 + 1`, `pairID * 10 + 2` and `pairID * 10 + 3`; each phase is shuffled independently. The first 3 and last 3 concepts are targets, and all 4 fillers occur in the middle. `CONFIG.filler_free_edge_trials` controls the number of target-only trials at each edge (default `3`).

`&n=<count>` first selects a reproducible subset by pair ID. If that subset contains at least 6 targets, the same edge constraint is applied. With fewer than 6 targets, the phase uses an unrestricted seeded shuffle instead: no concepts are removed, duplicated or replaced to satisfy the edge rule. This lets short test runs include fillers.

### Advancing together and entering text

In phase 1, ending the discussion requires **both participants** to click **Weiter**. The first click shows a waiting message and does not advance the partner. The countdown is a guideline: reaching zero never advances either participant without both confirmations. In phase 2, both participants must click **Weiter** after each feedback screen before either can proceed to the next attempt or picture. This applies to correct responses and to the final allowed attempt as well as to retries. Each discussion and feedback step has its own confirmation key; failed requests retry until the server receives both confirmations.

All text-entry fields in phases 1, 2 and 3 use `CONFIG.text_input_max_length` (default `40` characters), shown beside each input. The limit applies to typing, pasting and the final trimmed uppercase response. If uppercasing expands a response beyond the limit (for example, `ß` becomes `SS`), submission shows an error and leaves the input editable. Both Enter and **Weiter** use the same validation. Entries still need non-whitespace text. Label displays wrap within their own columns, which stack on narrow screens.

The confederate's **effective label** is always the assigned stimulus label (`good_label`, `bad_label` or `middle_label`), with surrounding whitespace removed and uppercase display. It is used consistently for the phase 1 display and choice, phase 2 matching/recommendations and phase 3 adoption scoring. A confederate typing error cannot change that assigned label. The typed submission remains available in the phase 1 `response`/`partner_label` data and in `confederate_typed_label`; `confederate_label` records the effective label and `confederate_label_mismatch` flags a difference. Comparisons ignore case and surrounding whitespace.

### Saved data

Data: `data/social_<pair>_<role>_<start time>.csv`, saved after phase 1, phase 2 and at the end, overwriting the same file each time. If saving fails, the file is downloaded in the browser instead.

## Setting up the infrastructure (copy from Exp2)

Copy the following from the Exp2 pre-study, `02_pre_study_goodness_ratings/01_jspsych_Exp2_goodness_ratings/`, into this folder, then adapt them as described. Read each file while you do it: `main_social.html` expects exactly these paths and names.

| Copy from Exp2 | Put here as | Adapt |
|---|---|---|
| `resources/informed-consent.js`, `resources/browserCheck.js` | `resources/` | nothing |
| `resources/humboldt_logo.png` (missing in Exp2 - take it from Exp1, `01_jspsych_Exp1_labels/resources/`) | `resources/` | nothing |
| `resources/informedconsent_ratings_de.html` | `resources/informedconsent_social_de.html` | procedure, duration and payment for the lab study; replace the Prolific ID parts in the data-protection section by the pair code; do not reveal the confederate. Keep the radio buttons and the `start` button. |
| `save_data.php`, `save_data_test.php` | same names | nothing |
| `ID_management/manageID_ratings.php`, `cleanupID_ratings.php`, `IDs_ratings.txt` | `ID_management/manageID_social.php`, `cleanupID_social.php`, `IDs_social.txt` | file name `IDs_social.txt` inside both scripts; in `cleanupID_social.php` look for `../data/social_<ID>_naive_*.csv` (only the naive participant frees the ID); one line per **pair** in `IDs_social.txt` |
| `ID_management_test/` | `ID_management_test/` | in `cleanupID_test.php` look for `../data_test/TEST_social_<ID>_naive_*.csv` |
| `start_local_test.bat` | same name | open `main_social.html?role=naive&test=1` instead of `test.html`; it needs PHP (the Python fallback cannot run the PHP scripts) |
| `.vscode/settings.json` | same name (optional) | nothing |

`jspsych/` already contains the plugins. Create the required folders when setting up the full study. Add Git ignore rules for participant data, the live ID list, sync state and server passwords before committing runtime output; this folder does not currently include a `.gitignore`.

## Starting the experiment

The experimenter opens one page on each computer:

- naive participant: `main_social.html?role=naive`. This page draws the next **pair ID** from `ID_management/IDs_social.txt` and shows it on the first screen.
- confederate: `main_social.html?role=confederate&pair=<that pair ID>`

Add `&test=1` to both URLs for test runs. The data then goes into `data_test/` and the test ID queue is used, so test runs never mix with real data.

The **condition** follows from the pair ID (`getCondition()` in `experiment_config.js`). Every row of the data contains `pair_id`, `role`, `condition` and `test_mode`. Each participant gets their own file, `data/social_<pair>_<role>_<timestamp>.csv`; merge the two files by `pair_id` in the analysis.

## Architecture: how the two browsers communicate

```
Browser A (jsPsych)  <->  resources/pair_sync.js  <->  sync/sync.php  <->  sync/state/pair_<ID>.json
Browser B (jsPsych)  <->  resources/pair_sync.js  <->        "         <->          "
```

The two browsers never talk to each other directly. Each one writes its responses to a shared JSON file per pair on the server, and reads the partner's responses from it:

1. Participant A enters a label, and `PairSync.sendValue('phase1_label_c1', 'Kreuzhahn')` sends it to `sync.php`, which stores it with a server timestamp.
2. Browser B calls `PairSync.getPartnerValue('phase1_label_c1', ...)`. It asks `sync.php` every 0.5 s ("polling") until the value is there, then continues with exactly that label.
3. Wherever both have to be finished before continuing, both call `PairSync.waitForPartner('<step name>', ...)`. Each browser marks the step as reached and waits until the partner has reached it too.

**Why PHP with polling instead of WebSockets, Firebase or Supabase:**

- It runs on the HU server we already use for the pre-studies, with the same upload workflow. Participants need nothing but a normal browser.
- WebSockets need a server program (e.g. Node.js) that runs permanently, which normal PHP web hosting does not allow.
- Firebase and Supabase store the data with an external (US) company. That causes data-protection problems and requires changing the consent form.
- With two participants and a few exchanges per minute, a 0.5 s delay is not noticeable in the lab, so real-time push is not needed.

**Separation of logic.** `main_social.html` contains only the experimental logic and calls only the four `PairSync` functions. `pair_sync.js` and `sync.php` contain only the communication. All parameters live in `experiment_config.js`. Changing concepts, timing, trial numbers or confederate behaviour should never require touching the sync code.

## Before the first real session

- Create the folders `data/`, `data_test/`, `sync/state/` and `sync/state_test/` on the server and make them writable, as for the pre-studies.
- Set the number of IDs in `ID_management/IDs_social.txt` to the planned number of pairs.
- Replace all `TODO` placeholders in the consent form and the final screen.
- Run at least one full test session on the two real lab computers.

Automated regression checks and their scope are documented in [tests/README.md](../../tests/README.md).
