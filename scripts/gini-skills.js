"use strict";

require("./gini-env");

const os = require("os");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(ROOT, "runtime");
const NOTES_FILE = path.join(RUNTIME, "gini-notes.json");

function compactNumber(n) {
  return Math.round(Number(n) * 10) / 10;
}

function formatBytes(bytes) {
  const gb = bytes / (1024 ** 3);
  return compactNumber(gb) + " GB";
}

function safeLoadNotes() {
  try {
    const parsed = JSON.parse(fs.readFileSync(NOTES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeSaveNotes(notes) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const temp = NOTES_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(notes, null, 2), "utf8");
  fs.renameSync(temp, NOTES_FILE);
}

function addNote(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);

  if (!clean) {
    return { ok: false, reply: "I did not catch the note." };
  }

  const notes = safeLoadNotes();
  notes.push({
    id: Date.now().toString(36),
    text: clean,
    createdAt: new Date().toISOString()
  });

  safeSaveNotes(notes.slice(-100));

  return {
    ok: true,
    reply: "Saved that note locally."
  };
}

function listNotes(limit = 5) {
  const notes = safeLoadNotes().slice(-Math.max(1, Math.min(10, limit)));

  if (!notes.length) {
    return "You do not have any saved notes.";
  }

  return "Your latest notes are: " + notes.map(n => n.text).join("; ");
}

function clearNotes() {
  const count = safeLoadNotes().length;
  safeSaveNotes([]);
  return count;
}

function localTimeReply() {
  const now = new Date();

  return "It is " +
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
    " on " +
    now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) +
    ".";
}

function systemStatusReply() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const usedPct = total ? Math.round((used / total) * 100) : 0;
  const mins = Math.round(os.uptime() / 60);

  return [
    "The PC has",
    formatBytes(total),
    "RAM with about",
    usedPct + "%",
    "in use.",
    "System uptime is about",
    mins,
    "minutes."
  ].join(" ");
}

function capabilitiesReply() {
  return [
    "I can listen through the camera mic,",
    "move my head left right up and down,",
    "speak through the camera speaker,",
    "answer with my local AI brain,",
    "tell the time and PC status,",
    "and save local notes when you explicitly ask."
  ].join(" ");
}

function matchSkill(input) {
  const text = String(input || "").trim();
  const lower = text.toLowerCase();

  if (/\b(what time is it|tell me the time|current time)\b/.test(lower)) {
    return {
      matched: true,
      name: "time",
      reply: localTimeReply(),
      actions: []
    };
  }

  if (/\b(system status|pc status|computer status|ram usage|memory usage)\b/.test(lower)) {
    return {
      matched: true,
      name: "system-status",
      reply: systemStatusReply(),
      actions: []
    };
  }

  if (/\b(what can you do|your capabilities|what are your skills)\b/.test(lower)) {
    return {
      matched: true,
      name: "capabilities",
      reply: capabilitiesReply(),
      actions: []
    };
  }

  const noteMatch = text.match(/\b(?:save a note|take a note|note that)\s+(.+)/i);

  if (noteMatch) {
    const result = addNote(noteMatch[1]);
    return {
      matched: true,
      name: "note-save",
      reply: result.reply,
      actions: []
    };
  }

  if (/\b(show my notes|read my notes|what are my notes|latest notes)\b/i.test(text)) {
    return {
      matched: true,
      name: "note-list",
      reply: listNotes(5),
      actions: []
    };
  }

  if (/\b(clear my notes|delete all my notes)\b/i.test(text)) {
    const count = clearNotes();

    return {
      matched: true,
      name: "note-clear",
      reply: count
        ? "Cleared your local notes."
        : "There were no local notes to clear.",
      actions: []
    };
  }

  return {
    matched: false,
    name: "",
    reply: "",
    actions: []
  };
}

module.exports = {
  matchSkill,
  addNote,
  listNotes,
  clearNotes,
  NOTES_FILE
};
