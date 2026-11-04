'use strict';

// Run with node tests/test_label_similarity.cjs, or require this module and call run().
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,
    '../social_effects_in_label_coining-main 2/01_jspsych_main_social/resources/label_similarity.js'), 'utf8');

function normalize(value) {
    return String(value == null ? '' : value).trim().toUpperCase().normalize('NFC');
}

// Independent full-matrix reference implementation for generated-case checks.
function referenceDistance(left, right) {
    const a = Array.from(normalize(left));
    const b = Array.from(normalize(right));
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let row = 1; row <= a.length; row++) {
        for (let col = 1; col <= b.length; col++) {
            matrix[row][col] = a[row - 1] === b[col - 1]
                ? matrix[row - 1][col - 1]
                : 1 + Math.min(matrix[row - 1][col], matrix[row][col - 1], matrix[row - 1][col - 1]);
        }
    }
    return matrix[a.length][b.length];
}

function run() {
    const context = vm.createContext({});
    vm.runInContext(source, context, { filename: 'label_similarity.js' });
    const compare = (term, reference) => ({ ...context.LabelSimilarity.compare(term, reference) });
    let checks = 0;
    const check = (term, reference, expected) => {
        const actual = compare(term, reference);
        for (const [field, value] of Object.entries(expected)) {
            assert.equal(actual[field], value, `${JSON.stringify(term)} / ${JSON.stringify(reference)}: ${field}`);
        }
        checks++;
        return actual;
    };

    check(' cdpfanne ', 'CDPFANNE', { exact: true, distance: 0, swapped_parts: false });
    check('bru\u0308ste', 'BRÜSTE', { exact: true, distance: 0 });
    check('straße', 'STRASSE', { exact: true, distance: 0 });
    check('CD-PFANNE', 'CDPFANNE', { exact: false, distance: 1, swapped_parts: false });
    check('CD PFANNE', 'CDPFANNE', { exact: false, distance: 1, swapped_parts: false });
    check('KITTEN', 'SITTING', { distance: 3, exact: false });
    check('AB', 'BA', { distance: 2, swapped_parts: false });
    check('😀', '', { distance: 1, exact: false, swapped_parts: false });
    check('😀A', 'A😀', { distance: 2, swapped_parts: false });
    check('', '', { exact: false, distance: 0, swapped_parts: false });
    check(' \t ', 'CDPFANNE', { exact: false, distance: 8, swapped_parts: false });
    check(null, undefined, { exact: false, distance: 0, swapped_parts: false });

    const reversals = [
        ['CDPFANNE', 'PFANNECD'],
        ['CDPFANNE', 'PFANNENCD'],
        ['CDPFANNE', 'PFANNE-CD'],
        ['CD-PFANNE', 'PFANNEN CD'],
        ['CDPFANNE', 'PFANNE\u2011CD'],
        ['ROHRORGEL', 'ORGELROHR'],
        ['WÜRFELGLAS', 'GLASWÜRFEL'],
        ['BÜRSTENROBOTER', 'ROBOTERBÜRSTE'],
        ['ARBEITSZIMMER', 'ZIMMERARBEIT'],
        ['CDPFANNE', 'PFANNEENCD'],
        ['CDPFANNE', 'PFANNESCD'],
        ['CDPFANNE', 'PFANNEESCD'],
    ];
    for (const [left, right] of reversals) {
        check(left, right, { exact: false, swapped_parts: true });
        check(right, left, { exact: false, swapped_parts: true });
    }
    for (const [term, reference] of [
        ['BADC', 'ABCD'],                         // Anagram, not a two-part reversal.
        ['BCDA', 'ABCD'],                         // Single-letter rotation.
        ['DABC', 'ABCD'],                         // Single-letter rotation in the other direction.
        ['PFANNECDX', 'CDPFANNE'],                // Unrecognised extra suffix.
        ['PFANNEXCD', 'CDPFANNE'],                // Unrecognised linking element.
        ['PFANNECD', 'XDPCFANNE'],                // Fuzzy rotation is not enough.
        ['PFANNE+CD', 'CDPFANNE'],                // Arbitrary punctuation is retained.
        ['PFANNE', 'CDPFANNE'],                   // Missing component.
        ['ROBOTER', 'BÜRSTENROBOTER'],            // Shared fragment alone is not enough.
        ['AB-CD', 'ABCD'],                        // Same compact order.
        ['ABAB', 'ABAB'],                         // Identical repeating components.
        ['😀AB', 'AB😀'],                         // Compound heuristic requires letters.
        ['', 'ABCD'],
    ]) check(term, reference, { swapped_parts: false });

    const words = [''];
    let frontier = [''];
    for (let length = 1; length <= 3; length++) {
        frontier = frontier.flatMap(prefix => ['a', 'b', 'ä', '😀'].map(letter => prefix + letter));
        words.push(...frontier);
    }
    let distancePairs = 0;
    for (const left of words) {
        for (const right of words) {
            const actual = compare(left, right);
            assert.equal(actual.distance, referenceDistance(left, right), `${left} / ${right}: reference distance`);
            assert.equal(actual.distance, compare(right, left).distance, 'distance symmetry');
            assert.equal(actual.exact, normalize(left).length > 0 && normalize(left) === normalize(right));
            assert.ok(actual.distance >= Math.abs(Array.from(normalize(left)).length - Array.from(normalize(right)).length));
            distancePairs++;
        }
    }

    let linkedReversals = 0;
    for (const first of ['CD', 'ROHR', 'ÄR']) {
        for (const second of ['PFANNE', 'ORGEL', 'ÖL']) {
            for (const oldLink of ['', 'N', 'EN', 'S', 'ES']) {
                for (const newLink of ['', 'N', 'EN', 'S', 'ES']) {
                    const original = first + oldLink + second;
                    const reversed = second + newLink + first;
                    assert.equal(compare(original, reversed).swapped_parts, true);
                    assert.equal(compare(reversed, original).swapped_parts, true, 'compound reversal symmetry');
                    linkedReversals++;
                }
            }
        }
    }

    return { checks, distancePairs, linkedReversals };
}

module.exports = { run };
if (require.main === module) console.log('PASS: label similarity', run());
