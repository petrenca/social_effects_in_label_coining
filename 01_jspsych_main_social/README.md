# Main experiment: social influence on label adoption

Two participants (a naive participant and a confederate) sit at two computers in the lab and take part in the same session. This folder contains the experiment skeleton and the stimuli; the infrastructure has to be copied in from the Exp2 pre-study (see the next section), and the experiment itself is to be implemented.

## Folder structure

| Path | Content | Status |
|---|---|---|
| `main_social.html` | The experiment (jsPsych 7.2.3). Sections 0, 1 and 7 (ID, consent, saving) are written but need the infrastructure below; all other sections contain instructions marked `TODO`. | to do |
| `resources/experiment_config.js` | All changeable parameters: conditions, timing, trial numbers, confederate behaviour, stimuli file. | to fill in |
| `resources/pair_sync.js` | Browser side of the communication between the two computers. | to implement |
| `sync/sync.php` | Server side of the communication: shared store of both participants' responses. | to implement |
| `stimuli/concepts.csv` | 20 concepts from Exp2, one row each: `concept_nr`, `concept_id`, `image`, `good1`-`good4`, `bad1`-`bad4` (ordered by SigLIP2 cosine), `labels_to_check`. Read by the experiment. | done (provisional) |
| `stimuli/labels_long.csv` | The same labels, one row per label, with cosine, novelty and how often they were produced in Exp1. | done (provisional) |
| `stimuli/pictures/` | The 20 images (same resized files as Exp2). | done |
| `jspsych/` | Local jsPsych plugins (same as Exp2). | done |
| `ID_management/`, `ID_management_test/`, `data/`, `data_test/`, `sync/state/`, `sync/state_test/` | Empty, to be filled (see below). | to fill |
| `.gitignore` | Keeps participant data, the live ID list, the sync state and server passwords out of GitHub. Do not delete. | done |

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

The folders already exist (empty, apart from a `.gitkeep` file that only makes Git keep the empty folder), and `jspsych/` already contains the plugins. Whatever is written into `data/`, `data_test/` and `sync/state*/` during the experiment stays out of GitHub (`.gitignore`).

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
