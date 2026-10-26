"""
Selects the main-experiment stimuli from the Experiment 2 goodness ratings and copies the
images into the jsPsych folder: 16 target concepts (1 good + 1 bad label each; the label
goodness condition decides which one the confederate uses) and 8 filler concepts (1 middle
label each, used by the confederate in every condition).

Input: pair_summary.csv from 03_human_model_convergence.R (one row per Exp2 concept-label
pair: SigLIP2 cosine, mean goodness rating, z-scores across all rated pairs, |dz|).

Selection logic (preregistration: humans and SigLIP2 must converge):
  good label  per concept, the good label with the highest cosine among those humans
              agree with: z(rating) > 0, z(cosine) > 0 and |z(rating) - z(cosine)| <= MAX_ABS_DIFF_Z
  bad label   "bad but plausible", not the worst: a bad label that is neither the lowest-cosine
              nor the lowest-rated bad label of its concept and that humans rate below the mean
              (z(rating) < 0); among these the one with the smallest |dz|
  targets     the N_TARGETS concepts with both labels whose good label has the highest cosine
  middle label (fillers) a middling label humans and SigLIP2 agree on: mean rating within
              FILLER_RATING_RANGE (around 50), |z(cosine)| <= FILLER_MAX_ABS_Z_COSINE and
              |z(rating) - z(cosine)| <= MAX_ABS_DIFF_Z; per concept the one rated closest to 50
  fillers     N_FILLERS concepts drawn at random (fixed seed FILLER_SEED, so every pair gets the
              same fillers) from the non-target concepts that have a middle label

DATA STAGE NOTICE: PAIR_SUMMARY points to the Exp2 PILOT (1-3 ratings per pair). The output
lets programming start; re-run on the main Exp2 data (02_Exp2/output/summaries/pair_summary.csv)
before testing participants. Open decisions (threshold, z scope, minimum ratings, ease range)
are listed in 05_select_main_stimuli.R.

Outputs (in ../01_jspsych_main_social/stimuli/):
  concepts.csv     one row per concept (item_type: target / filler) - read by the experiment
  labels_long.csv  one row per concept x label with all selection measures
  pictures/        the 24 images (other images are removed)

Run with the pilot analysis venv's python:
  ..\\..\\01_pre_study_labels\\02_analysis_Exp1_labels\\01_pilot\\.venv\\Scripts\\python select_stimuli_main.py
"""

import shutil
from pathlib import Path

import pandas as pd

N_TARGETS = 16
N_FILLERS = 8
MAX_ABS_DIFF_Z = 0.5
FILLER_RATING_RANGE = (45, 55)
FILLER_MAX_ABS_Z_COSINE = 0.5
FILLER_SEED = 1

HERE = Path(__file__).parent                       # 03_main_experiment_social_factors/00_stimuli_selection/
SOCIAL = HERE.parent.parent                        # 02_social factors/
PAIR_SUMMARY = (SOCIAL / "02_pre_study_goodness_ratings" / "02_analysis_Exp2_goodness_ratings"
                / "01_pilot_ratings" / "output" / "summaries" / "pair_summary.csv")
EXP2_PICTURES = SOCIAL / "02_pre_study_goodness_ratings" / "01_jspsych_Exp2_goodness_ratings" / "stimuli" / "pictures"
OUT = HERE.parent / "01_jspsych_main_social" / "stimuli"

COLS = ["label", "cosine", "mean_rating", "n_ratings", "z_cosine", "z_rating", "abs_diff_z",
        "model_rank", "human_rank", "novelty", "n_exp1_producers"]


def main():
    pairs = pd.read_csv(PAIR_SUMMARY)
    pairs = pairs[pairs.rated]

    good = pairs[(pairs.label_type == "good") & (pairs.z_rating > 0) & (pairs.z_cosine > 0)
                 & (pairs.abs_diff_z <= MAX_ABS_DIFF_Z)]
    good = good.sort_values("cosine", ascending=False).groupby("concept_id").head(1)

    bad = pairs[pairs.label_type == "bad"].copy()
    by_concept = bad.groupby("concept_id")
    worst = (bad.cosine == by_concept.cosine.transform("min")) | \
            (bad.mean_rating == by_concept.mean_rating.transform("min"))
    bad = bad[~worst & (bad.z_rating < 0)]
    bad = bad.sort_values("abs_diff_z").groupby("concept_id").head(1)

    sel = (good[["concept_id", "difficulty_mean"] + COLS]
           .merge(bad[["concept_id"] + COLS], on="concept_id", suffixes=("_good", "_bad"))
           .sort_values("cosine_good", ascending=False))
    print(f"{len(good)} concepts with a converging good label, {len(bad)} with an eligible bad label, "
          f"{len(sel)} with both")
    if len(sel) < N_TARGETS:
        raise SystemExit(f"only {len(sel)} eligible concepts - relax MAX_ABS_DIFF_Z")
    sel = sel.head(N_TARGETS).assign(item_type="target")

    middle = pairs[pairs.mean_rating.between(*FILLER_RATING_RANGE)
                   & (pairs.z_cosine.abs() <= FILLER_MAX_ABS_Z_COSINE)
                   & (pairs.abs_diff_z <= MAX_ABS_DIFF_Z)
                   & ~pairs.concept_id.isin(sel.concept_id)].copy()
    middle["dist_50"] = (middle.mean_rating - 50).abs()
    middle = middle.sort_values("dist_50").groupby("concept_id").head(1).sort_values("concept_id")
    print(f"{len(middle)} non-target concepts with a middle label")
    if len(middle) < N_FILLERS:
        raise SystemExit(f"only {len(middle)} eligible filler concepts - widen FILLER_RATING_RANGE")
    fill = (middle.sample(N_FILLERS, random_state=FILLER_SEED)[["concept_id", "difficulty_mean"] + COLS]
            .rename(columns={c: f"{c}_middle" for c in COLS}).assign(item_type="filler"))

    sel = pd.concat([sel, fill], ignore_index=True)
    sel.insert(0, "concept_nr", range(1, len(sel) + 1))
    sel.insert(2, "image", sel.concept_id.astype(str) + ".jpg")

    concepts = sel[["concept_nr", "concept_id", "image", "item_type", "difficulty_mean",
                    "label_good", "label_bad", "label_middle", "cosine_good", "cosine_bad", "cosine_middle",
                    "mean_rating_good", "mean_rating_bad", "mean_rating_middle"]] \
        .rename(columns={"label_good": "good_label", "label_bad": "bad_label", "label_middle": "middle_label"})
    long = pd.concat([
        sel[["concept_nr", "concept_id", "image", "item_type"] + [f"{c}_{t}" for c in COLS]]
        .rename(columns=lambda c: c.removesuffix(f"_{t}")).assign(label_type=t).dropna(subset=["label"])
        for t in ("good", "bad", "middle")]).sort_values(["concept_nr", "label_type"], ascending=[True, False])

    pictures = OUT / "pictures"
    pictures.mkdir(parents=True, exist_ok=True)
    for old in pictures.glob("*.jpg"):
        if old.name not in set(concepts.image):
            old.unlink()
    for image in concepts.image:
        shutil.copy2(EXP2_PICTURES / image, pictures / image)
    concepts.to_csv(OUT / "concepts.csv", index=False, encoding="utf-8")
    long.to_csv(OUT / "labels_long.csv", index=False, encoding="utf-8")

    print(concepts.to_string(index=False, float_format="%.3f"))
    print(f"\nwrote {len(concepts)} concepts to {OUT}")


if __name__ == "__main__":
    main()
