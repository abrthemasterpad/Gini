"use strict";

const path = require("path");
const { spawn } = require("child_process");

require("./gini-env");

const ROOT = path.resolve(__dirname, "..");
const BRIDGE = path.join(ROOT, "scripts", "gini-vision-ptz-bridge.js");

const EXPRESSIONS = {
  yes: {
    label: "Yes nod",
    pulseMs: 85,
    gapMs: 70,
    sequence: ["up", "down", "up", "down", "up", "down"]
  },
  no: {
    label: "No shake",
    pulseMs: 85,
    gapMs: 70,
    sequence: ["left", "right", "left", "right", "left", "right"]
  },
  happy: {
    label: "Happy nod",
    pulseMs: 90,
    gapMs: 85,
    sequence: ["down", "up", "down", "up"]
  },
  acknowledge: {
    label: "Gentle acknowledgement",
    pulseMs: 90,
    gapMs: 100,
    sequence: ["down", "up"]
  },
  curious: {
    label: "Curious look",
    pulseMs: 105,
    gapMs: 260,
    sequence: ["right", "left"]
  },
  thinking: {
    label: "Thinking look",
    pulseMs: 120,
    gapMs: 420,
    sequence: ["right", "left"]
  },
  sorry: {
    label: "Gentle sorry",
    pulseMs: 115,
    gapMs: 320,
    sequence: ["down", "up"]
  },
  hello: {
    label: "Hello",
    pulseMs: 90,
    gapMs: 100,
    sequence: ["left", "right"]
  },
  excited: {
    label: "Excited nod",
    pulseMs: 75,
    gapMs: 55,
    sequence: ["up", "down", "up", "down"]
  },
  attention: {
    label: "Attention",
    pulseMs: 100,
    gapMs: 110,
    sequence: ["up", "down"]
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readArgs() {
  const args = process.argv.slice(2);
  const name = String(args[0] || "").toLowerCase();
  const pulseIndex = args.indexOf("--pulse-ms");
  const pulseOverride =
    pulseIndex >= 0 && args[pulseIndex + 1]
      ? Number(args[pulseIndex + 1])
      : null;

  return { name, pulseOverride };
}

function startBridge(pulseMs) {
  const child = spawn(
    "node.exe",
    [BRIDGE, "--pulse-ms", String(pulseMs), "--speed", "1"],
    {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  return child;
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

async function runExpression(name, options = {}) {
  const spec = EXPRESSIONS[name];

  if (!spec) {
    throw new Error(
      "Unknown expression '" +
      name +
      "'. Available: " +
      Object.keys(EXPRESSIONS).join(", ")
    );
  }

  const requestedPulse = Number(options.pulseMs || spec.pulseMs);
  const pulseMs = Math.max(60, Math.min(140, requestedPulse));
  const gapMs = Math.max(40, Math.min(700, Number(options.gapMs || spec.gapMs)));

  const bridge = startBridge(pulseMs);
  const state = { lines: [], stderr: "" };

  createLineReader(bridge.stdout, line => {
    console.log("[PTZ]", line);
    state.lines.push(line);
  });

  bridge.stderr.on("data", chunk => {
    const text = chunk.toString();
    state.stderr += text;
    process.stderr.write(text);
  });

  let finished = false;

  try {
    const ready = await waitForLine(
      state,
      line => line.startsWith("GINI_PTZ_READY"),
      10000
    );

    if (!ready) {
      throw new Error("PTZ bridge did not become ready.");
    }

    console.log(
      "GINI EXPRESSION:",
      name.toUpperCase(),
      "-",
      spec.label,
      "| pulse=" + pulseMs + "ms"
    );

    for (const direction of spec.sequence) {
      bridge.stdin.write(direction + "\n");

      const ack = await waitForLine(
        state,
        line => line.startsWith("GINI_PTZ_ACK"),
        4500
      );

      if (!ack || ack !== "GINI_PTZ_ACK MOVED " + direction) {
        throw new Error(
          "Expression stopped safely. PTZ acknowledgement failed for " +
          direction +
          (ack ? ": " + ack : ".")
        );
      }

      await sleep(gapMs);
    }

    finished = true;
    console.log("GINI EXPRESSION COMPLETE:", name.toUpperCase());
    return {
      ok: true,
      name,
      label: spec.label,
      pulseMs,
      steps: spec.sequence.length
    };
  } finally {
    try {
      bridge.stdin.write("quit\n");
      bridge.stdin.end();
    } catch {}

    if (!finished) {
      try { bridge.kill(); } catch {}
    }
  }
}

async function main() {
  const { name, pulseOverride } = readArgs();

  if (!name || !EXPRESSIONS[name]) {
    console.log("Usage:");
    console.log("  node .\\scripts\\gini-expression.js yes");
    console.log("  node .\\scripts\\gini-expression.js no");
    console.log("  node .\\scripts\\gini-expression.js happy");
    console.log("");
    console.log("Available:", Object.keys(EXPRESSIONS).join(", "));
    process.exitCode = 2;
    return;
  }

  await runExpression(name, {
    pulseMs: pulseOverride
  });
}

if (require.main === module) {
  main().catch(error => {
    console.error("GINI EXPRESSION ERROR:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPRESSIONS,
  runExpression
};
