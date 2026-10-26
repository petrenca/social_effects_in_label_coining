/* ------------------------------------------------------------------------------------------------
   PAIR SYNCHRONISATION (communication layer)
   The only file in the browser that talks to sync/sync.php. The experiment (main_social*.html)
   must use these functions and never call the server for pair data directly.

   Architecture:  browser A (jsPsych)  <->  sync/sync.php (+ one JSON file per pair)  <->  browser B
   - A browser WRITES a value with sendValue(); sync.php stores it in sync/state/pair_<ID>.json.
   - The other browser READS it by polling (asking sync.php every CONFIG.timing.sync_poll_interval_ms).
   - waitForPartner() = both browsers write "I reached step X" and wait until the other one has too.
   - connect() = handshake at the start of a session. Each browser first deletes its own old
     values for this pair (e.g. from a test run with the same pair ID), then both exchange a fresh
     random token, so values left over from an earlier run can never be mistaken for new ones.
   Network errors are retried until the server answers again; while the server cannot be reached
   a red note is shown in the bottom right corner.
   See README.md for why polling over PHP is used instead of WebSockets or Firebase.
   ------------------------------------------------------------------------------------------------ */

var PairSync = {

    // set once at the start of the experiment
    pairID: null,
    role: null,        // 'naive' or 'confederate'
    test: false,       // true: sync.php uses sync/state_test/ instead of sync/state/
    syncURL: 'sync/sync.php',

    join: function (pairID, role, test) {
        this.pairID = pairID;
        this.role = role;
        this.test = !!test;
    },

    partnerRole: function () {
        return this.role === 'naive' ? 'confederate' : 'naive';
    },

    // Handshake: call once before the first sendValue/getPartnerValue; callback() runs as soon as
    // both browsers are connected to the same pair.
    connect: function (callback) {
        var self = this;
        var token = Date.now().toString(36) + Math.random().toString(36).slice(2);
        var lastAcked = null;
        self._post({ action: 'join', value: JSON.stringify(token) }, function () {
            (function poll() {
                self._post({ action: 'get' }, function (state) {
                    var partner = state[self.partnerRole()] || {};
                    var proceed = function () {
                        if (partner.ack && partner.ack.value === token) callback();
                        else setTimeout(poll, self._pollMs());
                    };
                    // acknowledge the partner's current token, then check whether they acknowledged ours
                    if (partner.joined && partner.joined.value !== lastAcked) {
                        lastAcked = partner.joined.value;
                        self._post({ action: 'set', key: 'ack', value: JSON.stringify(lastAcked) }, proceed);
                    } else {
                        proceed();
                    }
                });
            })();
        });
    },

    // Store a value for this participant under a key, e.g. sendValue('phase1_label_c3', 'Kreuzhahn').
    // sync.php adds a server timestamp. callback (optional) runs once the server has stored it.
    sendValue: function (key, value, callback) {
        this._post({ action: 'set', key: key, value: JSON.stringify(value) }, function () {
            if (callback) callback();
        });
    },

    // Wait until the PARTNER has stored a value under this key, then call callback(value).
    // Returns a function that stops waiting (the callback is then never called).
    getPartnerValue: function (key, callback) {
        var self = this;
        var cancelled = false;
        (function poll() {
            if (cancelled) return;
            self._post({ action: 'get' }, function (state) {
                if (cancelled) return;
                var partner = state[self.partnerRole()] || {};
                if (partner.hasOwnProperty(key)) callback(partner[key].value);
                else setTimeout(poll, self._pollMs());
            });
        })();
        return function () { cancelled = true; };
    },

    // Barrier: mark this browser as having reached `step` and call callback() once the
    // partner has reached it too.
    waitForPartner: function (step, callback) {
        var self = this;
        self.sendValue('step_' + step, true, function () {
            self.getPartnerValue('step_' + step, function () { callback(); });
        });
    },

    //---------------------------------------------------------------------------- internals
    _pollMs: function () {
        return (typeof CONFIG !== 'undefined' && CONFIG.timing && CONFIG.timing.sync_poll_interval_ms) || 500;
    },

    // POST to sync.php; retries until the server answers, then calls onSuccess(json)
    _post: function (params, onSuccess) {
        var self = this;
        var body = new URLSearchParams(Object.assign({
            pair: self.pairID,
            role: self.role,
            test: self.test ? '1' : '0',
        }, params));
        fetch(self.syncURL, { method: 'POST', body: body, cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (json) {
                self._setOffline(false);
                onSuccess(json);
            })
            .catch(function (err) {
                console.warn('PairSync: ' + params.action + ' failed, retrying', err);
                self._setOffline(true);
                setTimeout(function () { self._post(params, onSuccess); }, self._pollMs());
            });
    },

    _setOffline: function (offline) {
        var el = document.getElementById('pair-sync-status');
        if (!el && offline) {
            el = document.createElement('div');
            el.id = 'pair-sync-status';
            el.style.cssText = 'position:fixed;right:8px;bottom:8px;padding:4px 8px;font-size:13px;' +
                'background:#c62828;color:#fff;border-radius:4px;z-index:9999;';
            el.textContent = 'Keine Verbindung zum Server – versuche erneut …';
            document.body.appendChild(el);
        }
        if (el) el.style.display = offline ? 'block' : 'none';
    },
};
