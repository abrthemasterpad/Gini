"use strict";

require("./gini-env");

const { LESSON_SCHEMA_VERSION, validateLessonPlan } = require("./gini-teaching-core");

const OLLAMA_URL = process.env.GINI_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.GINI_TEACHING_MODEL || process.env.GINI_OLLAMA_MODEL || "qwen3:0.6b";
const TIMEOUT_MS = Math.max(5000, Number(process.env.GINI_TEACHING_AI_TIMEOUT_MS || 35000));

function clampText(value, max = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(raw.slice(first, last + 1));
  }

  throw new Error("planner returned invalid JSON");
}

async function ollamaJson(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.15, num_predict: 900 },
        messages
      })
    });

    if (!response.ok) throw new Error("Ollama HTTP " + response.status);
    const payload = await response.json();
    const content = payload && payload.message && payload.message.content;
    return parseJsonLoose(content);
  } finally {
    clearTimeout(timeout);
  }
}

function outlinePrompt({ topic, ageBand, language, supportLanguage, stepCount }) {
  return `Create a child-safe teaching outline for Gini, a physical robot tutor.\n\nTopic: ${topic}\nAge band: ${ageBand}\nTeaching language: ${language}\nSupport language: ${supportLanguage}\nNumber of small concepts: ${stepCount}\n\nRules:\n- One small concept at a time.\n- Prefer understanding over memorization.\n- Never invent facts. If the topic is ambiguous, set abstain=true.\n- No pronunciation scoring.\n- Keep each concept concrete and age-appropriate.\n\nReturn JSON only:\n{\n  "abstain": false,\n  "reason": "",\n  "objective": "...",\n  "concepts": ["..."],\n  "intro": "..."\n}`;
}

function detailPrompt({ topic, ageBand, language, supportLanguage, outline }) {
  return `Expand this verified teaching outline into a Gini lesson.\n\nTopic: ${topic}\nAge band: ${ageBand}\nTeaching language: ${language}\nSupport language: ${supportLanguage}\nObjective: ${outline.objective}\nConcepts: ${outline.concepts.join(" | ")}\n\nReturn JSON only using exactly this structure:\n{\n  "schemaVersion": "${LESSON_SCHEMA_VERSION}",\n  "id": "short-stable-id",\n  "topic": "${topic}",\n  "language": "${language}",\n  "supportLanguage": "${supportLanguage}",\n  "ageBand": "${ageBand}",\n  "objective": "${outline.objective}",\n  "intro": "${outline.intro}",\n  "steps": [\n    {\n      "id": "step-1",\n      "concept": "one concept",\n      "teach": "short explanation",\n      "question": "one understanding question",\n      "expectedConcepts": ["idea that shows understanding"],\n      "hints": ["gentle hint"],\n      "successReply": "specific acknowledgement",\n      "retryReply": "simpler retry",\n      "maxAttempts": 2\n    }\n  ]\n}\n\nSafety rules:\n- Do not create facts that were not required by the outline.\n- Do not shame, scold, or call uncertain speech wrong.\n- Questions must test understanding, not pronunciation.\n- 1 to 10 steps only.\n- Keep spoken text short enough for a small speaker.`;
}

async function generateLesson(topicInput, options = {}) {
  const topic = clampText(topicInput, 180);
  if (!topic) return { ok: false, stage: "input", error: "topic is required" };

  const ageBand = clampText(options.ageBand || "6-8", 40);
  const language = clampText(options.language || "en", 20).toLowerCase();
  const supportLanguage = clampText(options.supportLanguage || "ta", 20).toLowerCase();
  const stepCount = Math.max(1, Math.min(8, Number(options.stepCount) || 5));

  let outline;
  try {
    outline = await ollamaJson([
      { role: "system", content: "You design concise, factual child lessons. JSON only." },
      { role: "user", content: outlinePrompt({ topic, ageBand, language, supportLanguage, stepCount }) }
    ]);
  } catch (error) {
    return { ok: false, stage: "outline", error: error.message };
  }

  const concepts = Array.isArray(outline && outline.concepts)
    ? outline.concepts.map(x => clampText(x, 160)).filter(Boolean).slice(0, 8)
    : [];

  if (outline && outline.abstain) {
    return {
      ok: false,
      stage: "outline",
      abstained: true,
      error: clampText(outline.reason || "planner abstained", 240)
    };
  }

  if (!clampText(outline && outline.objective, 300) || concepts.length < 1) {
    return {
      ok: false,
      stage: "outline",
      error: "outline failed validation"
    };
  }

  const safeOutline = {
    objective: clampText(outline.objective, 300),
    intro: clampText(outline.intro || "Let's learn this one small step at a time.", 300),
    concepts
  };

  let detailed;
  try {
    detailed = await ollamaJson([
      { role: "system", content: "You expand a supplied outline without adding unsupported claims. JSON only." },
      { role: "user", content: detailPrompt({ topic, ageBand, language, supportLanguage, outline: safeOutline }) }
    ]);
  } catch (error) {
    return { ok: false, stage: "detail", error: error.message, outline: safeOutline };
  }

  const checked = validateLessonPlan(detailed);
  if (!checked.ok) {
    return {
      ok: false,
      stage: "validation",
      error: "generated lesson failed validation",
      errors: checked.errors,
      outline: safeOutline
    };
  }

  return {
    ok: true,
    stage: "complete",
    lesson: checked.lesson,
    outline: safeOutline,
    provider: "ollama",
    model: OLLAMA_MODEL
  };
}

module.exports = {
  parseJsonLoose,
  generateLesson,
  config: {
    ollamaUrl: OLLAMA_URL,
    model: OLLAMA_MODEL,
    timeoutMs: TIMEOUT_MS
  }
};
