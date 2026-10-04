"use strict";

const Listen = require("./gini-teacher-listen");
const Brain = require("./gini-assistant-brain");
const Voice = require("./gini-lab-say");
const { pulseHead } = require("./gini-head-pulse");

async function main() {
  const result = {
    hearing: null,
    brain: null,
    speech: null,
    head: null
  };

  console.log("AUTONOMY PROBE START");

  try {
    const heard = await Listen.listenOnce({
      language: "auto",
      seconds: 2.8,
      transcribe: true
    });
    result.hearing = {
      ok: Boolean(heard && heard.ok),
      voiceDetected: Boolean(heard && heard.voiceDetected),
      text: heard && heard.text ? heard.text : "",
      maxDb: heard && heard.maxDb
    };
    console.log("AUTONOMY PROBE HEARING:", JSON.stringify(result.hearing));
  } catch (error) {
    result.hearing = { ok: false, error: error.message };
    console.error("AUTONOMY PROBE HEARING ERROR:", error.message);
  }

  try {
    const decision = await Brain.decide("Say hello briefly.");
    result.brain = {
      ok: Boolean(decision && decision.reply),
      source: decision && decision.source,
      reply: decision && decision.reply
    };
    console.log("AUTONOMY PROBE BRAIN:", JSON.stringify(result.brain));
  } catch (error) {
    result.brain = { ok: false, error: error.message };
    console.error("AUTONOMY PROBE BRAIN ERROR:", error.message);
  }

  try {
    await Voice.say("en", "Autonomy speech test.");
    result.speech = { ok: true };
    console.log("AUTONOMY PROBE SPEECH: OK");
  } catch (error) {
    result.speech = { ok: false, error: error.message };
    console.error("AUTONOMY PROBE SPEECH ERROR:", error.message);
  }

  try {
    await pulseHead("left", 75);
    result.head = { ok: true };
    console.log("AUTONOMY PROBE HEAD: OK");
  } catch (error) {
    result.head = { ok: false, error: error.message };
    console.error("AUTONOMY PROBE HEAD ERROR:", error.message);
  }

  console.log("AUTONOMY PROBE RESULT:", JSON.stringify(result));

  const allOk =
    result.hearing && result.hearing.ok &&
    result.brain && result.brain.ok &&
    result.speech && result.speech.ok &&
    result.head && result.head.ok;

  process.exitCode = allOk ? 0 : 2;
}

main().catch(error => {
  console.error("AUTONOMY PROBE FATAL:", error && error.stack ? error.stack : error.message);
  process.exitCode = 1;
});
