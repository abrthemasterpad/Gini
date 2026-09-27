"use strict";

require("./gini-env");

const DEFAULT_MAX_REPLY_CHARS = 320;
const DEFAULT_ACTIONS_PER_MINUTE = 6;

const ALLOWED_ACTIONS = new Set([
  "ptz.left",
  "ptz.right",
  "ptz.up",
  "ptz.down",
  "sleep"
]);

function redactSecrets(value) {
  let text = String(value ?? "");

  const patterns = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    /\bAIza[0-9A-Za-z_-]{20,}\b/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /(password\s*[:=]\s*)[^\s,;]+/gi,
    /(api[_ -]?key\s*[:=]\s*)[^\s,;]+/gi,
    /(token\s*[:=]\s*)[^\s,;]+/gi
  ];

  for (const pattern of patterns) {
    text = text.replace(pattern, "$1[REDACTED]");
  }

  return text;
}

function clipReply(reply, maxChars = DEFAULT_MAX_REPLY_CHARS) {
  const clean = redactSecrets(String(reply ?? "").replace(/\s+/g, " ").trim());

  if (!clean) return "";
  if (clean.length <= maxChars) return clean;

  return clean.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

function normalizeAction(raw) {
  if (!raw || typeof raw !== "object") return null;

  const type = String(raw.type || "").toLowerCase();
  const direction = String(raw.direction || "").toLowerCase();

  if (type === "ptz" && ["left", "right", "up", "down"].includes(direction)) {
    return {
      type: "ptz",
      direction,
      key: "ptz." + direction
    };
  }

  if (type === "sleep") {
    return {
      type: "sleep",
      key: "sleep"
    };
  }

  return null;
}

function isExplicitRemember(text) {
  return /\bremember\b/i.test(String(text || ""));
}

function isExplicitForget(text) {
  return /\bforget\b|\bclear memory\b/i.test(String(text || ""));
}

function sanitizeDecision(decision, userText, options = {}) {
  const maxReplyChars = Number(
    options.maxReplyChars || process.env.GINI_MAX_REPLY_CHARS || DEFAULT_MAX_REPLY_CHARS
  );

  const memoryEnabled =
    options.memoryEnabled === true ||
    process.env.GINI_MEMORY_ENABLED === "1";

  const safe = {
    reply: clipReply(decision && decision.reply, maxReplyChars),
    actions: [],
    memory: []
  };

  const rawActions =
    decision && Array.isArray(decision.actions)
      ? decision.actions
      : [];

  for (const raw of rawActions.slice(0, 2)) {
    const action = normalizeAction(raw);

    if (action && ALLOWED_ACTIONS.has(action.key)) {
      safe.actions.push(action);
    }
  }

  const rawMemory =
    decision && Array.isArray(decision.memory)
      ? decision.memory
      : [];

  if (memoryEnabled) {
    for (const item of rawMemory.slice(0, 2)) {
      if (!item || typeof item !== "object") continue;

      const op = String(item.op || "").toLowerCase();
      const text = redactSecrets(String(item.text || "").trim());

      if (op === "remember" && text && isExplicitRemember(userText)) {
        safe.memory.push({ op: "remember", text: text.slice(0, 240) });
      }

      if (op === "forget" && isExplicitForget(userText)) {
        safe.memory.push({ op: "forget", text: text.slice(0, 240) });
      }
    }
  }

  return safe;
}

function createActionRateLimiter(maxPerMinute) {
  const max = Math.max(
    1,
    Number(maxPerMinute || process.env.GINI_ACTIONS_PER_MINUTE || DEFAULT_ACTIONS_PER_MINUTE)
  );

  const timestamps = [];

  return {
    allow() {
      const now = Date.now();
      const cutoff = now - 60_000;

      while (timestamps.length && timestamps[0] < cutoff) {
        timestamps.shift();
      }

      if (timestamps.length >= max) {
        return false;
      }

      timestamps.push(now);
      return true;
    },

    remaining() {
      const now = Date.now();
      const cutoff = now - 60_000;

      while (timestamps.length && timestamps[0] < cutoff) {
        timestamps.shift();
      }

      return Math.max(0, max - timestamps.length);
    },

    max
  };
}

module.exports = {
  ALLOWED_ACTIONS,
  clipReply,
  redactSecrets,
  sanitizeDecision,
  createActionRateLimiter,
  isExplicitRemember,
  isExplicitForget
};
