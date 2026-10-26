/* ------------------------------------------------------------------------------------------------
   EXPERIMENT CONFIGURATION
   All parameters that are likely to change go here, so that main_social*.html contains only the
   experimental logic and resources/pair_sync.js only the communication between the two browsers.
   Nothing in this file talks to the server.
   ------------------------------------------------------------------------------------------------ */

var CONFIG = {

    // 1. Assertiveness (confederate behaviour), between pairs - assigned by pair ID in getCondition():
    //   'assertive' - the confederate sticks to their own label (phase 1) and accepts the naive
    //                 participant's description only once it uses the confederate's label (phase 2)
    //   'compliant' - the confederate adopts the naive participant's label (phase 1) and accepts
    //                 any description at once (phase 2)
    //   In filler concepts the confederate does the opposite of the condition.
    assertiveness_conditions: ['assertive', 'compliant'],
    // 2. Label goodness, within pairs: which label the confederate enters for a target (column
    //   good_label or bad_label of the stimuli file); half of the 16 targets good, half bad - see
    //   getLabelGoodness(). Fillers always use middle_label.

    // timing in milliseconds (values from the study description)
    timing: {
        phase1_label_entry_ms: 60000,   // time to think of and enter a label (a countdown; entry is not cut off)
        phase1_discussion_ms: 60000,    // discussion of the two labels, then the choice screen appears automatically
        sync_poll_interval_ms: 500,     // how often the browser asks the server for news
    },

    // phase 2: maximum number of attempts per picture
    phase2_max_attempts: 3,

    // phase 1: show both participants' choices after the private choice? The study description
    // asks whether revealing the "private" choice makes participants adapt it - set to false to hide it.
    phase1_reveal_choices: true,

    // Stimuli: one row per concept (concept_nr, concept_id, image, item_type target/filler,
    // good_label, bad_label, middle_label, ...), made by ../00_stimuli_selection/select_stimuli_main.py
    // (16 targets, 8 fillers). All rows are used; for quick test runs add &n=1 to the URL.
    // Images are in stimuli/pictures/.
    stimuli_file: 'stimuli/concepts.csv',
    image_folder: 'stimuli/pictures/',

    // phrases shown to the confederate during the phase 1 discussion; {own} = confederate's label,
    // {partner} = naive participant's label
    confederate_phrases: {
        insist: [
            'Ich finde meinen Begriff eigentlich passender.',
            'Für mich beschreibt „{own}“ das Bild besser.',
            'Ich würde trotzdem meinen Begriff wählen.',
            'Ich finde „{partner}“ auch nachvollziehbar, …',
        ],
        yield: [
            'Ja, „{partner}“ passt eigentlich gut.',
            'Okay, dann würde ich auch „{partner}“ nehmen.',
            'Ja … Dein Begriff passt für mich auch.',
            'Ja, das ergibt Sinn.',
        ],
    },
};

// Pair IDs cycle through assertiveness x label list, so both stay balanced:
//   1 assertive/list A, 2 compliant/list A, 3 assertive/list B, 4 compliant/list B, 5 assertive/list A, ...
function getCondition(pairID) {
    var i = pairID - 1;
    return {
        assertiveness: CONFIG.assertiveness_conditions[i % 2],
        label_list: Math.floor(i / 2) % 2 === 0 ? 'A' : 'B',
    };
}

// label type the confederate enters for one concept: 'good' / 'bad' (targets), 'middle' (fillers).
// List A: odd concept_nr good, even bad; list B the other way round - so every target is
// good for half of the pairs in each assertiveness condition and bad for the other half.
function getLabelGoodness(pairID, conceptNr, itemType) {
    if (itemType === 'filler') return 'middle';
    var oddGood = getCondition(pairID).label_list === 'A';
    return (conceptNr % 2 === 1) === oddGood ? 'good' : 'bad';
}
