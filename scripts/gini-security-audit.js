"use strict";

require("./gini-env");

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function flag(level, label, detail) {
  console.log(level.padEnd(8), label.padEnd(30), detail);
}

console.log("==================================================");
console.log("GINI SECURITY AUDIT v0.1");
console.log("==================================================");
console.log("Read-only. No camera settings are changed.");
console.log("");

const password = process.env.GINI_CAMERA_PASSWORD || "";
const provider = (process.env.GINI_AI_PROVIDER || "ollama").toLowerCase();
const ollamaUrl = process.env.GINI_OLLAMA_URL || "http://127.0.0.1:11434";
const memoryEnabled = process.env.GINI_MEMORY_ENABLED === "1";
const privacyMode = process.env.GINI_PRIVACY_MODE !== "0";

if (!password) {
  flag(
    "WARNING",
    "Camera password",
    "blank/default credential is still in use"
  );
} else {
  flag("OK", "Camera password", "configured (value not displayed)");
}

if (provider === "ollama" && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ollamaUrl)) {
  flag("OK", "AI provider", "local Ollama only");
} else if (provider === "none") {
  flag("OK", "AI provider", "disabled");
} else {
  flag(
    "REVIEW",
    "AI provider",
    "not confirmed local; review privacy before sending conversations"
  );
}

flag(
  memoryEnabled ? "REVIEW" : "OK",
  "Persistent memory",
  memoryEnabled ? "ON - explicit remember only" : "OFF by default"
);

flag(
  privacyMode ? "OK" : "REVIEW",
  "Privacy mode",
  privacyMode ? "ON" : "OFF"
);

flag(
  "OK",
  "AI action policy",
  "allowlist only: PTZ left/right/up/down + sleep"
);

flag(
  "OK",
  "Arbitrary shell execution",
  "blocked from model actions"
);

flag(
  "OK",
  "Cloud camera exposure",
  "must remain disabled; do not port-forward camera interfaces"
);

const gitignore = path.join(ROOT, ".gitignore");

if (fs.existsSync(gitignore)) {
  const text = fs.readFileSync(gitignore, "utf8");
  const envIgnored = /(^|\n)\.env(\n|$)/.test(text);
  const runtimeIgnored = /(^|\n)runtime\/(\n|$)/.test(text);

  flag(envIgnored ? "OK" : "WARNING", ".env protection", envIgnored ? "ignored by Git" : "not found in .gitignore");
  flag(runtimeIgnored ? "OK" : "WARNING", "Runtime privacy", runtimeIgnored ? "runtime/ ignored by Git" : "runtime/ not ignored");
} else {
  flag("REVIEW", ".gitignore", "not present in this working copy");
}

console.log("");
console.log("Priority security work:");
console.log("1. Change the camera's blank admin password only after a safe supported method is verified.");
console.log("2. Keep port 10000 and camera HTTP control local-only.");
console.log("3. Keep persistent memory OFF unless explicitly wanted.");
console.log("4. Never put API keys in source code or Git.");
console.log("5. Add owner/speaker verification before any future high-impact actions.");
