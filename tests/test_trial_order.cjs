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

function assertSeparatedFillers(concepts) {
    for (let i = 1; i < concepts.length; i++) {
        assert.ok(!(concepts[i - 1].is_filler && concepts[i].is_filler),
            'at least one target must separate successive fillers');
    }
}

function boundaryConflicts(previous, next) {
    const excluded = new Set(conceptNumbers(previous.slice(-2)));
    return next.slice(0, 2).filter(concept => excluded.has(concept.concept_nr));
}

function minimumBoundaryConflicts(previous, next) {
    const excluded = new Set(conceptNumbers(previous.slice(-2)));
    return [false, true].reduce((total, isFiller) => {
        const headSlots = next.slice(0, 2).filter(concept => concept.is_filler === isFiller).length;
        const allowed = next.filter(concept =>
            concept.is_filler === isFiller && !excluded.has(concept.concept_nr)
        ).length;
        return total + Math.max(0, headSlots - allowed);
    }, 0);
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
            data: { addProperties: properties => {
                capturedProperties = Object.assign({}, capturedProperties, properties);
            } },
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
        const setup = Array.from(capturedTimeline).find(node =>
            node.data && node.data.phase === 'setup' && typeof node.stimulus === 'string'
        );
        assert.ok(setup, 'the experimenter setup screen must be present');
        return {
            phases,
            seeds: seeds.slice(),
            boundaryConflicts: [capturedProperties.phase2_boundary_conflicts, capturedProperties.phase3_boundary_conflicts],
            hasBoundaryWarning: setup.stimulus.includes('id="phase-boundary-warning"'),
        };
    }

    return { build, context, rows, orderConcepts: actualOrderConcepts };
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
        separatedPhaseOrders: 0,
        relaxedEdgePhaseOrders: 0,
        fallbackPhaseOrders: 0,
        boundaryOrdersChecked: 0,
        phaseTransitionsChecked: 0,
        repairedTransitions: 0,
        shortRunConflicts: 0,
        boundaryHelperCases: 0,
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
            const originalOrder = Array.from(harnesses[0].orderConcepts(selected, expectedSeeds[index]));
            assert.deepEqual(Array.from(phase, concept => concept.is_filler),
                Array.from(originalOrder, concept => concept.is_filler),
                'boundary repair must preserve every target/filler position');
            if (index === 0) {
                assert.deepEqual(conceptNumbers(phase), conceptNumbers(originalOrder),
                    'phase 1 keeps its original seeded order');
            } else {
                stats.phaseTransitionsChecked++;
                const previous = result.phases[index - 1];
                const conflicts = boundaryConflicts(previous, phase);
                const minimumConflicts = minimumBoundaryConflicts(previous, originalOrder);
                assert.equal(conflicts.length, minimumConflicts,
                    'both opening positions must exclude both preceding final pictures whenever category slots allow it');
                assert.equal(result.boundaryConflicts[index - 1], conceptNumbers(conflicts).join(','),
                    'saved diagnostics identify every unresolved boundary conflict');
                if (boundaryConflicts(previous, originalOrder).length > conflicts.length) stats.repairedTransitions++;
                if (conflicts.length) {
                    assert.ok(count, 'full experiment boundaries must always be repairable');
                    stats.shortRunConflicts++;
                }
            }
            assert.equal(phase.length, selected.length, 'each concept occurs once in each phase');
            assert.equal(new Set(conceptNumbers(phase)).size, selected.length, 'no concept is duplicated');
            assert.deepEqual(sortedNumbers(phase), sortedNumbers(selected), 'no selected concept is lost or replaced');
            assert.equal(phase.filter(concept => !concept.is_filler).length, targetCount);
            assert.equal(phase.filter(concept => concept.is_filler).length, fillerCount);
            if (targetCount >= 6 && fillerCount <= targetCount - 5) {
                stats.constrainedPhaseOrders++;
                assert.ok(phase.slice(0, 3).every(concept => !concept.is_filler), 'first three concepts are targets');
                assert.ok(phase.slice(-3).every(concept => !concept.is_filler), 'last three concepts are targets');
            } else if (fillerCount <= targetCount + 1) {
                stats.relaxedEdgePhaseOrders++;
            }
            if (fillerCount <= targetCount + 1) {
                stats.separatedPhaseOrders++;
                assertSeparatedFillers(phase);
            } else {
                stats.fallbackPhaseOrders++;
                assert.deepEqual(conceptNumbers(originalOrder), conceptNumbers(
                    context.seededShuffle(selected, expectedSeeds[index])
                ), 'subsets with too few targets start from an unrestricted seeded shuffle before boundary repair');
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
        assert.equal(result.hasBoundaryWarning, result.boundaryConflicts.some(value => value !== ''),
            'the experimenter sees a warning exactly when short-run boundary conflicts remain');
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
    assert.ok(stats.separatedPhaseOrders > 0, 'filler separation must be exercised');
    assert.ok(stats.relaxedEdgePhaseOrders > 0, 'short-run edge relaxation must be exercised');
    assert.ok(stats.repairedTransitions > 0, 'cross-phase repetition must be repaired');
    assert.ok(stats.shortRunConflicts > 0, 'unrepairable short-run boundaries must be reported');

    // Force both Phase 2 replacements into its tail. Phase 3 must exclude that adjusted tail,
    // even though its original head was allowed by the original Phase 2 tail.
    const fixtureCSV = csvSource.trim().split(/\r?\n/).slice(0, 5).join('\n');
    for (const role of ['naive', 'confederate']) {
        const fixture = createHarness(role, configSource, inlineScripts[0], fixtureCSV);
        const fixedOrders = [[1, 2, 3, 4], [3, 4, 1, 2], [3, 4, 1, 2]];
        fixture.context.orderConcepts = (concepts, seed) => fixedOrders[seed % 10 - 1].map(number =>
            concepts.find(concept => concept.concept_nr === number)
        );
        const result = fixture.build(1, 0);
        assert.deepEqual(conceptNumbers(result.phases[0]), fixedOrders[0]);
        assert.notDeepEqual(conceptNumbers(result.phases[1].slice(-2)), fixedOrders[1].slice(-2),
            'the fixture must change the Phase 2 tail');
        assert.equal(boundaryConflicts(result.phases[0], result.phases[1]).length, 0);
        assert.equal(boundaryConflicts(result.phases[1], result.phases[2]).length, 0,
            'Phase 3 excludes the final adjusted Phase 2 tail');
        assert.deepEqual(result.boundaryConflicts, ['', '']);
        assert.equal(result.hasBoundaryWarning, false);
    }

    const target = number => ({ concept_nr: number, is_filler: false });
    const filler = number => ({ concept_nr: number, is_filler: true });
    const t = [1, 2, 3, 4].map(target);
    const f = [5, 6].map(filler);
    const helperCases = [
        { previous: [], next: [] },
        { previous: [], next: [t[0]] },
        { previous: t, next: t },
        { previous: t, next: [t[2], t[0], t[1], t[3]] },
        { previous: t, next: [t[2], t[3], t[0], t[1]] },
        // A unique filler cannot swap with an allowed target, even in a four-picture run.
        { previous: [t[0], t[1], t[2], f[0]], next: [f[0], t[0], t[1], t[2]] },
        { previous: [f[1], t[0], t[1], t[2], f[0]], next: [f[0], t[0], f[1], t[1], t[2]] },
        ...[1, 2, 3].map(count => ({ previous: t.slice(0, count), next: t.slice(0, count).reverse() })),
    ];
    for (const { previous, next } of helperCases) {
        const before = JSON.stringify([previous, next]);
        for (let seed = 1; seed <= 10; seed++) {
            const result = context.separatePhaseOrders(previous, next, seed);
            stats.boundaryHelperCases++;
            const order = Array.from(result.order);
            const conflicts = boundaryConflicts(previous, order);
            assert.notEqual(result.order, next, 'repair returns an independent order array');
            assert.deepEqual(sortedNumbers(order), sortedNumbers(next), 'repair retains every input picture');
            assert.deepEqual(order.map(concept => concept.is_filler), next.map(concept => concept.is_filler));
            assert.equal(conflicts.length, minimumBoundaryConflicts(previous, next));
            assert.deepEqual(Array.from(result.unresolvedConcepts), conceptNumbers(conflicts));
            assert.equal(JSON.stringify([previous, next]), before, 'repair leaves both inputs unchanged');
            const repeated = context.separatePhaseOrders(previous, next, seed);
            assert.deepEqual(conceptNumbers(repeated.order), conceptNumbers(order));
            assert.deepEqual(Array.from(repeated.unresolvedConcepts), Array.from(result.unresolvedConcepts));
            if (boundaryConflicts(previous, next).length === 0) {
                assert.deepEqual(conceptNumbers(order), conceptNumbers(next), 'safe orders keep their original order');
            }
        }
    }

    // Cover exact-capacity gaps, conflicting edges, impossible subsets and edge=0 explicitly.
    for (const configuredEdge of [3, 0, -1, 1.5]) {
        context.CONFIG.filler_free_edge_trials = configuredEdge;
        const edge = configuredEdge === 0 ? 0 : 3;
        for (const [targetCount, fillerCount] of [
            [0, 0], [0, 1], [0, 2], [1, 3], [2, 3], [6, 1], [6, 2], [7, 2], [16, 4], [8, 0],
        ]) {
            const items = Array.from({ length: targetCount + fillerCount }, (_, i) => ({
                concept_nr: i + 1,
                is_filler: i >= targetCount,
            }));
            const before = JSON.stringify(items);
            for (let seed = 1; seed <= 10; seed++) {
                const ordered = Array.from(context.orderConcepts(items, seed));
                stats.boundaryOrdersChecked++;
                assert.equal(ordered.length, items.length);
                assert.equal(new Set(ordered).size, items.length, 'every input object appears once');
                assert.deepEqual(sortedNumbers(ordered), sortedNumbers(items));
                assert.deepEqual(conceptNumbers(ordered), conceptNumbers(context.orderConcepts(items, seed)));
                assert.equal(JSON.stringify(items), before, 'ordering must not mutate its input');
                if (fillerCount > targetCount + 1) {
                    assert.deepEqual(conceptNumbers(ordered), conceptNumbers(context.seededShuffle(items, seed)));
                    continue;
                }
                assertSeparatedFillers(ordered);
                if (edge > 0 && targetCount >= 2 * edge && fillerCount <= targetCount - 2 * edge + 1) {
                    assert.ok(ordered.slice(0, edge).every(concept => !concept.is_filler));
                    assert.ok(ordered.slice(-edge).every(concept => !concept.is_filler));
                }
            }
        }
    }
    context.CONFIG.filler_free_edge_trials = 3;
    return stats;
}

module.exports = { run };
if (require.main === module) console.log('PASS: trial order regression checks', run());
