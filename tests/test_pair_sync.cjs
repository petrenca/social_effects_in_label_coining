/* Run with: node tests/test_pair_sync.cjs
   Two isolated browser contexts share a fake server and clock. No network or npm packages. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,
    '../social_effects_in_label_coining-main 2/01_jspsych_main_social/resources/pair_sync.js'), 'utf8');

function pairHarness() {
    const state = {};
    const timers = [];
    const requests = [];
    let fail = () => null;
    const clients = {};
    for (const role of ['naive', 'confederate']) {
        const context = {
            URLSearchParams,
            CONFIG: { timing: { sync_poll_interval_ms: 1 } },
            console: { warn() {} },
            setTimeout(fn) { timers.push(fn); },
            fetch(url, options) {
                const params = Object.fromEntries(options.body.entries());
                requests.push(params);
                const failure = fail(params);
                if (failure === 'network') return Promise.reject(new Error('offline'));
                if (failure === 'http') return Promise.resolve({ ok: false, status: 503 });
                if (failure === 'json') {
                    return Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad JSON')) });
                }
                if (params.action === 'set') {
                    (state[role] ||= {})[params.key] = { value: JSON.parse(params.value), t: 1 };
                }
                if (failure === 'lost-response') return Promise.reject(new Error('response lost'));
                const snapshot = JSON.parse(JSON.stringify(state));
                return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
            },
        };
        vm.createContext(context);
        vm.runInContext(source, context);
        context.PairSync.join(123, role, true);
        context.PairSync._setOffline = () => {};
        clients[role] = context.PairSync;
    }
    async function flush() {
        for (let i = 0; i < 12; i++) await Promise.resolve();
    }
    return {
        ...clients,
        state,
        requests,
        setFailure(fn) { fail = fn; },
        flush,
        async advance(rounds = 1) {
            await flush();
            for (let i = 0; i < rounds; i++) {
                const due = timers.splice(0);
                due.forEach(fn => fn());
                await flush();
            }
        },
    };
}

async function run() {
    let tests = 0;
    for (const first of ['naive', 'confederate']) {
        for (const step of ['phase1_discussion_done_c1', 'phase2_feedback_done_1_1']) {
            const h = pairHarness();
            const second = first === 'naive' ? 'confederate' : 'naive';
            const count = { naive: 0, confederate: 0 };
            h[first].waitForPartner(step, () => count[first]++);
            await h.advance(3);
            assert.deepEqual(count, { naive: 0, confederate: 0 }, `${first} alone cannot release ${step}`);
            h[second].waitForPartner(step, () => count[second]++);
            await h.advance(3);
            assert.deepEqual(count, { naive: 1, confederate: 1 });
            await h.advance(5);
            assert.deepEqual(count, { naive: 1, confederate: 1 }, 'each callback runs once');
            tests++;
        }
    }

    {
        const h = pairHarness();
        let a = 0, b = 0;
        h.naive.waitForPartner('phase2_feedback_done_3_2', () => a++);
        h.confederate.waitForPartner('phase2_feedback_done_3_2', () => b++);
        await h.advance(5);
        assert.deepEqual([a, b], [1, 1], 'simultaneous confirmations complete once');
        tests++;
    }

    {
        const h = pairHarness();
        let first = 0, attempt = 0, image = 0;
        h.naive.waitForPartner('phase2_feedback_done_1_1', () => first++);
        h.confederate.waitForPartner('phase2_feedback_done_1_1', () => first++);
        await h.advance(2);
        assert.equal(first, 2);
        h.naive.waitForPartner('phase2_feedback_done_1_2', () => attempt++);
        h.confederate.waitForPartner('phase2_feedback_done_2_1', () => image++);
        await h.advance(3);
        assert.deepEqual([attempt, image], [0, 0], 'old/different attempts and images cannot release new screens');
        h.confederate.waitForPartner('phase2_feedback_done_1_2', () => attempt++);
        h.naive.waitForPartner('phase2_feedback_done_2_1', () => image++);
        await h.advance(3);
        assert.deepEqual([attempt, image], [2, 2]);
        tests++;
    }

    for (const failure of ['network', 'http', 'json']) {
        const h = pairHarness();
        let a = 0, b = 0;
        h.setFailure(p => p.role === 'naive' && p.action === 'set' ? failure : null);
        h.naive.waitForPartner('phase1_discussion_done_c4', () => a++);
        h.confederate.waitForPartner('phase1_discussion_done_c4', () => b++);
        await h.advance(3);
        assert.deepEqual([a, b], [0, 0], `${failure}: no release before both writes reach server`);
        assert.equal(h.state.naive, undefined);
        h.setFailure(() => null);
        await h.advance(4);
        assert.deepEqual([a, b], [1, 1], `${failure}: failed confirmation retries after recovery`);
        tests++;
    }

    {
        const h = pairHarness();
        let a = 0, b = 0;
        let loseResponse = true;
        h.setFailure(p => p.role === 'naive' && p.action === 'set' && loseResponse ? 'lost-response' : null);
        h.naive.waitForPartner('phase2_feedback_done_20_3', () => a++);
        h.confederate.waitForPartner('phase2_feedback_done_20_3', () => b++);
        await h.advance(3);
        assert.equal(a, 0, 'local browser waits for acknowledgement even if its write reached server');
        assert.equal(b, 1, 'partner can release once both confirmations are stored');
        loseResponse = false;
        await h.advance(5);
        assert.deepEqual([a, b], [1, 1], 'retries of a stored confirmation remain idempotent');
        tests++;
    }

    {
        const h = pairHarness();
        let a = 0, b = 0;
        h.setFailure(p => p.role === 'naive' && p.action === 'get' ? 'network' : null);
        h.naive.waitForPartner('phase2_feedback_done_5_1', () => a++);
        h.confederate.waitForPartner('phase2_feedback_done_5_1', () => b++);
        await h.advance(3);
        assert.deepEqual([a, b], [0, 1], 'failed reads do not release the offline browser');
        h.setFailure(() => null);
        await h.advance(3);
        assert.deepEqual([a, b], [1, 1]);
        tests++;
    }

    {
        const h = pairHarness();
        let count = 0;
        h.setFailure(p => p.role === 'naive' && p.action === 'set' ? 'network' : null);
        const cancel = h.naive.waitForPartner('cancelled', () => count++);
        cancel();
        h.confederate.waitForPartner('cancelled', () => {});
        h.setFailure(() => null);
        await h.advance(5);
        assert.equal(count, 0, 'cancellation during an unacknowledged write suppresses callback');
        tests++;
    }
    console.log(`PairSync: ${tests} paired barrier scenarios passed.`);
}

module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
