"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) return null;

  const eq = trimmed.indexOf("=");

  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return { key, value };
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    return { loaded: false, path: ENV_FILE };
  }

  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
  let count = 0;

  for (const line of lines) {
    const pair = parseEnvLine(line);

    if (!pair) continue;

    if (process.env[pair.key] === undefined) {
      process.env[pair.key] = pair.value;
      count++;
    }
  }

  return {
    loaded: true,
    path: ENV_FILE,
    count
  };
}

const result = loadEnv();

module.exports = {
  ROOT,
  ENV_FILE,
  result,
  loadEnv
};
