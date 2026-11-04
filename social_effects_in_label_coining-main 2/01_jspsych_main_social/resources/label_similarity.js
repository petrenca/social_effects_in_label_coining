/* Label comparison for the confederate's Phase 2 traffic light.
 * This is a spelling/compound heuristic, not a semantic or morphological analyser.
 * A possible part reversal is A + link1 + B -> B + link2 + A, where A and B each
 * contain at least two letters and each link is empty, N, EN, S or ES. Both parts
 * must otherwise match exactly. Spaces and hyphens are ignored for this heuristic
 * only. No arbitrary anagram, single-letter rotation or fuzzy rotation is accepted.
 * A positive heuristic match still requires the confederate's judgement.
 */
var LabelSimilarity = (function () {
    'use strict';

    var links = ['', 'N', 'EN', 'S', 'ES'];

    function normalized(value) {
        return String(value == null ? '' : value).trim().toUpperCase().normalize('NFC');
    }

    // Unit-cost insertion, deletion and substitution on Unicode code points.
    // Two rolling rows keep memory linear; an adjacent transposition costs two.
    function levenshtein(a, b) {
        var left = Array.from(a);
        var right = Array.from(b);
        var previous = Array.from({ length: right.length + 1 }, function (_, i) { return i; });
        for (var i = 1; i <= left.length; i++) {
            var current = [i];
            for (var j = 1; j <= right.length; j++) {
                current[j] = Math.min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
                );
            }
            previous = current;
        }
        return previous[right.length];
    }

    function compactCompound(value) {
        return value.replace(/[\s\-\u2010\u2011]/g, '');
    }

    function swappedParts(term, reference) {
        var candidate = compactCompound(term);
        var source = compactCompound(reference);
        // Restrict this heuristic to letters and require a real order change.
        if (candidate === source || !/^\p{L}+$/u.test(candidate) || !/^\p{L}+$/u.test(source)) return false;
        var letters = Array.from(source);
        for (var split = 2; split <= letters.length - 2; split++) {
            var first = letters.slice(0, split).join('');
            var rest = letters.slice(split).join('');
            for (var i = 0; i < links.length; i++) {
                var originalLink = links[i];
                if (rest.slice(0, originalLink.length) !== originalLink) continue;
                var second = rest.slice(originalLink.length);
                if (Array.from(second).length < 2) continue;
                for (var j = 0; j < links.length; j++) {
                    if (candidate === second + links[j] + first) return true;
                }
            }
        }
        return false;
    }

    return {
        compare: function (term, reference) {
            var candidate = normalized(term);
            var source = normalized(reference);
            return {
                exact: candidate.length > 0 && source.length > 0 && candidate === source,
                distance: levenshtein(candidate, source),
                swapped_parts: swappedParts(candidate, source),
            };
        },
    };
})();
