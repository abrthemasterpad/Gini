"use strict";

const path = require("path");
const { spawn } = require("child_process");

require("./gini-env");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE = path.join(ROOT, "scripts", "gini-vision-ptz-bridge.js");
const DIRECTIONS = new Set(["up", "down", "left", "right"]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const direction = String(args[0] || "").toLowerCase();
  const pulseIndex = args.indexOf("--pulse-ms");
  const pulseMs = Math.max(
    60,
    Math.min(
      140,
      Number(
        pulseIndex >= 0 && args[pulseIndex + 1]
          ? args[pulseIndex + 1]
          : 90
      )
    )
  );

  if (!DIRECTIONS.has(direction)) {
    throw new Error("Direction must be up, down, left or right.");
  }

  return { direction, pulseMs };
}

function createLineReader(stream, onLine) {
  let buffer = "";

  stream.on("data", chunk => {
    buffer += chunk.toString();

    while (true) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;

      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);

      if (line) onLine(line);
    }
  });
}

async function waitForLine(state, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (let i = 0; i < state.lines.length; i++) {
      const line = state.lines[i];

      if (predicate(line)) {
        state.lines.splice(0, i + 1);
        return line;
      }
    }

    await sleep(20);
  }

  return null;
}

async function pulseHead(direction, pulseMs) {
  const bridge = spawn(
    "node.exe",
    [BRIDGE, "--pulse-ms", String(pulseMs), "--speed", "1"],
    {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  const state = { lines: [] };

  createLineReader(bridge.stdout, line => {
    console.log("[PTZ]", line);
    state.lines.push(line);
  });

  bridge.stderr.on("data", chunk => process.stderr.write(chunk));

  try {
    const ready = await waitForLine(
      state,
      line => line.startsWith("GINI_PTZ_READY"),
      10000
    );

    if (!ready) {
      throw new Error("PTZ bridge did not become ready.");
    }

    bridge.stdin.write(direction + "\n");

    const ack = await waitForLine(
      state,
      line => line.startsWith("GINI_PTZ_ACK"),
      4500
    );

    if (ack !== "GINI_PTZ_ACK MOVED " + direction) {
      throw new Error(
        "PTZ acknowledgement failed" + (ack ? ": " + ack : ".")
      );
    }

    console.log(
      "GINI HEAD PULSE COMPLETE:",
      JSON.stringify({ direction, pulseMs, speed: 1 })
    );

    return { ok: true, direction, pulseMs, speed: 1 };
  } finally {
    try {
      bridge.stdin.write("quit\n");
      bridge.stdin.end();
    } catch {}

    setTimeout(() => {
      try { bridge.kill(); } catch {}
    }, 1000);
  }
}

async function main() {
  const args = parseArgs();
  await pulseHead(args.direction, args.pulseMs);
}

if (require.main === module) {
  main().catch(error => {
    console.error("GINI HEAD PULSE ERROR:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { pulseHead };
