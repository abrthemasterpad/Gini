"use strict";

const readline = require("readline");

const brain = require("./gini-assistant-brain");
const {
  sanitizeDecision,
  redactSecrets
} = require("./gini-assistant-security");

function printDecision(decision) {
  console.log("");
  console.log("GINI:", decision.reply || "(no spoken reply)");
  console.log("SOURCE:", decision.source || "unknown");

  if (decision.actions && decision.actions.length) {
    console.log(
      "SAFE ACTIONS (DRY RUN):",
      decision.actions.map(a => a.key).join(", ")
    );
  } else {
    console.log("SAFE ACTIONS (DRY RUN): none");
  }

  if (decision.memory && decision.memory.length) {
    console.log(
      "MEMORY OPS:",
      decision.memory.map(m => m.op).join(", ")
    );
  }

  console.log("");
}

function selfTest() {
  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      passed++;
      console.log("PASS:", name);
    } else {
      failed++;
      console.log("FAIL:", name);
    }
  }

  const malicious = sanitizeDecision(
    {
      reply: "Okay",
      actions: [
        { type: "shell", command: "del C:\\*" },
        { type: "network", url: "https://example.com" }
      ]
    },
    "do it"
  );

  check("arbitrary shell/network actions blocked", malicious.actions.length === 0);

  const ptz = sanitizeDecision(
    {
      reply: "Turning left.",
      actions: [
        { type: "ptz", direction: "left" }
      ]
    },
    "turn left"
  );

  check(
    "allowed PTZ action preserved",
    ptz.actions.length === 1 && ptz.actions[0].key === "ptz.left"
  );

  const leaked = redactSecrets("api_key=AIza123456789012345678901234567890");
  check("secret-looking values redacted", leaked.includes("[REDACTED]"));

  const mem = sanitizeDecision(
    {
      reply: "saved",
      memory: [
        { op: "remember", text: "secret thing" }
      ]
    },
    "hello",
    { memoryEnabled: true }
  );

  check("memory cannot be written without explicit remember", mem.memory.length === 0);

  console.log("");
  console.log("SELF TEST:", passed, "passed,", failed, "failed");
  process.exitCode = failed ? 1 : 0;
}

async function status() {
  const health = await brain.providerHealth();

  console.log("");
  console.log("GINI AI STATUS");
  console.log("Provider:", brain.config.provider);
  console.log("Model:", brain.config.ollamaModel);
  console.log("Memory:", brain.config.memoryEnabled ? "ON" : "OFF");
  console.log("Health:", health.ok ? "READY" : "NOT READY");
  console.log("Detail:", health.detail);

  if (health.models && health.models.length) {
    console.log("Installed local models:", health.models.join(", "));
  }

  console.log("");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  console.log("==================================================");
  console.log("GINI AI NIGHT CONSOLE v0.4.0");
  console.log("==================================================");
  console.log("Text only. No microphone. No speaker. No PTZ.");
  console.log("AI actions are shown as DRY RUN only.");
  console.log("Commands: /status, /quit");
  console.log("");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "YOU> "
  });

  rl.prompt();

  rl.on("line", async line => {
    const text = line.trim();

    if (!text) {
      rl.prompt();
      return;
    }

    if (text === "/quit" || text === "/exit") {
      rl.close();
      return;
    }

    if (text === "/status") {
      await status();
      rl.prompt();
      return;
    }

    try {
      const decision = await brain.decide(text);
      printDecision(decision);
    } catch (error) {
      console.error("Assistant error:", error.message);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Gini night console closed.");
  });
}
