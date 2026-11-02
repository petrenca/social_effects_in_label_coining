/* ------------------------------------------------------------------------------------------------
   jsPsychPairTrial - minimal "free" jsPsych plugin for the two-computer screens.
   The trial gets a render(display_element, ctx) function that draws the screen itself and calls
   ctx.finish(data) when the trial is over. This is needed because most screens in this
   experiment have to wait for the partner's computer (PairSync) before they can continue,
   which the standard plugins cannot do.
     ctx.after(ms, fn)  setTimeout that is cleared automatically when the trial ends
     ctx.every(ms, fn)  setInterval that is cleared automatically when the trial ends
     ctx.finish(data)   end the trial; data is added to the jsPsych data of this trial
   ------------------------------------------------------------------------------------------------ */
var jsPsychPairTrial = (function (jspsych) {
    'use strict';

    const info = {
        name: 'pair-trial',
        parameters: {
            render: { type: jspsych.ParameterType.FUNCTION, default: undefined },
        },
    };

    class PairTrialPlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }

        trial(display_element, trial) {
            const start = performance.now();
            const timers = [];
            let finished = false;
            const ctx = {
                after: (ms, fn) => { timers.push(setTimeout(() => { if (!finished) fn(); }, ms)); },
                every: (ms, fn) => { timers.push(setInterval(() => { if (!finished) fn(); }, ms)); },
                finish: (data) => {
                    if (finished) return;
                    finished = true;
                    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
                    display_element.innerHTML = '';
                    this.jsPsych.finishTrial(Object.assign({ rt: Math.round(performance.now() - start) }, data || {}));
                },
            };
            trial.render(display_element, ctx);
        }
    }
    PairTrialPlugin.info = info;

    return PairTrialPlugin;
})(jsPsychModule);
