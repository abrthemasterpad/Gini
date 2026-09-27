"use strict";

require("./gini-env");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime");
const MEMORY_FILE =
  process.env.GINI_MEMORY_FILE ||
  path.join(RUNTIME, "gini-memory.json");

function enabled() {
  return process.env.GINI_MEMORY_ENABLED === "1";
}

function ensureRuntime() {
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
}

function load() {
  if (!enabled()) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items) {
  if (!enabled()) return;

  ensureRuntime();

  const temp = MEMORY_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(items, null, 2), "utf8");
  fs.renameSync(temp, MEMORY_FILE);
}

function remember(text) {
  if (!enabled()) {
    return { ok: false, reason: "memory-disabled" };
  }

  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 240);

  if (!clean) {
    return { ok: false, reason: "empty" };
  }

  const items = load();

  if (items.some(item => item.text.toLowerCase() === clean.toLowerCase())) {
    return { ok: true, duplicate: true };
  }

  items.push({
    id: crypto.randomUUID(),
    text: clean,
    createdAt: new Date().toISOString()
  });

  save(items.slice(-50));
  return { ok: true };
}

function forget(query) {
  if (!enabled()) {
    return { ok: false, reason: "memory-disabled" };
  }

  const q = String(query || "").trim().toLowerCase();
  const items = load();

  if (!q || q === "all" || q === "everything") {
    save([]);
    return { ok: true, removed: items.length };
  }

  const kept = items.filter(item => !item.text.toLowerCase().includes(q));
  save(kept);

  return {
    ok: true,
    removed: items.length - kept.length
  };
}

function summary(limit = 8) {
  if (!enabled()) return [];

  return load()
    .slice(-Math.max(1, Math.min(20, Number(limit) || 8)))
    .map(item => item.text);
}

module.exports = {
  enabled,
  load,
  remember,
  forget,
  summary,
  MEMORY_FILE
};
