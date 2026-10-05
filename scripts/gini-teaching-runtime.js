"use strict";

const Core = require("./gini-teaching-core");
const Evaluator = require("./gini-teaching-evaluator");

function terminalState(state) {
  return [Core.STATES.COMPLETE, Core.STATES.STOPPED, Core.STATES.ERROR].includes(state);
}

function asTextList(action) {
  if (!action || action.type === "none") return [];
  if (action.type === "speak") return [action.text].filter(Boolean);
  if (action.type === "speak-sequence") return Array.isArray(action.texts) ? action.texts.filter(Boolean) : [];
  return [];
}

async function runScriptedLesson(lesson, scriptedTurns = [], options = {}) {
  const created = Core.createSession(lesson, { sessionId: options.sessionId || "scripted-session" });
  if (!created.ok) return { ok: false, errors: created.errors, session: null, transcript: [] };

  const transcript = [];
  let session = created.session;
  let action = created.action;
  let answerIndex = 0;
  let guard = 0;

  while (!terminalState(session.state) && guard++ < 200) {
    for (const text of asTextList(action)) transcript.push({ role: "gini", text, purpose: action.purpose || "" });

    if (action.type === "speak" || action.type === "speak-sequence") {
      const next = Core.reduceSession(lesson, session, { type: "spoken-complete" });
      session = next.session;
      action = next.action;
      continue;
    }

    if (action.type === "listen") {
      const turn = scriptedTurns[answerIndex++];
      if (turn && turn.type === "stop") {
        const next = Core.reduceSession(lesson, session, { type: "stop" });
        session = next.session;
        action = next.action;
        continue;
      }

      if (turn == null || (typeof turn === "object" && turn.type === "silence")) {
        const next = Core.reduceSession(lesson, session, { type: "silence" });
        session = next.session;
        action = next.action;
        continue;
      }

      const text = typeof turn === "string" ? turn : String(turn.text || "");
      transcript.push({ role: "child", text });
      const next = Core.reduceSession(lesson, session, { type: "answer", text });
      session = next.session;
      action = next.action;
      continue;
    }

    if (action.type === "evaluate") {
      const evaluator = options.evaluator || Evaluator.evaluateUnderstanding;
      const evaluation = await evaluator({
        question: lesson.steps[session.stepIndex] && lesson.steps[session.stepIndex].question,
        answer: action.answer,
        expectedConcepts: action.expectedConcepts
      });
      transcript.push({ role: "evaluation", outcome: evaluation.outcome, reason: evaluation.reason || "", source: evaluation.source || "" });
      const next = Core.reduceSession(lesson, session, { type: "evaluation", outcome: evaluation.outcome });
      session = next.session;
      action = next.action;
      continue;
    }

    return {
      ok: false,
      error: "runtime received unsupported action: " + String(action.type),
      session,
      transcript
    };
  }

  for (const text of asTextList(action)) transcript.push({ role: "gini", text, purpose: action.purpose || "" });

  if (guard >= 200) {
    return { ok: false, error: "runtime guard exhausted", session, transcript };
  }

  return {
    ok: session.state === Core.STATES.COMPLETE || session.state === Core.STATES.STOPPED,
    completed: session.state === Core.STATES.COMPLETE,
    stopped: session.state === Core.STATES.STOPPED,
    session,
    transcript,
    consumedTurns: answerIndex
  };
}

module.exports = { runScriptedLesson, terminalState };
