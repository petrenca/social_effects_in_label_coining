'use strict';

// Run with `node tests/test_trial_order.cjs`, or require this module and call run().
// These checks build the real page's timelines without rendering trials or making requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const experimentDir = path.resolve(
    __dirname, '../social_effects_in_label_coining-main 2/01_jspsych_main_social'
);

function conceptNumbers(concepts) {
    return Array.from(concepts, concept => concept.concept_nr);
}

function sortedNumbers(concepts) {
    return conceptNumbers(concepts).sort((a, b) => a - b);
}

function createHarness(role, configSource, pageSource, csvSource) {
    let capturedTimeline;
    let capturedProperties;
    let joined;
    const seeds = [];
    const pendingFetch = {
        then() { return this; },
        catch() { return this; },
    };
    const context = vm.createContext({
        URLSearchParams,
        window: { location: { search: '?role=' + role + '&pair=1' } },
        document: { body: { innerHTML: '' } },
        fetch: () => pendingFetch,
        PairSync: { join: (...args) => { joined = args; } },
        jsPsychHtmlButtonResponse: {},
        jsPsychPairTrial: {},
        jsPsychFullscreen: {},
        jsPsychPreload: {},
        initJsPsych: () => ({
            data: { addProperties: properties => { capturedProperties = properties; } },
            randomization: { shuffle: array => array.slice() },
            run: timeline => { capturedTimeline = timeline; },
        }),
    });
    vm.runInContext(configSource, context, { filename: 'experiment_config.js' });
    vm.runInContext(fs.readFileSync(path.join(experimentDir, 'resources/label_similarity.js'), 'utf8'), context,
        { filename: 'label_similarity.js' });
    vm.runInContext(pageSource, context, { filename: 'main_social_basic.inline.js' });
    const rows = context.parseCSV(csvSource);
    const inputBefore = JSON.stringify(rows);
    const actualOrderConcepts = context.orderConcepts;
    context.orderConcepts = (concepts, seed) => {
        seeds.push(seed);
        return actualOrderConcepts(concepts, seed);
    };

    function build(pairID, count) {
        capturedTimeline = null;
        capturedProperties = null;
        joined = null;
        seeds.length = 0;
        context.pairID = pairID;
        context.N_OVERRIDE = count || NaN;
        context.runExperiment(rows);
        assert.ok(capturedTimeline, 'the real page must call jsPsych.run');
        const flattened = [];
        function visit(nodes) {
            for (const node of nodes) {
                if (node.data) flattened.push(node.data);
                if (node.timeline) visit(node.timeline);
            }
        }
        visit(capturedTimeline);
        const steps = ['label', 'attempt', 'label'];
        const phases = steps.map((step, index) => Array.from(flattened)
            .filter(data => data.phase === 'phase' + (index + 1) && data.step === step)
            .map(data => ({
                concept_nr: data.concept_nr,
                concept_id: data.concept_id,
                is_filler: data.is_filler,
                label_goodness: data.label_goodness,
                scripted_confederate_label: data.scripted_confederate_label,
                confederate_label: data.confederate_label,
            })));
        const phase3Node = Array.from(capturedTimeline).find(node =>
            node.timeline && Array.from(node.timeline).some(trial =>
                trial.data && trial.data.phase === 'phase3'
            )
        );
        assert.ok(phase3Node, 'phase 3 must be constructed in its conditional timeline');
        assert.equal(phase3Node.conditional_function(), role === 'naive',
            'only the naive participant executes phase 3');
        assert.deepEqual(joined, [pairID, role, false]);
        assert.equal(capturedProperties.pair_id, pairID);
        assert.equal(capturedProperties.role, role);
        assert.equal(JSON.stringify(rows), inputBefore, 'timeline construction must not mutate CSV rows');
        return { phases, seeds: seeds.slice() };
    }

    return { build, context, rows };
}

