"use strict";

const LESSON_SCHEMA_VERSION = "gini.lesson.v1";
const SESSION_VERSION = "gini.teaching-session.v1";

const STATES = Object.freeze({
  INTRO: "INTRO",
  TEACH: "TEACH",
  ASK: "ASK",
  LISTEN: "LISTEN",
  EVALUATE: "EVALUATE",
  HINT: "HINT",
  COMPLETE: "COMPLETE",
  STOPPED: "STOPPED",
  ERROR: "ERROR"
});

function cleanText(value, max = 500) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanStringArray(value, maxItems = 8, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStep(step, index) {
  const safe = step && typeof step === "object" ? step : {};
  const expectedConcepts = cleanStringArray(safe.expectedConcepts, 8, 120);
  const hints = cleanStringArray(safe.hints, 3, 240);

  return {
    id: cleanText(safe.id || `step-${index + 1}`, 80),
    concept: cleanText(safe.concept, 160),
    teach: cleanText(safe.teach, 500),
    question: cleanText(safe.question, 240),
    expectedConcepts,
    hints,
    successReply: cleanText(safe.successReply || "Good. Let's continue.", 220),
    retryReply: cleanText(
      safe.retryReply || "Let's try that in a simpler way.",
      220
    ),
    maxAttempts: Math.max(1, Math.min(3, Number(safe.maxAttempts) || 2))
  };
}

function validateLessonPlan(input) {
  const errors = [];
  const raw = input && typeof input === "object" ? input : {};
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];

  if (raw.schemaVersion !== LESSON_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${LESSON_SCHEMA_VERSION}`);
  }

  const lesson = {
    schemaVersion: LESSON_SCHEMA_VERSION,
    id: cleanText(raw.id, 100),
    topic: cleanText(raw.topic, 180),
    language: cleanText(raw.language || "en", 20).toLowerCase(),
    supportLanguage: cleanText(raw.supportLanguage || "ta", 20).toLowerCase(),
    ageBand: cleanText(raw.ageBand || "general", 40),
    objective: cleanText(raw.objective, 300),
    intro: cleanText(raw.intro || "Let's learn this one small step at a time.", 300),
    steps: rawSteps.slice(0, 10).map(normalizeStep)
  };

  if (!lesson.id) errors.push("id is required");
  if (!lesson.topic) errors.push("topic is required");
  if (!lesson.objective) errors.push("objective is required");
  if (rawSteps.length < 1) errors.push("at least one lesson step is required");
  if (rawSteps.length > 10) errors.push("lesson may contain at most 10 steps");

  lesson.steps.forEach((step, index) => {
    const label = `steps[${index}]`;
    if (!step.concept) errors.push(`${label}.concept is required`);
    if (!step.teach) errors.push(`${label}.teach is required`);
    if (!step.question) errors.push(`${label}.question is required`);
    if (!step.expectedConcepts.length) {
      errors.push(`${label}.expectedConcepts must contain at least one concept`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    lesson: errors.length === 0 ? lesson : null
  };
}

function cloneSession(session) {
  return JSON.parse(JSON.stringify(session));
}

function currentStep(lesson, session) {
  return lesson.steps[session.stepIndex] || null;
}

function createSession(lessonInput, options = {}) {
  const checked = validateLessonPlan(lessonInput);
  if (!checked.ok) {
    return {
      ok: false,
      errors: checked.errors,
      session: null,
      lesson: null
    };
  }

  const now = new Date().toISOString();
  const session = {
    version: SESSION_VERSION,
    id: cleanText(options.sessionId || `teach-${Date.now().toString(36)}`, 120),
    lessonId: checked.lesson.id,
    state: STATES.INTRO,
    stepIndex: 0,
    attempt: 0,
    paused: false,
    createdAt: now,
    updatedAt: now,
    history: []
  };

  return {
    ok: true,
    errors: [],
    lesson: checked.lesson,
    session,
    action: {
      type: "speak",
      purpose: "intro",
      text: checked.lesson.intro
    }
  };
}

function record(session, event, detail = {}) {
  session.history.push({
    at: new Date().toISOString(),
    state: session.state,
    event,
    ...detail
  });
  if (session.history.length > 100) {
    session.history = session.history.slice(-100);
  }
  session.updatedAt = new Date().toISOString();
}

function teachingAction(step) {
  return {
    type: "speak",
    purpose: "teach",
    text: step.teach
  };
}

function questionAction(step) {
  return {
    type: "speak",
    purpose: "question",
    text: step.question
  };
}

function listenAction() {
  return {
    type: "listen",
    purpose: "child-answer"
  };
}

function completeAction() {
  return {
    type: "speak",
    purpose: "complete",
    text: "We finished this lesson. Good work staying with it."
  };
}

function advanceToNextStep(lesson, session, replyText) {
  const nextIndex = session.stepIndex + 1;

  if (nextIndex >= lesson.steps.length) {
    session.state = STATES.COMPLETE;
    record(session, "lesson-complete");
    return {
      session,
      action: {
        type: "speak-sequence",
        purpose: "step-success-and-complete",
        texts: [replyText, completeAction().text].filter(Boolean)
      }
    };
  }

  session.stepIndex = nextIndex;
  session.attempt = 0;
  session.state = STATES.TEACH;
  record(session, "advance-step", { stepIndex: nextIndex });

  return {
    session,
    action: {
      type: "speak-sequence",
      purpose: "step-success-and-teach-next",
      texts: [replyText, currentStep(lesson, session).teach].filter(Boolean)
    }
  };
}

function reduceSession(lessonInput, sessionInput, eventInput) {
  const checked = validateLessonPlan(lessonInput);
  if (!checked.ok) {
    return {
      ok: false,
      error: "invalid lesson",
      errors: checked.errors,
      session: sessionInput || null,
      action: { type: "none" }
    };
  }

  const lesson = checked.lesson;
  const session = cloneSession(sessionInput || {});
  const event = eventInput && typeof eventInput === "object" ? eventInput : {};

  if (!Object.values(STATES).includes(session.state)) {
    session.state = STATES.ERROR;
    record(session, "invalid-session-state");
    return {
      ok: false,
      error: "invalid session state",
      session,
      action: { type: "none" }
    };
  }

  if (event.type === "stop") {
    session.state = STATES.STOPPED;
    record(session, "stop");
    return {
      ok: true,
      session,
      action: {
        type: "speak",
        purpose: "stopped",
        text: "Okay. We can stop here."
      }
    };
  }

  if (event.type === "pause") {
    session.paused = true;
    record(session, "pause");
    return { ok: true, session, action: { type: "none" } };
  }

  if (event.type === "resume") {
    session.paused = false;
    record(session, "resume");
    return { ok: true, session, action: { type: "none" } };
  }

  if (session.paused || [STATES.COMPLETE, STATES.STOPPED, STATES.ERROR].includes(session.state)) {
    return { ok: true, session, action: { type: "none" } };
  }

  const step = currentStep(lesson, session);
  if (!step) {
    session.state = STATES.ERROR;
    record(session, "missing-step");
    return {
      ok: false,
      error: "session step does not exist",
      session,
      action: { type: "none" }
    };
  }

  if (session.state === STATES.INTRO && event.type === "spoken-complete") {
    session.state = STATES.TEACH;
    record(session, "intro-complete");
    return { ok: true, session, action: teachingAction(step) };
  }

  if (session.state === STATES.TEACH && event.type === "spoken-complete") {
    session.state = STATES.ASK;
    record(session, "teaching-complete");
    return { ok: true, session, action: questionAction(step) };
  }

  if ((session.state === STATES.ASK || session.state === STATES.HINT) && event.type === "spoken-complete") {
    session.state = STATES.LISTEN;
    record(session, "question-complete");
    return { ok: true, session, action: listenAction() };
  }

  if (session.state === STATES.LISTEN && event.type === "answer") {
    const text = cleanText(event.text, 500);
    session.state = STATES.EVALUATE;
    record(session, "answer", { text });
    return {
      ok: true,
      session,
      action: {
        type: "evaluate",
        purpose: "understanding-check",
        answer: text,
        expectedConcepts: step.expectedConcepts.slice(),
        rule: "Never infer pronunciation quality from free-form transcription. Return pass, partial, fail, or uncertain."
      }
    };
  }

  if (session.state === STATES.LISTEN && event.type === "silence") {
    session.attempt += 1;
    record(session, "silence", { attempt: session.attempt });

    if (session.attempt >= step.maxAttempts) {
      return advanceToNextStep(
        lesson,
        session,
        "That's okay. We can leave this one and come back later."
      );
    }

    session.state = STATES.HINT;
    return {
      ok: true,
      session,
      action: {
        type: "speak",
        purpose: "gentle-retry",
        text: "Take your time. When you're ready, give it a try."
      }
    };
  }

  if (session.state === STATES.EVALUATE && event.type === "evaluation") {
    const outcome = cleanText(event.outcome, 20).toLowerCase();
    record(session, "evaluation", { outcome });

    if (outcome === "pass") {
      return {
        ok: true,
        ...advanceToNextStep(lesson, session, step.successReply)
      };
    }

    session.attempt += 1;

    if (session.attempt >= step.maxAttempts) {
      return {
        ok: true,
        ...advanceToNextStep(
          lesson,
          session,
          outcome === "uncertain"
            ? "I can't be certain from what I heard, so I won't mark it wrong. Let's move on for now."
            : "That's okay. We'll revisit this later in another way."
        )
      };
    }

    const hintIndex = Math.min(session.attempt - 1, Math.max(0, step.hints.length - 1));
    const hint = step.hints[hintIndex] || step.retryReply;
    session.state = STATES.HINT;

    return {
      ok: true,
      session,
      action: {
        type: "speak",
        purpose: "hint",
        text: outcome === "uncertain"
          ? `I couldn't be certain, so I won't call it wrong. ${hint}`
          : hint
      }
    };
  }

  record(session, "ignored-event", { eventType: cleanText(event.type, 50) });
  return { ok: true, session, action: { type: "none" } };
}

module.exports = {
  LESSON_SCHEMA_VERSION,
  SESSION_VERSION,
  STATES,
  validateLessonPlan,
  createSession,
  reduceSession
};
