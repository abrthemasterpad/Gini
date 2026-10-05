"use strict";

const assert = require("assert");
const Core = require("./gini-teaching-core");
const Planner = require("./gini-teaching-planner");

function fixtureLesson() {
  return {
    schemaVersion: Core.LESSON_SCHEMA_VERSION,
    id: "solar-system-basics",
    topic: "Solar system basics",
    language: "en",
    supportLanguage: "ta",
    ageBand: "6-8",
    objective: "Understand that planets orbit the Sun and identify Earth as one planet.",
    intro: "Let's learn two small things about our solar system.",
    steps: [
      {
        id: "step-1",
        concept: "Planets orbit the Sun",
        teach: "The Sun is our star. Planets travel around it in paths called orbits.",
        question: "What do the planets travel around?",
        expectedConcepts: ["the Sun", "Sun"],
        hints: ["Think about the star at the center of our solar system."],
        successReply: "Yes. The planets travel around the Sun.",
        retryReply: "The Sun is at the center. What travels around it?",
        maxAttempts: 2
      },
      {
        id: "step-2",
        concept: "Earth is a planet",
        teach: "Earth, where we live, is one of the planets in the solar system.",
        question: "Is Earth a planet or a star?",
        expectedConcepts: ["planet"],
        hints: ["We live on it, and it travels around the Sun."],
        successReply: "Correct. Earth is a planet.",
        retryReply: "Earth travels around the Sun. Is it a planet or a star?",
        maxAttempts: 2
      }
    ]
  };
}

function spokenComplete(lesson, session) {
  return Core.reduceSession(lesson, session, { type: "spoken-complete" });
}

(function run() {
  const valid = Core.validateLessonPlan(fixtureLesson());
  assert.equal(valid.ok, true, valid.errors.join("; "));

  const malformed = fixtureLesson();
  delete malformed.steps[0].expectedConcepts;
  const rejected = Core.validateLessonPlan(malformed);
  assert.equal(rejected.ok, false);
  assert(rejected.errors.some(x => x.includes("expectedConcepts")));

  const tooLong = fixtureLesson();
  tooLong.steps = Array.from({ length: 11 }, (_, i) => ({
    ...fixtureLesson().steps[0],
    id: `step-${i + 1}`
  }));
  assert.equal(Core.validateLessonPlan(tooLong).ok, false);

  const parsed = Planner.parseJsonLoose("```json\n{\"ok\":true}\n```");
  assert.equal(parsed.ok, true);
  assert.throws(() => Planner.parseJsonLoose("not json"));

  const created = Core.createSession(fixtureLesson(), { sessionId: "smoke-session" });
  assert.equal(created.ok, true);
  assert.equal(created.session.state, Core.STATES.INTRO);
  assert.equal(created.action.purpose, "intro");

  let s = created.session;
  let r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  assert.equal(s.state, Core.STATES.TEACH);
  assert.equal(r.action.purpose, "teach");

  r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  assert.equal(s.state, Core.STATES.ASK);
  assert.equal(r.action.purpose, "question");

  r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  assert.equal(s.state, Core.STATES.LISTEN);
  assert.equal(r.action.type, "listen");

  r = Core.reduceSession(fixtureLesson(), s, { type: "answer", text: "I think maybe the star?" });
  s = r.session;
  assert.equal(s.state, Core.STATES.EVALUATE);
  assert.equal(r.action.type, "evaluate");
  assert(r.action.expectedConcepts.includes("the Sun"));

  r = Core.reduceSession(fixtureLesson(), s, { type: "evaluation", outcome: "uncertain" });
  s = r.session;
  assert.equal(s.state, Core.STATES.HINT);
  assert.equal(r.action.purpose, "hint");
  assert(/won't call it wrong/i.test(r.action.text));

  r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  assert.equal(s.state, Core.STATES.LISTEN);

  r = Core.reduceSession(fixtureLesson(), s, { type: "answer", text: "The Sun" });
  s = r.session;
  r = Core.reduceSession(fixtureLesson(), s, { type: "evaluation", outcome: "pass" });
  s = r.session;
  assert.equal(s.stepIndex, 1);
  assert.equal(s.state, Core.STATES.TEACH);
  assert.equal(r.action.type, "speak-sequence");

  r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  r = spokenComplete(fixtureLesson(), s);
  s = r.session;
  r = Core.reduceSession(fixtureLesson(), s, { type: "answer", text: "A planet" });
  s = r.session;
  r = Core.reduceSession(fixtureLesson(), s, { type: "evaluation", outcome: "pass" });
  s = r.session;
  assert.equal(s.state, Core.STATES.COMPLETE);
  assert.equal(r.action.purpose, "step-success-and-complete");

  const stopCreated = Core.createSession(fixtureLesson(), { sessionId: "stop-test" });
  r = Core.reduceSession(fixtureLesson(), stopCreated.session, { type: "stop" });
  assert.equal(r.session.state, Core.STATES.STOPPED);

  const badSession = { ...created.session, state: "MAGIC_NOODLES" };
  r = Core.reduceSession(fixtureLesson(), badSession, { type: "spoken-complete" });
  assert.equal(r.ok, false);
  assert.equal(r.session.state, Core.STATES.ERROR);

  console.log("GINI TEACHING DAY1 SMOKE PASS");
  console.log("Validated: lesson schema, malformed-plan rejection, state transitions, uncertainty handling, stop gate.");
})();
