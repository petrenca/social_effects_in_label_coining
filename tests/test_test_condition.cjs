/* Run: node tests/test_test_condition.cjs
 * macOS alternative: jsc tests/test_test_condition.cjs -- /absolute/path/to/01_jspsych_main_social
 * Uses actual page code with a small form/transport substitute; no external packages.
 */
var conditionReadText = typeof require === 'function'
    ? function (path) { return require('node:fs').readFileSync(path, 'utf8'); }
    : function (path) { return readFile(path); };
var conditionExperimentDir = typeof require === 'function'
    ? require('node:path').resolve(__dirname, '../social_effects_in_label_coining-main 2/01_jspsych_main_social')
    : arguments[0];
var conditionPage = conditionReadText(conditionExperimentDir + '/main_social_basic.html', 'utf8');
var conditionConfig = conditionReadText(conditionExperimentDir + '/resources/experiment_config.js', 'utf8');
var conditionInline = Array.from(conditionPage.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), m => m[1]).join('\n');

function conditionAssert(value, message) {
    if (!value) throw new Error(message);
}
function conditionEqual(actual, expected, message) {
    conditionAssert(JSON.stringify(actual) === JSON.stringify(expected),
        (message || 'Values differ') + ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected));
}
class ConditionSearchParams {
    constructor(search) {
        this.values = new Map(String(search).replace(/^\?/, '').split('&').map(part => {
            var pieces = part.split('=');
            return [decodeURIComponent(pieces[0]), decodeURIComponent(pieces.slice(1).join('='))];
        }));
    }
    get(name) { return this.values.has(name) ? this.values.get(name) : null; }
}
function conditionControl(value) {
    return { value: value || '', checked: false, disabled: false, listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        change() { if (this.listeners.change) this.listeners.change(); } };
}
class ConditionBus {
    constructor() {
        this.values = { naive: {}, confederate: {} };
        this.reads = { naive: {}, confederate: {} };
        this.connections = new Map();
        this.barriers = new Map();
        this.writes = [];
        this.held = [];
        this.holdWrites = false;
    }
    endpoint(role) {
        var bus = this, other = role === 'naive' ? 'confederate' : 'naive';
        return {
            join() {},
            connect(callback) {
                bus.connections.set(role, callback);
                if (bus.connections.size === 2) {
                    bus.values = { naive: {}, confederate: {} }; // fresh handshake clears old values
                    Array.from(bus.connections.values()).forEach(fn => fn());
                }
            },
            sendValue(key, value, callback) {
                var store = function () {
                    bus.writes.push({ role: role, key: key, value: value });
                    bus.values[role][key] = value;
                    if (bus.reads[other][key]) {
                        var receive = bus.reads[other][key];
                        delete bus.reads[other][key];
                        receive(value);
                    }
                    if (callback) callback();
                };
                if (bus.holdWrites) bus.held.push(store);
                else store();
            },
            getPartnerValue(key, callback) {
                if (Object.prototype.hasOwnProperty.call(bus.values[other], key)) callback(bus.values[other][key]);
                else bus.reads[role][key] = callback;
            },
            waitForPartner(key, callback) {
                if (!bus.barriers.has(key)) bus.barriers.set(key, new Map());
                var waiting = bus.barriers.get(key);
                waiting.set(role, callback);
                if (waiting.size === 2) {
                    bus.barriers.delete(key);
                    Array.from(waiting.values()).forEach(fn => fn());
                }
            },
        };
    }
    releaseWrites() {
        this.holdWrites = false;
        this.held.splice(0).forEach(fn => fn());
    }
}
function conditionHarness(search, bus) {
    var form = {
        role: conditionControl('naive'), pair: conditionControl('1'), n: conditionControl(''),
        test: conditionControl('1'), test_condition: conditionControl(''), listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        submit() { this.listeners.submit({ target: this, preventDefault() {} }); },
    };
    var row = { hidden: true };
    var document = { body: { innerHTML: '' }, getElementById(id) { return id === 'launcher' ? form : row; } };
    var view = { form: form, row: row, document: document, props: {}, rows: [{ phase: 'setup' }], fetches: 0 };
    var role = new ConditionSearchParams(search).get('role');
    view.sync = (bus || new ConditionBus()).endpoint(role);
    var jsPsych = {
        data: { addProperties(properties) {
            Object.assign(view.props, properties);
            view.rows.forEach(existing => Object.assign(existing, properties));
        } },
        randomization: { shuffle: array => array.slice() },
        run(timeline) { view.timeline = timeline; },
    };
    view.window = { location: { search: search } };
    var factory = new Function('window', 'document', 'fetch', 'URLSearchParams', 'initJsPsych', 'PairSync',
        'jsPsychHtmlButtonResponse', 'jsPsychPairTrial', 'jsPsychPreload', 'jsPsychFullscreen',
        conditionConfig + '\n' + conditionInline + '\nreturn { runExperiment: runExperiment, override: TEST_ASSERTIVENESS };');
    view.page = factory(view.window, document, function () {
        view.fetches++;
        return { then() { return this; }, catch() { return this; } };
    }, ConditionSearchParams, () => jsPsych, view.sync, 'button', 'pair', 'preload', 'fullscreen');
    view.build = function () {
        view.page.runExperiment([
            { concept_nr: '1', concept_id: 'one', image: '1.jpg', item_type: 'target', good_label: 'GOOD', bad_label: 'BAD' },
            { concept_nr: '17', concept_id: 'filler', image: '17.jpg', item_type: 'filler', middle_label: 'MIDDLE' },
        ]);
    };
    view.connect = function () {
        view.finished = 0;
        var trial = view.timeline.find(node => node.data && node.data.step === 'connect');
        trial.render({ innerHTML: '' }, { finish() { view.finished++; } });
    };
    return view;
}
function conditionRun() {
    var passed = 0;
    function check(name, callback) {
        try { callback(); passed++; }
        catch (error) { throw new Error(name + ': ' + error.message); }
    }
    check('selector follows both role and test mode; stale selections never enter real/naive URLs', function () {
        var h = conditionHarness('');
        conditionEqual(h.row.hidden, true);
        conditionEqual(h.form.test_condition.disabled, true);
        conditionAssert(h.document.body.innerHTML.includes('Compliant') && h.document.body.innerHTML.includes('Assertive'), 'both choices exist');
        h.form.role.value = 'confederate'; h.form.role.change();
        conditionEqual(h.row.hidden, true);
        h.form.test.checked = true; h.form.test.change();
        conditionEqual(h.row.hidden, false);
        conditionEqual(h.form.test_condition.disabled, false);
        h.form.test_condition.value = 'compliant'; h.form.submit();
        conditionAssert(h.window.location.search.includes('&test_condition=compliant'), 'test URL keeps choice');
        h.form.role.value = 'naive'; h.form.role.change(); h.form.submit();
        conditionEqual(h.row.hidden, true);
        conditionEqual(h.form.test_condition.disabled, true);
        conditionAssert(!h.window.location.search.includes('test_condition='), 'naive URL ignores choice');
        h.form.role.value = 'confederate'; h.form.role.change();
        h.form.test.checked = false; h.form.test.change(); h.form.submit();
        conditionEqual(h.row.hidden, true);
        conditionAssert(!h.window.location.search.includes('test_condition='), 'regular URL ignores choice');
    });
    check('launcher restores test-only query settings and preserves the picture count', function () {
        var h = conditionHarness('?role=confederate&test=1&test_condition=assertive');
        conditionEqual(h.row.hidden, false);
        conditionEqual(h.form.test_condition.value, 'assertive');
        h.form.pair.value = '42'; h.form.n.value = '3'; h.form.submit();
        conditionEqual(h.window.location.search, '?role=confederate&pair=42&test=1&n=3&test_condition=assertive');
    });
    check('invalid/naive/regular URL overrides are rejected', function () {
        for (var query of ['?role=confederate&pair=1&test_condition=compliant',
            '?role=naive&pair=1&test=1&test_condition=compliant', '?role=confederate&pair=1&test=1&test_condition=invalid']) {
            var h = conditionHarness(query); h.build();
            conditionEqual(h.page.override, null);
            conditionEqual(h.props.assertiveness, 'assertive');
        }
    });
    for (var choice of ['compliant', 'assertive', '']) {
        for (var first of ['naive', 'confederate']) {
            check('paired test condition: ' + (choice || 'automatic') + ', first=' + first, function () {
                var bus = new ConditionBus();
                bus.values.confederate.test_condition = { assertiveness: 'stale' };
                var pairID = choice === 'assertive' ? 2 : 1;
                var assigned = pairID % 2 === 1 ? 'assertive' : 'compliant';
                var expected = choice || assigned;
                var views = {
                    naive: conditionHarness('?role=naive&pair=' + pairID + '&test=1&test_condition=assertive', bus),
                    confederate: conditionHarness('?role=confederate&pair=' + pairID + '&test=1' + (choice ? '&test_condition=' + choice : ''), bus),
                };
                views.naive.build(); views.confederate.build();
                bus.holdWrites = true;
                views[first].connect();
                views[first === 'naive' ? 'confederate' : 'naive'].connect();
                conditionEqual([views.naive.finished, views.confederate.finished], [0, 0], 'unacknowledged condition must wait');
                bus.releaseWrites();
                conditionEqual([views.naive.finished, views.confederate.finished], [1, 1]);
                for (var role of ['naive', 'confederate']) {
                    conditionEqual(views[role].props.assertiveness, expected);
                    conditionEqual(views[role].props.assigned_assertiveness, assigned);
                    conditionEqual(views[role].props.test_condition_override, Boolean(choice));
                    conditionEqual(views[role].rows[0].assertiveness, expected, 'existing setup rows are updated too');
                    conditionEqual(views[role].props.label_list, 'A', 'label list is independent of test choice');
                }
                for (var isFiller of [false, true]) {
                    var concept = isFiller ? 17 : 1;
                    var container = views.confederate.timeline.find(node => node.timeline && node.timeline[0].data.phase === 'phase2' && node.timeline[0].data.concept_nr === concept);
                    var el = { innerHTML: '', querySelectorAll() { return []; } };
                    container.timeline[0].render(el, {});
                    views.naive.sync.sendValue('phase2_term_c' + concept + '_a1', 'UNRELATED LABEL');
                    var insists = (expected === 'assertive') !== isFiller;
                    conditionAssert(el.innerHTML.includes('Empfohlen: <b>' + (insists ? 'falsch' : 'richtig') + '</b>'), 'strategy must use shared condition and filler reversal');
                }
            });
        }
    }
    check('regular connections retain automatic assignment and do not exchange test settings', function () {
        var bus = new ConditionBus();
        var naive = conditionHarness('?role=naive&pair=2', bus);
        var conf = conditionHarness('?role=confederate&pair=2&test_condition=assertive', bus);
        naive.build(); conf.build(); naive.connect(); conf.connect();
        conditionEqual([naive.finished, conf.finished], [1, 1]);
        conditionEqual([naive.props.assertiveness, conf.props.assertiveness], ['compliant', 'compliant']);
        conditionEqual(bus.writes.length, 0);
    });
    return { passed: passed };
}
if (typeof module !== 'undefined') {
    module.exports = { run: conditionRun };
    if (require.main === module) console.log(conditionRun());
} else print(JSON.stringify(conditionRun()));
