/* Runs the actual experiment render callbacks with a deliberately small DOM and pair transport.
 * Network retries are covered separately by the PairSync tests; this checks screen behavior.
 * Run with Node, or require this file and call run() from node_repl.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXPERIMENT = path.join(__dirname, '..', 'social_effects_in_label_coining-main 2', '01_jspsych_main_social');
const HTML = fs.readFileSync(path.join(EXPERIMENT, 'main_social_basic.html'), 'utf8');
const SCRIPT = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
const CONFIG_SCRIPT = fs.readFileSync(path.join(EXPERIMENT, 'resources', 'experiment_config.js'), 'utf8');
// Follow the page's actual dependency path rather than injecting an undeclared helper.
const SIMILARITY_PATH = [...HTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
    .map(match => match[1]).find(src => /(?:^|\/)label_similarity\.js(?:\?|$)/.test(src));
const SIMILARITY_SCRIPT = SIMILARITY_PATH
    ? fs.readFileSync(path.join(EXPERIMENT, SIMILARITY_PATH.split('?')[0]), 'utf8') : '';
const ROLES = ['naive', 'confederate'];
const ROWS = [
    { concept_nr: '1', concept_id: 'organ', image: '1.jpg', item_type: 'target', good_label: 'Rohrorgel', bad_label: 'Wasserklavier', middle_label: '' },
    { concept_nr: '2', concept_id: 'lamp', image: '2.jpg', item_type: 'target', good_label: 'Blattschale', bad_label: 'Zapfenleuchte', middle_label: '' },
    { concept_nr: '17', concept_id: 'filler', image: '17.jpg', item_type: 'filler', good_label: '', bad_label: '', middle_label: 'Mittelbegriff' },
];

class Element {
    constructor(tag = 'div', attrs = {}) {
        this.tagName = tag.toUpperCase();
        this.attrs = attrs;
        this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-'))
            .map(([key, value]) => [key.slice(5), value]));
        this.disabled = Object.hasOwn(attrs, 'disabled');
        this.maxLength = attrs.maxlength === undefined ? -1 : Number(attrs.maxlength);
        this.value = '';
        this.textContent = '';
        this.events = {};
        this.children = [];
        const classes = new Set();
        this.classList = { add: name => classes.add(name), contains: name => classes.has(name) };
    }
    set innerHTML(html) {
        this.html = html;
        this.children = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)].map(match => {
            const attrs = {};
            for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s=<>]+)))?/g)) {
                attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
            }
            return new Element(match[1], attrs);
        });
    }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) {
        assert.ok(selector.startsWith('#'), 'only ID queries are needed by this test DOM');
        return this.children.find(child => child.attrs.id === selector.slice(1)) || null;
    }
    querySelectorAll(selector) {
        const match = /^button\[(data-[\w-]+)\]$/.exec(selector);
        assert.ok(match, 'unexpected query in experiment: ' + selector);
        return this.children.filter(child => child.tagName === 'BUTTON' && Object.hasOwn(child.attrs, match[1]));
    }
    addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
    dispatch(type, extra = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, ...extra };
        for (const callback of this.events[type] || []) callback(event);
    }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus() { this.focused = true; }
}

class PairBus {
    constructor() {
        this.values = { naive: new Map(), confederate: new Map() };
        this.pendingValues = { naive: new Map(), confederate: new Map() };
        this.barriers = new Map();
        this.sent = [];
        this.confirmations = [];
    }
    endpoint(role) {
        const other = role === 'naive' ? 'confederate' : 'naive';
        return {
            join() {},
            sendValue: (key, value) => {
                this.sent.push({ role, key, value });
                this.values[role].set(key, value);
                const callback = this.pendingValues[other].get(key);
                if (callback) {
                    this.pendingValues[other].delete(key);
                    callback(value);
                }
            },
            getPartnerValue: (key, callback) => {
                if (this.values[other].has(key)) callback(this.values[other].get(key));
                else this.pendingValues[role].set(key, callback);
            },
            waitForPartner: (key, callback) => {
                this.confirmations.push({ role, key });
                if (!this.barriers.has(key)) this.barriers.set(key, new Map());
                const callbacks = this.barriers.get(key);
                callbacks.set(role, callback);
                if (callbacks.size === 2) {
                    this.barriers.delete(key);
                    for (const release of callbacks.values()) release();
                }
            },
        };
    }
}

function flatten(nodes) {
    return nodes.flatMap(node => node.timeline ? [node, ...flatten(node.timeline)] : [node]);
}

function createPair({ pairID = 1, limit = 40, rows = ROWS, similarityLimit } = {}) {
    const pair = { bus: new PairBus() };
    for (const role of ROLES) {
        const view = { role, now: 1000, timeline: null };
        const sandbox = {
            URLSearchParams,
            window: { location: { search: '?role=' + role + '&pair=' + pairID + '&test=1' } },
            document: { body: new Element() },
            // Prevent automatic loading; call runExperiment below with controlled stimuli.
            fetch: () => new Promise(() => {}),
            PairSync: pair.bus.endpoint(role),
            Date: { now: () => view.now },
            performance: { now: () => view.now },
            jsPsychHtmlButtonResponse: 'html-button-response',
            jsPsychPairTrial: 'pair-trial',
            jsPsychPreload: 'preload',
            jsPsychFullscreen: 'fullscreen',
            initJsPsych: () => ({
                data: { addProperties() {}, get: () => ({ csv: () => '' }) },
                randomization: { shuffle: values => values.slice() },
                run: timeline => { view.timeline = timeline; },
            }),
        };
        view.context = vm.createContext(sandbox);
        vm.runInContext(CONFIG_SCRIPT, view.context, { filename: 'experiment_config.js' });
        vm.runInContext(SIMILARITY_SCRIPT, view.context, { filename: 'label_similarity.js' });
        view.context.CONFIG.text_input_max_length = limit;
        if (similarityLimit !== undefined) view.context.CONFIG.phase2_similarity_max_distance = similarityLimit;
        vm.runInContext(SCRIPT, view.context, { filename: 'main_social_basic.html' });
        view.context.runExperiment(rows);
        view.nodes = flatten(view.timeline);
        view.find = (phase, step, concept = 1) => {
            const node = view.nodes.find(node => node.data?.phase === phase && node.data?.step === step &&
                (concept === null || node.data.concept_nr === concept));
            assert.ok(node, [role, phase, step, concept].join('/'));
            return node;
        };
        pair[role] = view;
    }
    return pair;
}

function render(view, trial) {
    const frame = { view, trial, el: new Element(), finished: [], ticks: [] };
    trial.render(frame.el, {
        finish: data => frame.finished.push({ ...trial.data, ...data }),
        every: (ms, callback) => frame.ticks.push(callback),
    });
    frame.advance = ms => {
        view.now += ms;
        for (const callback of frame.ticks) callback();
    };
    frame.expire = () => frame.advance(120000);
    return frame;
}

function fill(frame, text, method = 'click') {
    const input = frame.el.querySelector('#label-input');
    assert.ok(input, 'input should be displayed');
    input.value = text;
    input.dispatch('input');
    if (method === 'enter') input.dispatch('keydown', { key: 'Enter' });
    else frame.el.querySelector('#label-submit').click();
}

function phase1Entries(pair, concept = 1) {
    return Object.fromEntries(ROLES.map(role => [role, render(pair[role], pair[role].find('phase1', 'label', concept))]));
}

function phase1Discussions(pair, concept = 1) {
    const entries = phase1Entries(pair, concept);
    fill(entries.naive, 'Mein Wort');
    fill(entries.confederate, 'Rohorgel');
    return Object.fromEntries(ROLES.map(role =>
        [role, render(pair[role], pair[role].find('phase1', 'discussion', concept))]));
}

function checkDiscussionCompletion(pair, frames, reasons, concept = 1) {
    const key = 'phase1_discussion_done_c' + concept;
    for (const role of ROLES) {
        const frame = frames[role];
        assert.equal(frame.finished.length, 1, 'each discussion finishes exactly once');
        assert.equal(pair.bus.confirmations.filter(event => event.role === role && event.key === key).length, 1,
            'each role signals this concept exactly once');
        assert.equal(frame.finished[0].ended_by, reasons[role]);
        assert.equal(frame.finished[0].own_label, role === 'naive' ? 'MEIN WORT' : 'ROHRORGEL');
        assert.equal(frame.finished[0].partner_label, role === 'naive' ? 'ROHRORGEL' : 'MEIN WORT');
        assert.doesNotMatch(frame.el.querySelector('#timer').textContent, /Richtzeit ist um/);
        assert.equal(frame.el.querySelector('#timer').classList.contains('over'), false);
    }
}

function prepareInput(kind, limit = 40) {
    const pair = createPair({ limit });
    let frame;
    if (kind.startsWith('phase1')) {
        const frames = phase1Entries(pair);
        frame = frames[kind.endsWith('confederate') ? 'confederate' : 'naive'];
    } else if (kind === 'phase2') {
        frame = render(pair.naive, pair.naive.find('phase2', 'attempt'));
        render(pair.confederate, pair.confederate.find('phase2', 'attempt'));
    } else {
        frame = render(pair.naive, pair.naive.find('phase3', 'label'));
    }
    return {
        pair, frame,
        accepted: () => kind === 'phase3' ? frame.finished.length : pair.bus.sent.filter(event =>
            event.role === frame.view.role && /^phase[12]_(label|term)_/.test(event.key)).length,
        value: () => kind === 'phase3' ? frame.finished[0]?.response : pair.bus.sent.find(event =>
            event.role === frame.view.role && /^phase[12]_(label|term)_/.test(event.key))?.value,
    };
}

function checkInputValidation(kind) {
    for (const method of ['click', 'enter']) {
        const exact = prepareInput(kind);
        assert.equal(exact.frame.el.querySelector('#label-input').maxLength, 40);
        assert.doesNotMatch(exact.frame.el.innerHTML, /Maximal 40 Zeichen/);
        const exactButton = exact.frame.el.querySelector('#label-submit');
        fill(exact.frame, 'x'.repeat(40), method);
        exactButton.dispatch('click');
        assert.equal(exact.accepted(), 1);
        assert.equal(exact.value(), 'X'.repeat(40));

        const oversized = prepareInput(kind);
        fill(oversized.frame, 'x'.repeat(41), method);
        assert.equal(oversized.accepted(), 0, 'programmatic overlength input cannot be sent or finished');
        assert.match(oversized.frame.el.querySelector('#label-error').textContent, /maximal 40/);
        assert.equal(oversized.frame.el.querySelector('#label-input').disabled, false);
        fill(oversized.frame, ' Äpfel, Öl & Straße! ', method);
        assert.equal(oversized.accepted(), 1);
        assert.equal(oversized.value(), 'ÄPFEL, ÖL & STRASSE!');

        const blank = prepareInput(kind);
        fill(blank.frame, ' \t\n ', method);
        blank.frame.el.querySelector('#label-submit').dispatch('click');
        assert.equal(blank.accepted(), 0);

        const expanded = prepareInput(kind);
        fill(expanded.frame, 'ß'.repeat(21), method);
        assert.equal(expanded.accepted(), 0, 'uppercase expansion must fit the limit');
        assert.match(expanded.frame.el.querySelector('#label-error').textContent, /Großschreibung/);
        fill(expanded.frame, 'ß'.repeat(20), method);
        assert.equal(expanded.accepted(), 1);
        assert.equal(expanded.value().length, 40);
    }
    const shorter = prepareInput(kind, 7);
    assert.equal(shorter.frame.el.querySelector('#label-input').maxLength, 7);
    assert.doesNotMatch(shorter.frame.el.innerHTML, /Maximal 7 Zeichen/);
    fill(shorter.frame, 'abcdefgh');
    assert.equal(shorter.accepted(), 0);
    fill(shorter.frame, 'abcdefg', 'enter');
    assert.equal(shorter.value(), 'ABCDEFG');
}

function confirmBoth(pair, frames, buttonId, key, firstRole = 'naive') {
    const secondRole = firstRole === 'naive' ? 'confederate' : 'naive';
    const first = frames[firstRole].el.querySelector(buttonId);
    const second = frames[secondRole].el.querySelector(buttonId);
    first.click();
    assert.equal(first.disabled, true);
    assert.match(first.textContent, /Warte auf die andere Person/);
    assert.equal(second.disabled, false);
    for (const role of ROLES) assert.equal(frames[role].finished.length, 0, 'one click cannot finish either browser');
    first.click();
    first.dispatch('click'); // The callback guard also protects a synthetic duplicate event.
    assert.equal(pair.bus.confirmations.filter(event => event.role === firstRole && event.key === key).length, 1);
    second.click();
    first.dispatch('click');
    second.dispatch('click');
    for (const role of ROLES) assert.equal(frames[role].finished.length, 1, 'both confirmations finish exactly once');
}

function checkPhase1(concept, expected, firstRole, pairID = 1) {
    const pair = createPair({ pairID });
    const entries = phase1Entries(pair, concept);
    const typed = concept === 1 ? 'Rohorgel' : 'Anderer Begriff';
    const secondRole = firstRole === 'naive' ? 'confederate' : 'naive';
    fill(entries[firstRole], firstRole === 'naive' ? ' Mein Wort ' : typed);
    assert.equal(entries[firstRole].finished.length, 0, 'manual entry still waits for the other role');
    assert.equal(entries[secondRole].finished.length, 0);
    fill(entries[secondRole], secondRole === 'naive' ? ' Mein Wort ' : typed);
    for (const role of ROLES) {
        const data = entries[role].finished[0];
        assert.equal(data.confederate_label, expected);
        assert.equal(data.confederate_typed_label, typed.toUpperCase());
        assert.equal(data.confederate_label_mismatch, true);
        assert.equal(data.response, role === 'naive' ? 'MEIN WORT' : typed.toUpperCase());
    }

    const discussions = Object.fromEntries(ROLES.map(role =>
        [role, render(pair[role], pair[role].find('phase1', 'discussion', concept))]));
    for (const role of ROLES) {
        assert.ok(discussions[role].el.innerHTML.includes(expected));
        assert.ok(discussions[role].el.innerHTML.includes('MEIN WORT'));
        assert.ok(!discussions[role].el.innerHTML.includes(typed.toUpperCase()));
    }
    confirmBoth(pair, discussions, '#discussion-done', 'phase1_discussion_done_c' + concept, firstRole);
    for (const role of ROLES) {
        assert.equal(discussions[role].finished[0].ended_by, 'confirmed');
        discussions[role].expire();
        assert.equal(discussions[role].finished.length, 1, 'timeout after early completion cannot finish again');
        assert.equal(pair.bus.confirmations.filter(event => event.role === role &&
            event.key === 'phase1_discussion_done_c' + concept).length, 1);
    }

    const choices = Object.fromEntries(ROLES.map(role =>
        [role, render(pair[role], pair[role].find('phase1', 'choice', concept))]));
    for (const role of ROLES) {
        assert.ok(choices[role].el.innerHTML.includes(expected));
        assert.ok(!choices[role].el.innerHTML.includes(typed.toUpperCase()));
    }
    choices.naive.el.querySelectorAll('button[data-i]')[1].click();
    assert.equal(choices.naive.finished.length, 0);
    choices.confederate.el.querySelectorAll('button[data-i]')[0].click();
    for (const role of ROLES) {
        assert.equal(choices[role].finished[0].response, expected);
        assert.equal(choices[role].finished[0].partner_choice, expected);
        const reveal = pair[role].find('phase1', 'reveal', concept).stimulus();
        assert.ok(reveal.includes(expected));
        assert.ok(!reveal.includes(typed.toUpperCase()));
    }

    const naming = render(pair.naive, pair.naive.find('phase3', 'label', concept));
    fill(naming, expected);
    assert.equal(naming.finished[0].confederate_label, expected);
    assert.equal(naming.finished[0].matches_confederate_label, true);
    assert.equal(naming.finished[0].phase1_own_label, 'MEIN WORT');
    assert.equal(naming.finished[0].phase1_own_choice, expected);

    // The typo retained in phase1 diagnostics cannot change phase2's reference or recommendation.
    const feedback = phase2Feedback(pair, concept, 'richtig', 1, firstRole, true);
    assert.equal(feedback.confederate.finished[0].recommended_feedback, 'richtig');
    assert.equal(feedback.confederate.finished[0].traffic_light, 'green');
    assert.equal(feedback.confederate.finished[0].label_edit_distance, 0,
        'traffic light must compare the assigned label, not the mistyped Phase 1 entry');
}

function phase2Container(view, concept) {
    const result = view.nodes.find(node => node.timeline?.[0]?.data?.phase === 'phase2' &&
        node.timeline[0].data.concept_nr === concept);
    assert.ok(result);
    return result;
}

function phase2Feedback(pair, concept, feedback, attempt, firstRole, useScriptedTerm = false) {
    const frames = Object.fromEntries(ROLES.map(role =>
        [role, render(pair[role], pair[role].find('phase2', 'attempt', concept))]));
    const expected = frames.naive.trial.data.confederate_label;
    const term = useScriptedTerm ? expected : 'ANDERE IDEE';
    fill(frames.naive, term);
    const feedbackButton = frames.confederate.el.querySelectorAll('button[data-fb]').find(button => button.dataset.fb === feedback);
    assert.ok(feedbackButton);
    feedbackButton.click();
    for (const role of ROLES) {
        assert.match(frames[role].el.innerHTML, feedback === 'richtig' ? /✔ Richtig/ : /✘ Falsch/);
    }
    const key = 'phase2_feedback_done_c' + concept + '_a' + attempt;
    confirmBoth(pair, frames, '#feedback-next', key, firstRole);
    for (const role of ROLES) {
        const data = frames[role].finished[0];
        assert.equal(data.attempt, attempt);
        assert.equal(data.description, term);
        assert.equal(data.feedback, feedback);
        assert.equal(data.confederate_label, expected);
        assert.equal(data.uses_confederate_label, useScriptedTerm);
        assert.equal(typeof data.rt, 'number');
        if (role === 'confederate') {
            assert.ok(['richtig', 'falsch'].includes(data.recommended_feedback));
            assert.equal(data.followed_script, data.recommended_feedback === feedback);
            assert.equal(data.label_comparison_error, null);
        } else {
            assert.equal(Object.hasOwn(data, 'recommended_feedback'), false);
            assert.equal(Object.hasOwn(data, 'followed_script'), false);
        }
    }
    return frames;
}

function phase2Response(pair, term, concept = 1, firstRole = 'confederate') {
    const secondRole = firstRole === 'naive' ? 'confederate' : 'naive';
    const frames = {};
    frames[firstRole] = render(pair[firstRole], pair[firstRole].find('phase2', 'attempt', concept));
    if (firstRole === 'naive') fill(frames.naive, term);
    frames[secondRole] = render(pair[secondRole], pair[secondRole].find('phase2', 'attempt', concept));
    if (firstRole === 'confederate') fill(frames.naive, term);
    assert.equal(pair.bus.sent.filter(event => event.key.startsWith('phase2_feedback_')).length, 0,
        'traffic guidance must never send feedback automatically');
    assert.equal(frames.naive.finished.length, 0);
    assert.equal(frames.confederate.finished.length, 0);
    const buttons = frames.confederate.el.querySelectorAll('button[data-fb]');
    assert.deepEqual(buttons.map(button => button.dataset.fb), ['richtig', 'falsch']);
    for (const button of buttons) assert.equal(button.disabled, false,
        'the confederate retains both manual choices for every traffic-light color');
    assert.equal(frames.naive.el.querySelector('#phase2-traffic-light'), null,
        'traffic guidance must not be shown on the participant screen');
    return frames;
}

function checkTrafficSignal(frames, color, recommended) {
    const signal = frames.confederate.el.querySelector('#phase2-traffic-light');
    assert.ok(signal, 'confederate response screen must contain the traffic-light cue');
    assert.equal(signal.dataset.status, color);
    assert.ok(signal.attrs.class.split(/\s+/).includes(color));
    assert.match(frames.confederate.el.innerHTML, new RegExp({ green: 'Grün', yellow: 'Gelb', red: 'Rot' }[color]),
        'color must also be identified with text');
    const buttons = frames.confederate.el.querySelectorAll('button[data-fb]');
    assert.deepEqual(buttons.filter(button => button.attrs.class.split(/\s+/).includes('recommended'))
        .map(button => button.dataset.fb), recommended === null ? [] : [recommended]);
}

function finishTrafficResponse(pair, frames, feedback, firstRole = 'naive', concept = 1) {
    const buttons = frames.confederate.el.querySelectorAll('button[data-fb]');
    buttons.find(button => button.dataset.fb === feedback).click();
    // A second click can already be queued when the first response replaces the screen.
    for (const button of buttons) button.dispatch('click');
    const sentFeedback = pair.bus.sent.filter(event => event.key === 'phase2_feedback_c' + concept + '_a1');
    assert.deepEqual(sentFeedback.map(event => event.value), [feedback], 'each attempt sends one manual decision');
    for (const role of ROLES) {
        assert.equal(frames[role].finished.length, 0, 'feedback must still wait for both Weiter confirmations');
        assert.match(frames[role].el.innerHTML, feedback === 'richtig' ? /✔ Richtig/ : /✘ Falsch/);
        assert.equal(frames[role].el.querySelector('#phase2-traffic-light'), null,
            'traffic guidance is confined to the confederate decision screen');
    }
    confirmBoth(pair, frames, '#feedback-next', 'phase2_feedback_done_c' + concept + '_a1', firstRole);
    const participant = frames.naive.finished[0];
    for (const field of ['traffic_light', 'label_match_type', 'label_edit_distance', 'label_parts_swapped',
        'recommended_feedback', 'followed_script', 'manual_feedback_override', 'label_comparison_error']) {
        assert.equal(Object.hasOwn(participant, field), false, 'confederate diagnostics must not leak into participant rows');
    }
    return frames.confederate.finished[0];
}

function run() {
    const checks = [];
    const check = (name, callback) => {
        try { callback(); checks.push(name); }
        catch (error) { error.message = name + ': ' + error.message; throw error; }
    };
    for (const kind of ['phase1_naive', 'phase1_confederate', 'phase2', 'phase3']) {
        check('shared input validation: ' + kind, () => checkInputValidation(kind));
    }
    for (const firstRole of ROLES) {
        check('assigned good label and two-click discussion, first=' + firstRole, () => checkPhase1(1, 'ROHRORGEL', firstRole));
        check('assigned bad label, first=' + firstRole, () => checkPhase1(2, 'ZAPFENLEUCHTE', firstRole));
        check('assigned filler label, first=' + firstRole, () => checkPhase1(17, 'MITTELBEGRIFF', firstRole));
    }
    check('pair-specific alternate label list remains authoritative', () => checkPhase1(1, 'WASSERKLAVIER', 'confederate', 3));
    check('label timer expiry while partner is still entering', () => {
        const pair = createPair();
        const frames = phase1Entries(pair);
        fill(frames.naive, 'Mein Wort');
        frames.naive.expire(); // The timer element has been removed by the waiting screen.
        assert.equal(frames.naive.finished.length, 0);
        fill(frames.confederate, 'Rohorgel');
        assert.equal(frames.naive.finished[0].time_exceeded, false);
    });
    check('traffic light respects assertiveness and filler reversal for exact, close and unrelated labels', () => {
        for (const pairID of [1, 2]) {
            for (const concept of [1, 17]) {
                const insists = (pairID === 1) !== (concept === 17);
                const reference = concept === 1 ? 'ROHRORGEL' : 'MITTELBEGRIFF';
                for (const [term, matchColor] of [[reference.toLowerCase(), 'green'],
                    [reference + 'XYZ', 'yellow'], ['ZZZZZZZZZZZZZZZZZZZZ', 'red']]) {
                    const pair = createPair({ pairID });
                    const frames = phase2Response(pair, term, concept);
                    const color = insists ? matchColor : 'green';
                    const recommended = color === 'yellow' ? null : color === 'green' ? 'richtig' : 'falsch';
                    checkTrafficSignal(frames, color, recommended);
                    const data = finishTrafficResponse(pair, frames, recommended || 'richtig', 'naive', concept);
                    assert.equal(data.traffic_light, color);
                    assert.equal(data.recommended_feedback, recommended);
                    if (!insists) assert.equal(data.label_match_type, 'condition_compliant');
                }
            }
        }
    });
    check('Unicode-equivalent labels keep green guidance and exact-use data consistent', () => {
        const rows = ROWS.map(row => row.concept_nr === '1' ? { ...row, good_label: 'Bürste' } : row);
        const pair = createPair({ rows });
        const frames = phase2Response(pair, 'BU\u0308RSTE');
        checkTrafficSignal(frames, 'green', 'richtig');
        const data = finishTrafficResponse(pair, frames, 'richtig');
        assert.equal(data.label_match_type, 'exact');
        assert.equal(data.label_edit_distance, 0);
        assert.equal(data.uses_confederate_label, true);
        assert.equal(frames.naive.finished[0].uses_confederate_label, true);
    });
    for (const firstRole of ROLES) {
        for (const failure of ['missing', 'throwing']) {
            check('received phase2 label remains actionable when comparison is ' + failure + ', first=' + firstRole, () => {
                const pair = createPair();
                pair.confederate.context.LabelSimilarity = failure === 'missing' ? undefined : {
                    compare() { throw new Error('comparison failed during test'); },
                };
                const term = 'ROHRORGELXYZ';
                const frames = phase2Response(pair, term, 1, firstRole);
                const signal = frames.confederate.el.querySelector('#phase2-traffic-light');
                assert.equal(signal?.dataset.status, 'unavailable');
                assert.ok(frames.confederate.el.innerHTML.includes(term),
                    'the received label must be visible even if optional comparison fails');
                assert.doesNotMatch(frames.confederate.el.innerHTML, /Warte auf den Begriff der VP/);
                assert.match(frames.confederate.el.innerHTML, /nicht verfügbar|fehlgeschlagen|manuell/i,
                    'the confederate must see that comparison is unavailable');
                assert.equal(frames.confederate.el.querySelectorAll('button[data-fb]')
                    .filter(button => button.attrs.class.split(/\s+/).includes('recommended')).length, 0);
                const data = finishTrafficResponse(pair, frames, 'richtig', firstRole);
                assert.equal(data.traffic_light, 'unavailable');
                assert.equal(data.label_match_type, 'comparison_unavailable');
                assert.equal(data.label_edit_distance, null);
                assert.equal(data.label_parts_swapped, null);
                assert.equal(data.recommended_feedback, null);
                assert.equal(data.followed_script, null);
                assert.equal(data.manual_feedback_override, null);
                assert.equal(typeof data.label_comparison_error, 'string');
                assert.ok(data.label_comparison_error.length > 0);
                for (const role of ROLES) assert.equal(frames[role].finished[0].uses_confederate_label, false);
            });
        }
        check('participant can finish phase2 without the comparison helper, first=' + firstRole, () => {
            const rows = ROWS.map(row => row.concept_nr === '1' ? { ...row, good_label: 'Bürste' } : row);
            const pair = createPair({ rows });
            pair.naive.context.LabelSimilarity = undefined;
            const frames = phase2Response(pair, 'BU\u0308RSTE', 1, firstRole);
            checkTrafficSignal(frames, 'green', 'richtig');
            finishTrafficResponse(pair, frames, 'richtig', firstRole);
            for (const role of ROLES) {
                assert.equal(frames[role].finished.length, 1);
                assert.equal(frames[role].finished[0].uses_confederate_label, true);
            }
        });
        check('yielding traffic rule survives a missing comparison helper, first=' + firstRole, () => {
            for (const [pairID, concept] of [[2, 1], [1, 17]]) {
                const pair = createPair({ pairID });
                pair.confederate.context.LabelSimilarity = undefined;
                const frames = phase2Response(pair, 'ZZZZZZZZZZZZZZZZZZZZ', concept, firstRole);
                checkTrafficSignal(frames, 'green', 'richtig');
                const data = finishTrafficResponse(pair, frames, 'richtig', firstRole, concept);
                assert.equal(data.label_match_type, 'condition_compliant');
                assert.equal(data.label_edit_distance, null);
                assert.equal(data.label_parts_swapped, null);
                assert.equal(data.recommended_feedback, 'richtig');
                assert.equal(data.followed_script, true);
                assert.equal(data.manual_feedback_override, false);
                assert.equal(typeof data.label_comparison_error, 'string');
                assert.ok(data.label_comparison_error.length > 0);
            }
        });
    }
    check('traffic yellow edit threshold includes three changes and excludes four', () => {
        for (const [suffix, color, distance] of [['XYZ', 'yellow', 3], ['WXYZ', 'red', 4]]) {
            const pair = createPair();
            assert.equal(pair.naive.context.CONFIG.phase2_similarity_max_distance, 3);
            const frames = phase2Response(pair, 'ROHRORGEL' + suffix);
            checkTrafficSignal(frames, color, color === 'yellow' ? null : 'falsch');
            const data = finishTrafficResponse(pair, frames, 'falsch');
            assert.equal(data.label_edit_distance, distance);
            assert.equal(data.label_match_type, color === 'yellow' ? 'edit_distance' : 'different');
        }
        const strictPair = createPair({ similarityLimit: 1 });
        checkTrafficSignal(phase2Response(strictPair, 'ROHRORGELXY'), 'red', 'falsch');
    });
    check('reversed compound parts including linking n produce yellow guidance', () => {
        const rows = ROWS.map(row => row.concept_nr === '1' ? { ...row, good_label: 'CDpfanne' } : row);
        for (const term of ['PFANNECD', 'PFANNENCD']) {
            const pair = createPair({ rows });
            const frames = phase2Response(pair, term);
            checkTrafficSignal(frames, 'yellow', null);
            const data = finishTrafficResponse(pair, frames, 'richtig');
            assert.equal(data.label_match_type, 'swapped_parts');
            assert.equal(data.label_parts_swapped, true);
            assert.equal(data.uses_confederate_label, false, 'a possible compound swap remains a nonexact match');
        }
    });
    for (const firstRole of ROLES) {
        for (const feedback of ['richtig', 'falsch']) {
            check('yellow remains a manual choice with both confirmations, first=' + firstRole + ', feedback=' + feedback, () => {
                const pair = createPair();
                const frames = phase2Response(pair, 'ROHRORGELXYZ', 1, firstRole);
                checkTrafficSignal(frames, 'yellow', null);
                const data = finishTrafficResponse(pair, frames, feedback, firstRole);
                assert.equal(data.traffic_light, 'yellow');
                assert.equal(data.recommended_feedback, null);
                assert.equal(data.followed_script, null);
                assert.equal(data.manual_feedback_override, null);
                assert.equal(phase2Container(pair.naive, 1).loop_function(), feedback === 'falsch');
            });
        }
        check('red can be manually approved and records the override, first=' + firstRole, () => {
            const pair = createPair();
            const frames = phase2Response(pair, 'ZZZZZZZZZZZZZZZZZZZZ', 1, firstRole);
            checkTrafficSignal(frames, 'red', 'falsch');
            const data = finishTrafficResponse(pair, frames, 'richtig', firstRole);
            assert.equal(data.traffic_light, 'red');
            assert.equal(data.followed_script, false);
            assert.equal(data.manual_feedback_override, true);
            assert.equal(data.feedback, 'richtig');
            assert.equal(phase2Container(pair.naive, 1).loop_function(), false);
        });
    }
    check('phase1 confirmations are fresh for each concept', () => {
        const pair = createPair();
        for (const concept of [1, 2]) {
            const frames = phase1Discussions(pair, concept);
            frames.naive.expire();
            for (const role of ROLES) assert.equal(frames[role].finished.length, 0,
                'the previous concept cannot replace this concept\'s partner signal');
            frames.confederate.expire();
            for (const role of ROLES) {
                assert.equal(frames[role].finished.length, 1);
                assert.equal(frames[role].finished[0].ended_by, 'timeout');
            }
        }
        const keys = new Set(pair.bus.confirmations.map(event => event.key));
        assert.ok(keys.has('phase1_discussion_done_c1'));
        assert.ok(keys.has('phase1_discussion_done_c2'));
    });
    for (const firstRole of ROLES) {
        const secondRole = firstRole === 'naive' ? 'confederate' : 'naive';
        check('discussion deadlines advance without clicks despite offset starts, first=' + firstRole, () => {
            const pair = createPair();
            const entries = phase1Entries(pair);
            fill(entries.naive, 'Mein Wort');
            fill(entries.confederate, 'Rohorgel');
            const duration = pair[firstRole].context.CONFIG.timing.phase1_discussion_ms;
            const frames = {};
            frames[firstRole] = render(pair[firstRole], pair[firstRole].find('phase1', 'discussion'));
            pair[secondRole].now += 400;
            frames[secondRole] = render(pair[secondRole], pair[secondRole].find('phase1', 'discussion'));
            frames[firstRole].advance(duration - 1);
            frames[secondRole].advance(duration - 401);
            assert.equal(pair.bus.confirmations.filter(event => event.key === 'phase1_discussion_done_c1').length, 0,
                'completion must wait for the configured deadline');
            frames[firstRole].advance(1);
            frames[secondRole].advance(1);
            for (const role of ROLES) assert.equal(frames[role].finished.length, 0,
                'the earlier deadline waits for the later browser');
            assert.equal(frames[firstRole].el.querySelector('#discussion-done').disabled, true);
            assert.equal(frames[secondRole].el.querySelector('#discussion-done').disabled, false);
            frames[secondRole].advance(400);
            for (const role of ROLES) {
                frames[role].expire();
                frames[role].el.querySelector('#discussion-done').dispatch('click');
            }
            checkDiscussionCompletion(pair, frames, { naive: 'timeout', confederate: 'timeout' });
        });
        check('one early discussion click plus partner timeout, first=' + firstRole, () => {
            const pair = createPair();
            const frames = phase1Discussions(pair);
            frames[firstRole].el.querySelector('#discussion-done').click();
            frames[firstRole].expire();
            for (const role of ROLES) assert.equal(frames[role].finished.length, 0);
            frames[secondRole].expire();
            checkDiscussionCompletion(pair, frames, { [firstRole]: 'confirmed', [secondRole]: 'timeout' });
        });
        for (const firstTrigger of ['click', 'timeout']) {
            check('discussion click/timeout race, first=' + firstRole + ', trigger=' + firstTrigger, () => {
                const pair = createPair();
                const frames = phase1Discussions(pair);
                const reasons = {};
                for (const [index, role] of [firstRole, secondRole].entries()) {
                    const clickFirst = (firstTrigger === 'click') === (index === 0);
                    const button = frames[role].el.querySelector('#discussion-done');
                    reasons[role] = clickFirst ? 'confirmed' : 'timeout';
                    if (clickFirst) button.dispatch('click');
                    frames[role].expire();
                    button.dispatch('click'); // Include queued events despite the now-disabled button.
                    frames[role].expire();
                    if (index === 0) {
                        for (const other of ROLES) assert.equal(frames[other].finished.length, 0);
                    }
                }
                checkDiscussionCompletion(pair, frames, reasons);
            });
        }
    }
    for (const firstRole of ROLES) {
        check('phase2 task waits for both instruction confirmations, first=' + firstRole, () => {
            const pair = createPair();
            const secondRole = firstRole === 'naive' ? 'confederate' : 'naive';
            const steps = {};
            for (const role of ROLES) {
                const view = pair[role];
                const index = view.timeline.findIndex(node =>
                    node.data?.phase === 'instructions' && node.data?.step === 'phase2');
                assert.ok(index >= 0, 'Phase 2 instructions must be on the real timeline');
                assert.equal(view.timeline[index].type, 'html-button-response');
                assert.deepEqual(Array.from(view.timeline[index].choices), ['Weiter']);
                const gate = view.find('phase2', 'instructions_ready', null);
                assert.equal(view.timeline[index + 1], gate,
                    'clicking Weiter must enter the shared readiness gate');
                assert.equal(gate.type, 'pair-trial');
                const task = view.timeline[index + 2]?.timeline?.[0];
                assert.equal(task?.data?.phase, 'phase2');
                assert.equal(task?.data?.step, 'attempt',
                    'the first task must follow the gate');
                steps[role] = { gate, task };
            }
            assert.equal(pair.bus.confirmations.length, 0,
                'reading instructions alone cannot mark a role ready');
            // The standard button trial enters its next timeline node only after Weiter.
            const first = render(pair[firstRole], steps[firstRole].gate);
            assert.equal(first.finished.length, 0,
                'the first reader must wait while the partner remains on instructions');
            assert.match(first.el.innerHTML, /Warte/);
            assert.equal(first.el.querySelector('#label-input'), null);
            assert.equal(pair.bus.sent.length, 0, 'the task has not sent any response');
            assert.deepEqual(pair.bus.confirmations, [{ role: firstRole, key: 'phase2_instructions_done' }]);
            const second = render(pair[secondRole], steps[secondRole].gate);
            for (const frame of [first, second]) {
                assert.equal(frame.finished.length, 1, 'both readers are released exactly once');
                frame.expire();
                assert.equal(frame.finished.length, 1);
            }
            for (const role of ROLES) {
                assert.equal(pair.bus.confirmations.filter(event =>
                    event.role === role && event.key === 'phase2_instructions_done').length, 1);
            }
            const taskFrames = Object.fromEntries(ROLES.map(role =>
                [role, render(pair[role], steps[role].task)]));
            assert.ok(taskFrames.naive.el.querySelector('#label-input'),
                'the participant task becomes available after both readers are ready');
            assert.match(taskFrames.confederate.el.innerHTML, /Warte auf den Begriff der VP/);
        });
        check('phase2 richtig requires both confirmations, first=' + firstRole, () => {
            const pair = createPair();
            phase2Feedback(pair, 1, 'richtig', 1, firstRole, true);
            for (const role of ROLES) assert.equal(phase2Container(pair[role], 1).loop_function(), false);
        });
        check('phase2 retries/final attempt and next image use distinct barriers, first=' + firstRole, () => {
            const pair = createPair();
            for (let attempt = 1; attempt <= 3; attempt++) {
                phase2Feedback(pair, 1, 'falsch', attempt, firstRole);
                for (const role of ROLES) assert.equal(phase2Container(pair[role], 1).loop_function(), attempt < 3);
            }
            phase2Feedback(pair, 2, 'richtig', 1, firstRole, true);
            const keys = new Set(pair.bus.confirmations.filter(event => event.key.startsWith('phase2_feedback_done_')).map(event => event.key));
            assert.equal(keys.size, 4);
        });
    }
    check('last phase2 feedback remains gated before phase end', () => {
        const pair = createPair();
        const attempts = pair.naive.nodes.filter(node => node.data?.phase === 'phase2' && node.data?.step === 'attempt');
        phase2Feedback(pair, attempts.at(-1).data.concept_nr, 'richtig', 1, 'confederate', true);
        assert.equal(pair.bus.confirmations.some(event => event.key === 'phase2_end'), false);
    });
    return { passed: checks.length, checks };
}

module.exports = { run };
if (require.main === module) console.log(run());
