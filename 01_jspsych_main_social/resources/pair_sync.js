/* ------------------------------------------------------------------------------------------------
   PAIR SYNCHRONISATION (communication layer) - TO BE IMPLEMENTED
   The only file in the browser that talks to sync/sync.php. The experiment (main_social.html)
   must use these functions and never call the server for pair data directly.

   Architecture:  browser A (jsPsych)  <->  sync/sync.php (+ one JSON file per pair)  <->  browser B
   - A browser WRITES a value with sendValue(); sync.php stores it in sync/state/pair_<ID>.json.
   - The other browser READS it by polling (asking sync.php every CONFIG.timing.sync_poll_interval_ms).
   - waitForPartner() = both browsers write "I reached step X" and wait until the other one has too.
   See README.md for why polling over PHP is used instead of WebSockets or Firebase.
   ------------------------------------------------------------------------------------------------ */

var PairSync = {

    // set once at the start of the experiment
    pairID: null,
    role: null,        // 'naive' or 'confederate'
    syncURL: 'sync/sync.php',

    // TODO: register this browser for the pair, e.g. PairSync.join(12, 'naive')
    join: function (pairID, role) {
        this.pairID = pairID;
        this.role = role;
    },

    // TODO: store a value for this participant under a key, e.g. sendValue('phase1_label_c3', 'Kreuzhahn').
    // Should also store a server timestamp.
    sendValue: function (key, value) {
        throw new Error('PairSync.sendValue is not implemented yet');
    },

    // TODO: wait until the PARTNER has stored a value under this key, then call callback(value).
    getPartnerValue: function (key, callback) {
        throw new Error('PairSync.getPartnerValue is not implemented yet');
    },

    // TODO: barrier - mark this browser as having reached `step` and call callback() once the
    // partner has reached it too. Used between every step where both must be finished.
    waitForPartner: function (step, callback) {
        throw new Error('PairSync.waitForPartner is not implemented yet');
    },
};
