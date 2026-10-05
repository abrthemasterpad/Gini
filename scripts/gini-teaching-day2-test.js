"use strict";

const assert = require("assert");
const Core = require("./gini-teaching-core");
const Evaluator = require("./gini-teaching-evaluator");
const Runtime = require("./gini-teaching-runtime");

function lesson() {
  return {
    schemaVersion: Core.LESSON_SCHEMA_VERSION,
    id: "day2-water-cycle",
    topic: "Water cycle basics",
    language: "en",
    supportLanguage: "ta",
    ageBand: "7-9",
    objective: "Understand that evaporation moves liquid water into the air as water vapour.",
    intro: "We will learn one small part of the water cycle.",
    steps: [
      {
        id: "evaporation",
        concept: "Evaporation changes liquid water into water vapour",
        teach: "When the Sun warms liquid water, some of it can change into water vapour and move into the air. This is evaporation.",
        question: "What can liquid water become during evaporation?",
        expectedConcepts: ["water vapour", "water vapor"],
        hints: ["It becomes a gas in the air."],
        successReply: "Yes. Liquid water can become water vapour.",
        retryReply: "Think about the invisible gas water becomes.",
        maxAttempts: 2
      }
    ]
  };
}

async function run() {
  let result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "It becomes water vapour.",
    expectedConcepts: ["water vapour", "water vapor"]
  }, {
    semanticReview: async () => { throw new Error("should not be called"); }
  });
  assert.equal(result.outcome, "pass");
  assert.equal(result.source, "deterministic");

  result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "I don't know",
    expectedConcepts: ["water vapour"]
  }, {
    semanticReview: async () => { throw new Error("should not be called"); }
  });
  assert.equal(result.outcome, "fail");
  assert.equal(result.reason, "explicit-dont-know");

  result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "Maybe something in the air",
    expectedConcepts: ["water vapour"]
  }, {
    semanticReview: async () => ({ outcome: "partial", reason: "understands destination but not state/name" })
  });
  assert.equal(result.outcome, "partial");

  result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "The microphone transcript is unclear",
    expectedConcepts: ["water vapour"]
  }, {
    semanticReview: async () => ({ outcome: "uncertain", reason: "transcript ambiguity" })
  });
  assert.equal(result.outcome, "uncertain");

  result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "something",
    expectedConcepts: ["water vapour"]
  }, {
    semanticReview: async () => { throw new Error("provider offline"); }
  });
  assert.equal(result.outcome, "uncertain");
  assert.equal(result.source, "fallback");

  result = await Evaluator.evaluateUnderstanding({
    question: "What can water become?",
    answer: "It is not water vapour",
    expectedConcepts: ["water vapour"]
  }, {
    semanticReview: async () => ({ outcome: "fail", reason: "explicit negation" })
  });
  assert.equal(result.outcome, "fail");

  const semanticMap = async ({ answer }) => {
    const clean = Evaluator.normalize(answer);
    if (clean.includes("gas")) return { outcome: "partial", reason: "partial concept" };
    return { outcome: "uncertain", reason: "cannot establish meaning" };
  };

  let runtime = await Runtime.runScriptedLesson(lesson(), ["water vapour"], {
    evaluator: input => Evaluator.evaluateUnderstanding(input, { semanticReview: semanticMap })
  });
  assert.equal(runtime.ok, true);
  assert.equal(runtime.completed, true);
  assert.equal(runtime.session.state, Core.STATES.COMPLETE);
  assert(runtime.transcript.some(x => x.role === "evaluation" && x.outcome === "pass"));

  runtime = await Runtime.runScriptedLesson(lesson(), ["gas", "water vapour"], {
    evaluator: input => Evaluator.evaluateUnderstanding(input, { semanticReview: semanticMap })
  });
  assert.equal(runtime.completed, true);
  assert(runtime.transcript.some(x => x.role === "evaluation" && x.outcome === "partial"));
  assert(runtime.transcript.some(x => x.role === "gini" && x.purpose === "hint"));

  runtime = await Runtime.runScriptedLesson(lesson(), [{ type: "silence" }, "water vapour"], {
    evaluator: input => Evaluator.evaluateUnderstanding(input, { semanticReview: semanticMap })
  });
  assert.equal(runtime.completed, true);
  assert(runtime.transcript.some(x => x.role === "gini" && x.purpose === "gentle-retry"));

  runtime = await Runtime.runScriptedLesson(lesson(), [{ type: "stop" }], {
    evaluator: input => Evaluator.evaluateUnderstanding(input, { semanticReview: semanticMap })
  });
  assert.equal(runtime.stopped, true);
  assert.equal(runtime.session.state, Core.STATES.STOPPED);

  const noSemantic = await Runtime.runScriptedLesson(lesson(), ["unclear words", "unclear again"], {
    evaluator: input => Evaluator.evaluateUnderstanding(input, {
      semanticReview: async () => { throw new Error("offline"); }
    })
  });
  assert.equal(noSemantic.completed, true);
  assert(noSemantic.transcript.filter(x => x.role === "evaluation").every(x => x.outcome === "uncertain"));
  assert(noSemantic.transcript.some(x => x.role === "gini" && /won't mark it wrong|can't be certain/i.test(x.text)));

  console.log("GINI TEACHING DAY2 TEST PASS");
  console.log("Validated: direct pass, don't-know, partial, uncertain, provider failure, negation, silence, hint/retry, stop, full scripted lesson.");
}

run().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