function run() {
    const html = fs.readFileSync(path.join(experimentDir, 'main_social_basic.html'), 'utf8');
    const inlineScripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
        .filter(match => !/\bsrc\s*=/i.test(match[1]))
        .map(match => match[2]);
    assert.equal(inlineScripts.length, 1, 'load the actual experiment inline script');
    const configSource = fs.readFileSync(path.join(experimentDir, 'resources/experiment_config.js'), 'utf8');
    const csvSource = fs.readFileSync(path.join(experimentDir, 'stimuli/concepts.csv'), 'utf8');
    const harnesses = ['naive', 'confederate'].map(role =>
        createHarness(role, configSource, inlineScripts[0], csvSource)
    );
    const context = harnesses[0].context;
    const candidates = Array.from(harnesses[0].rows, row => ({
        concept_nr: Number(row.concept_nr),
        concept_id: row.concept_id,
        is_filler: row.item_type === 'filler',
    }));
    const originalCandidates = JSON.stringify(candidates);
    const rowsByNumber = new Map(Array.from(harnesses[0].rows, row => [Number(row.concept_nr), row]));
    assert.equal(candidates.length, 20);
    assert.equal(candidates.filter(concept => !concept.is_filler).length, 16);
    assert.equal(candidates.filter(concept => concept.is_filler).length, 4);
    assert.equal(context.CONFIG.filler_free_edge_trials, 3);

    const stats = {
        fullRuns: 0,
        shortRuns: 0,
        determinismRebuilds: 0,
        phaseOrdersChecked: 0,
        crossRoleComparisons: 0,
        constrainedPhaseOrders: 0,
        fallbackPhaseOrders: 0,
    };

    function validate(result, pairID, count) {
        const expectedSeeds = [1, 2, 3].map(phase => pairID * 10 + phase);
        assert.deepEqual(result.seeds, expectedSeeds, 'each phase must use its independent pair/phase seed');
        const selected = count > 0
            ? Array.from(context.seededShuffle(candidates, pairID)).slice(0, count)
            : candidates;
        const targetCount = selected.filter(concept => !concept.is_filler).length;
        const fillerCount = selected.length - targetCount;

        result.phases.forEach((phase, index) => {
            stats.phaseOrdersChecked++;
            assert.equal(phase.length, selected.length, 'each concept occurs once in each phase');
            assert.equal(new Set(conceptNumbers(phase)).size, selected.length, 'no concept is duplicated');
            assert.deepEqual(sortedNumbers(phase), sortedNumbers(selected), 'no selected concept is lost or replaced');
            assert.equal(phase.filter(concept => !concept.is_filler).length, targetCount);
            assert.equal(phase.filter(concept => concept.is_filler).length, fillerCount);
            if (targetCount >= 6) {
                stats.constrainedPhaseOrders++;
                assert.ok(phase.slice(0, 3).every(concept => !concept.is_filler), 'first three concepts are targets');
                assert.ok(phase.slice(-3).every(concept => !concept.is_filler), 'last three concepts are targets');
            } else {
                stats.fallbackPhaseOrders++;
                assert.deepEqual(conceptNumbers(phase), conceptNumbers(
                    context.seededShuffle(selected, expectedSeeds[index])
                ), 'fewer than six targets must use an unrestricted seeded shuffle');
            }
            for (const concept of phase) {
                const row = rowsByNumber.get(concept.concept_nr);
                assert.equal(concept.concept_id, row.concept_id);
                assert.equal(concept.is_filler, row.item_type === 'filler');
                assert.equal(concept.scripted_confederate_label, row[concept.label_goodness + '_label']);
                assert.equal(concept.confederate_label, concept.scripted_confederate_label.trim().toUpperCase());
            }
            if (!count) {
                assert.equal(phase.filter(concept => concept.label_goodness === 'good').length, 8);
                assert.equal(phase.filter(concept => concept.label_goodness === 'bad').length, 8);
                assert.equal(phase.filter(concept => concept.label_goodness === 'middle').length, 4);
            }
        });
        assert.equal(JSON.stringify(candidates), originalCandidates, 'ordering must not mutate its input');
    }

    function checkPair(pairID, count) {
        const results = harnesses.map(harness => {
            const first = harness.build(pairID, count);
            validate(first, pairID, count);
            const repeated = harness.build(pairID, count);
            stats.determinismRebuilds++;
            assert.deepEqual(repeated, first, 'rebuilding the same pair/role must reproduce every order');
            if (count) stats.shortRuns++;
            else stats.fullRuns++;
            return first;
        });
        stats.crossRoleComparisons++;
        assert.deepEqual(results[0], results[1], 'the two roles must construct matching orders and assigned labels');
        if (!count) {
            const orders = results[0].phases.map(conceptNumbers);
            assert.notDeepEqual(orders[0], orders[1], 'full phase 1 and 2 use different orders');
            assert.notDeepEqual(orders[0], orders[2], 'full phase 1 and 3 use different orders');
            assert.notDeepEqual(orders[1], orders[2], 'full phase 2 and 3 use different orders');
        }
    }

    for (let pairID = 1; pairID <= 250; pairID++) checkPair(pairID, 0);
    for (let pairID = 1; pairID <= 50; pairID++) {
        for (let count = 1; count <= 20; count++) checkPair(pairID, count);
    }
    assert.ok(stats.fallbackPhaseOrders > 0, 'short-run fallback must be exercised');
    assert.ok(stats.constrainedPhaseOrders > 0, 'target-only edges must be exercised');
    return stats;
}

module.exports = { run };
if (require.main === module) console.log('PASS: trial order regression checks', run());
