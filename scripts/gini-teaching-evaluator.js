"use strict";

require("./gini-env");

const OLLAMA_URL = process.env.GINI_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.GINI_TEACHING_MODEL || process.env.GINI_OLLAMA_MODEL || "qwen3:0.6b";
const TIMEOUT_MS = Math.max(3000, Number(process.env.GINI_TEACHING_EVAL_TIMEOUT_MS || 15000));
const VALID_OUTCOMES = new Set(["pass", "partial", "fail", "uncertain"]);

function normalize(value) {
  return String(value == null ? "" : value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value, max = 220) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function isExplicitDontKnow(text) {
  const clean = normalize(text);
  if (!clean) return false;
  return /^(i )?(do not|don t|dont) know$/.test(clean) ||
    /^(not sure|no idea|i am not sure|i m not sure)$/.test(clean) ||
    /^(தெரியாது|எனக்கு தெரியாது)$/.test(clean) ||
    /^(मुझे नहीं पता|पता नहीं)$/.test(clean);
}

function hasNearbyNegation(answer, concept) {
  const a = normalize(answer);
  const c = normalize(concept);
  const index = a.indexOf(c);
  if (index < 0) return false;
  const before = a.slice(Math.max(0, index - 24), index);
  return /\b(no|not|isnt|isn't|wasnt|wasn't|never)\b/.test(before);
}

function deterministicEvaluation({ answer, expectedConcepts }) {
  const clean = normalize(answer);
  const concepts = Array.isArray(expectedConcepts)
    ? expectedConcepts.map(normalize).filter(Boolean)
    : [];

  if (!clean) {
    return { resolved: false, outcome: "uncertain", reason: "empty-answer", source: "deterministic" };
  }

  if (isExplicitDontKnow(clean)) {
    return { resolved: true, outcome: "fail", reason: "explicit-dont-know", source: "deterministic" };
  }

  const direct = concepts.find(concept => clean === concept || clean.includes(concept));
  if (direct) {
    const original = (expectedConcepts || []).find(item => normalize(item) === direct) || direct;
    if (!hasNearbyNegation(clean, direct)) {
      return {
        resolved: true,
        outcome: "pass",
        reason: "expected-concept-present",
        matchedConcept: compact(original, 120),
        source: "deterministic"
      };
    }
  }

  return { resolved: false, outcome: "uncertain", reason: "semantic-review-needed", source: "deterministic" };
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("evaluator returned invalid JSON");
}

function sanitizeModelResult(raw) {
  const outcome = normalize(raw && raw.outcome).replace(/\s+/g, "");
  if (!VALID_OUTCOMES.has(outcome)) {
    return { ok: false, outcome: "uncertain", reason: "invalid-model-outcome", source: "semantic" };
  }
  return {
    ok: true,
    outcome,
    reason: compact(raw && raw.reason, 220) || "semantic-evaluation",
    source: "semantic"
  };
}

async function ollamaSemanticReview(input) {
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
        options: { temperature: 0, num_predict: 180 },
        messages: [
          {
            role: "system",
            content: [
              "You evaluate a child's conceptual understanding for Gini Teaching Mode.",
              "Output JSON only: {\"outcome\":\"pass|partial|fail|uncertain\",\"reason\":\"short reason\"}.",
              "Judge meaning only, not accent, pronunciation, grammar, confidence, age, intelligence, or personality.",
              "Do not call an answer wrong when transcription ambiguity makes the meaning unclear.",
              "Use uncertain when evidence is insufficient.",
              "Use partial only when the answer demonstrates some but not enough of the requested concept."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              question: compact(input.question, 240),
              answer: compact(input.answer, 500),
              expectedConcepts: Array.isArray(input.expectedConcepts)
                ? input.expectedConcepts.map(x => compact(x, 120)).filter(Boolean).slice(0, 8)
                : []
            })
          }
        ]
      })
    });
    if (!response.ok) throw new Error("Ollama HTTP " + response.status);
    const payload = await response.json();
    return parseJsonLoose(payload && payload.message && payload.message.content);
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateUnderstanding(input, options = {}) {
  const answer = compact(input && input.answer, 500);
  const expectedConcepts = Array.isArray(input && input.expectedConcepts)
    ? input.expectedConcepts.map(x => compact(x, 120)).filter(Boolean).slice(0, 8)
    : [];

  if (!expectedConcepts.length) {
    return { outcome: "uncertain", reason: "no-expected-concepts", source: "guard" };
  }

  const direct = deterministicEvaluation({ answer, expectedConcepts });
  if (direct.resolved) {
    const { resolved, ...result } = direct;
    return result;
  }

  const semanticReview = options.semanticReview || ollamaSemanticReview;
  try {
    const raw = await semanticReview({
      question: compact(input && input.question, 240),
      answer,
      expectedConcepts
    });
    const checked = sanitizeModelResult(raw);
    if (!checked.ok) {
      return { outcome: "uncertain", reason: checked.reason, source: checked.source };
    }
    return { outcome: checked.outcome, reason: checked.reason, source: checked.source };
  } catch (error) {
    return {
      outcome: "uncertain",
      reason: error && error.name === "AbortError" ? "semantic-review-timeout" : "semantic-review-unavailable",
      source: "fallback"
    };
  }
}

module.exports = {
  VALID_OUTCOMES,
  normalize,
  isExplicitDontKnow,
  deterministicEvaluation,
  parseJsonLoose,
  sanitizeModelResult,
  evaluateUnderstanding,
  config: { ollamaUrl: OLLAMA_URL, model: OLLAMA_MODEL, timeoutMs: TIMEOUT_MS }
};
