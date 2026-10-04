"use strict";

const Listen = require("./gini-teacher-listen");
const Brain = require("./gini-assistant-brain");
const Voice = require("./gini-lab-say");
const { pulseHead } = require("./gini-head-pulse");

require("./gini-env");

let stopping = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/जीनी|जिनी|ஜினி/g, "gini")
    .replace(/\bg\s*[-. ]\s*i\s*[-. ]\s*n\s*[-. ]\s*i\b/gi, "gini")
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWake(text) {
  const clean = normalize(text);
  const aliases = ["gini", "ginie", "jeanie", "genie", "ginny", "jini", "jenny"];

  for (const alias of aliases) {
    const re = new RegExp("\\b" + alias + "\\b", "i");
    if (re.test(clean)) {
      const command = clean
        .replace(new RegExp("\\b" + alias + "\\b", "gi"), " ")
        .replace(/\s+/g, " ")
        .trim();
      return { wake: true, command };
    }
  }

  return { wake: false, command: clean };
}

function localCommand(command) {
  const c = normalize(command);

  if (/\b(?:turn|look|move|go)?\s*(?:to\s+the\s+)?left\b/.test(c)) {
    return { reply: "Turning left.", actions: [{ type: "ptz", direction: "left" }], source: "local-command" };
  }
  if (/\b(?:turn|look|move|go)?\s*(?:to\s+the\s+)?right\b/.test(c)) {
    return { reply: "Turning right.", actions: [{ type: "ptz", direction: "right" }], source: "local-command" };
  }
  if (/\b(?:turn|look|move|go)?\s*up\b/.test(c)) {
    return { reply: "Looking up.", actions: [{ type: "ptz", direction: "up" }], source: "local-command" };
  }
  if (/\b(?:turn|look|move|go)?\s*down\b/.test(c)) {
    return { reply: "Looking down.", actions: [{ type: "ptz", direction: "down" }], source: "local-command" };
  }
  if (/\b(?:hello|hi|say hello)\b/.test(c)) {
    return { reply: "Hello. I am Gini.", actions: [], source: "local-command" };
  }
  if (/\b(?:can you hear me|do you hear me|hear me)\b/.test(c)) {
    return { reply: "Yes. I can hear you.", actions: [], source: "local-command" };
  }
  if (/\b(?:sleep|stop listening|go to sleep)\b/.test(c)) {
    return { reply: "Okay. I am going to sleep.", actions: [{ type: "sleep" }], source: "local-command" };
  }

  return null;
}

async function performActions(actions) {
  for (const action of actions || []) {
    if (action.type === "sleep") {
      stopping = true;
      continue;
    }

    if (action.type === "ptz" && ["left", "right", "up", "down"].includes(action.direction)) {
      console.log("AUTONOMY ACTION:", action.direction);
      await pulseHead(action.direction, 90);
    }
  }
}

async function main() {
  console.log("==================================================");
  console.log("GINI AUTONOMY v0.2 - RELIABLE TURN LOOP");
  console.log("==================================================");
  console.log("Uses proven hearing -> Ollama -> speech -> bounded head modules.");
  console.log('Say: "Gini, hello."');
  console.log('Say: "Gini, what is two plus two?"');
  console.log('Say: "Gini, sleep." to stop.');
  console.log("");

  let awaitingCommandUntil = 0;

  while (!stopping) {
    const heard = await Listen.listenOnce({
      language: "auto",
      seconds: 2.8,
      transcribe: true
    });

    if (!heard.ok) {
      console.error("AUTONOMY HEARING ERROR:", heard.error || "unknown");
      await sleep(700);
      continue;
    }

    if (!heard.voiceDetected || !heard.text) {
      console.log(
        "AUTONOMY LISTEN:",
        heard.voiceDetected ? "voice detected, no transcript" : "quiet",
        "maxDb=" + (heard.maxDb == null ? "n/a" : heard.maxDb)
      );
      continue;
    }

    console.log("AUTONOMY HEARD:", heard.text);

    const wake = extractWake(heard.text);

    if (!wake.wake) {
      if (Date.now() < awaitingCommandUntil) {
        wake.wake = true;
        wake.command = normalize(heard.text);
        awaitingCommandUntil = 0;
        console.log("AUTONOMY FOLLOW-UP:", wake.command);
      } else {
        console.log("AUTONOMY: no wake word -> ignored");
        continue;
      }
    }

    console.log("AUTONOMY WAKE: OK");

    if (!wake.command) {
      awaitingCommandUntil = Date.now() + 8000;
      console.log("AUTONOMY: waiting for command after wake word");
      continue;
    }

    const decision = localCommand(wake.command) || await Brain.decide(wake.command);

    console.log("AUTONOMY SOURCE:", decision.source || "unknown");
    console.log("AUTONOMY REPLY:", decision.reply || "(none)");

    if (decision.reply) {
      await Voice.say("en", decision.reply);
    }

    await performActions(decision.actions || []);

    if (!stopping) {
      console.log("AUTONOMY: listening again");
      await sleep(500);
    }
  }

  console.log("GINI AUTONOMY STOPPED");
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

main().catch(error => {
  console.error("GINI AUTONOMY ERROR:", error && error.stack ? error.stack : error.message);
  process.exitCode = 1;
});
