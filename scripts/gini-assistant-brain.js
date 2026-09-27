"use strict";

require("./gini-env");

const {
  sanitizeDecision,
  redactSecrets
} = require("./gini-assistant-security");

const memory = require("./gini-assistant-memory");
const Skills = require("./gini-skills");

const PROVIDER = (process.env.GINI_AI_PROVIDER || "ollama").toLowerCase();
const OLLAMA_URL = process.env.GINI_OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.GINI_OLLAMA_MODEL || "qwen3:0.6b";
const AI_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.GINI_AI_TIMEOUT_MS || 35_000)
);

function memoryContext() {
  const items = memory.summary(8);

  if (!items.length) return "No saved user memory is available.";

  return [
    "The user explicitly chose to save these local memories:",
    ...items.map((item, index) => (index + 1) + ". " + item)
  ].join("\n");
}

function systemPrompt() {
  return `
You are Gini, a small local robot assistant.

Personality:
- Helpful, concise and friendly.
- Speak naturally in short sentences because replies are played through a small camera speaker.
- Do not claim an action happened unless you return that action in the JSON.
- If you are unsure, say so briefly.

SECURITY RULES:
- Output JSON only.
- Never output shell commands as actions.
- Never request or reveal passwords, API keys, tokens or private credentials.
- Never create file, network, browser, payment, purchase, message, account or system-control actions.
- The only allowed physical actions are:
  {"type":"ptz","direction":"left"}
  {"type":"ptz","direction":"right"}
  {"type":"ptz","direction":"up"}
  {"type":"ptz","direction":"down"}
  {"type":"sleep"}
- Use at most two actions.
- Do not persist memory unless the user explicitly says "remember".
- Do not forget memory unless the user explicitly asks to forget it.
- Avoid sensitive information in memory.
- For anything high impact, give an informational reply only; do not pretend to execute it.

Return exactly this JSON shape:
{
  "reply": "short spoken reply",
  "actions": [],
  "memory": []
}

Memory entries, only when explicitly requested, use:
{"op":"remember","text":"..."}
{"op":"forget","text":"..."}

${memoryContext()}
`.trim();
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }

  throw new Error("AI returned invalid JSON");
}

async function ollamaDecision(userText) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
          num_predict: 180
        },
        messages: [
          {
            role: "system",
            content: systemPrompt()
          },
          {
            role: "user",
            content: redactSecrets(userText)
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error("Ollama HTTP " + response.status);
    }

    const payload = await response.json();
    const content =
      payload &&
      payload.message &&
      typeof payload.message.content === "string"
        ? payload.message.content
        : "";

    return parseJsonLoose(content);
  } finally {
    clearTimeout(timeout);
  }
}

async function providerHealth() {
  if (PROVIDER === "none") {
    return {
      ok: true,
      provider: "none",
      detail: "AI provider disabled"
    };
  }

  if (PROVIDER !== "ollama") {
    return {
      ok: false,
      provider: PROVIDER,
      detail: "Unsupported provider"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(
      OLLAMA_URL.replace(/\/$/, "") + "/api/tags",
      { signal: controller.signal }
    );

    if (!response.ok) {
      return {
        ok: false,
        provider: "ollama",
        detail: "HTTP " + response.status
      };
    }

    const payload = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models.map(m => m.name).filter(Boolean)
      : [];

    const exact =
      models.includes(OLLAMA_MODEL) ||
      models.some(name => name.split(":")[0] === OLLAMA_MODEL.split(":")[0]);

    return {
      ok: exact,
      provider: "ollama",
      model: OLLAMA_MODEL,
      detail: exact
        ? "local model available"
        : "Ollama is running but model is not installed",
      models
    };
  } catch (error) {
    return {
      ok: false,
      provider: "ollama",
      model: OLLAMA_MODEL,
      detail: error.name === "AbortError"
        ? "local Ollama health check timed out"
        : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function explicitMemoryDecision(userText) {
  const text = String(userText || "").trim();

  const rememberMatch = text.match(/\bremember(?:\s+that)?\s+(.+)/i);

  if (rememberMatch) {
    if (!memory.enabled()) {
      return {
        reply: "Memory is off. Enable it only if you want me to save things locally.",
        actions: [],
        memory: []
      };
    }

    return {
      reply: "Okay. I can remember that locally.",
      actions: [],
      memory: [
        {
          op: "remember",
          text: rememberMatch[1].trim()
        }
      ]
    };
  }

  if (/\bwhat do you remember\b|\bshow memory\b/i.test(text)) {
    if (!memory.enabled()) {
      return {
        reply: "Memory is currently off.",
        actions: [],
        memory: []
      };
    }

    const items = memory.summary(5);

    return {
      reply: items.length
        ? "I remember: " + items.join("; ")
        : "I do not have any saved memories yet.",
      actions: [],
      memory: []
    };
  }

  const forgetMatch = text.match(/\bforget(?:\s+that)?\s*(.*)/i);

  if (forgetMatch) {
    if (!memory.enabled()) {
      return {
        reply: "Memory is already off.",
        actions: [],
        memory: []
      };
    }

    const target = forgetMatch[1].trim() || "all";

    return {
      reply: "Okay. I will remove the matching local memory.",
      actions: [],
      memory: [
        {
          op: "forget",
          text: target
        }
      ]
    };
  }

  return null;
}

function applyMemoryOperations(decision) {
  for (const item of decision.memory || []) {
    if (item.op === "remember") {
      memory.remember(item.text);
    }

    if (item.op === "forget") {
      memory.forget(item.text);
    }
  }
}

async function decide(userText) {
  const skill = Skills.matchSkill(userText);

  if (skill.matched) {
    return {
      reply: skill.reply,
      actions: skill.actions || [],
      memory: [],
      source: "local-skill",
      skill: skill.name
    };
  }

  const explicit = explicitMemoryDecision(userText);

  if (explicit) {
    const safe = sanitizeDecision(explicit, userText, {
      memoryEnabled: memory.enabled()
    });
    applyMemoryOperations(safe);
    return {
      ...safe,
      source: "local-memory"
    };
  }

  if (PROVIDER === "none") {
    return {
      reply: "My AI brain is offline, but my local camera commands still work.",
      actions: [],
      memory: [],
      source: "fallback"
    };
  }

  if (PROVIDER !== "ollama") {
    return {
      reply: "My configured AI provider is not supported yet.",
      actions: [],
      memory: [],
      source: "fallback"
    };
  }

  try {
    const raw = await ollamaDecision(userText);
    const safe = sanitizeDecision(raw, userText, {
      memoryEnabled: memory.enabled()
    });

    applyMemoryOperations(safe);

    if (!safe.reply && safe.actions.length === 0) {
      safe.reply = "I am not sure what you want me to do.";
    }

    return {
      ...safe,
      source: "ollama"
    };
  } catch (error) {
    return {
      reply: "My local AI brain is unavailable right now, but my basic commands still work.",
      actions: [],
      memory: [],
      source: "fallback",
      error: error.message
    };
  }
}

module.exports = {
  decide,
  providerHealth,
  config: {
    provider: PROVIDER,
    ollamaUrl: OLLAMA_URL,
    ollamaModel: OLLAMA_MODEL,
    memoryEnabled: memory.enabled()
  }
};
