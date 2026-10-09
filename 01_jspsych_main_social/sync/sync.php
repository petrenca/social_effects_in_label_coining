<?php
// ------------------------------------------------------------------------------------------------
// SHARED PAIR STORE - TO BE IMPLEMENTED
// Server side of resources/pair_sync.js. Keeps one JSON file per pair in sync/state/
// (sync/state_test/ for test runs), e.g. sync/state/pair_12.json:
//   { "naive":       { "phase1_label_c1": {"value": "Kreuzhahn", "t": 1760000000123}, ... },
//     "confederate": { "phase1_label_c1": {"value": "Ventil",    "t": 1760000000456}, ... } }
//
// TODO: implement two actions, chosen by $_POST['action']:
//   'set' - pair, role, key, value: store the value under this role, with the server time
//   'get' - pair: return the whole JSON file, so a browser can read its partner's values
// Requirements:
//   - use flock() when reading/writing the file: both browsers may write at the same moment
//   - only accept numeric pair IDs and the roles 'naive'/'confederate' (the values become filenames)
//   - the folders sync/state and sync/state_test must be writable by the server, like data/
// ------------------------------------------------------------------------------------------------
?>
