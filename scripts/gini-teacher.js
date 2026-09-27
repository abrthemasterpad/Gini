"use strict";

const readline = require("readline");

require("./gini-env");

const Voice = require("./gini-teacher-voice");
const Lessons = require("./gini-teacher-lessons");

const TAMIL_VOICE = process.env.GINI_TEACHER_TAMIL_VOICE || "female";
const TARGET_DELIVERY = process.env.GINI_TEACHER_TARGET_DELIVERY || "clear";
const TAMIL_DELIVERY = process.env.GINI_TEACHER_TAMIL_DELIVERY || "natural";

function usage() {
  console.log("");
  console.log("Gini Teacher v0.1");
  console.log("");
  console.log("Commands:");
  console.log("  node .\\scripts\\gini-teacher.js status");
  console.log("  node .\\scripts\\gini-teacher.js demo hi       # one-word hardware test");
  console.log("  node .\\scripts\\gini-teacher.js demo ja       # one-word hardware test");
  console.log("  node .\\scripts\\gini-teacher.js lesson hi");
  console.log("  node .\\scripts\\gini-teacher.js lesson ja");
  console.log("");
  console.log("hi = Hindi, ja = Japanese");
  console.log("Arabic is deliberately not enabled until a local Arabic voice passes the same fit test.");
  console.log("");
}

async function speakTamil(text) {
  console.log("Gini [Tamil]:", text);

  return Voice.speak({
    language: "ta",
    voice: TAMIL_VOICE,
    delivery: TAMIL_DELIVERY,
    preset: "storyteller",
    speed: 0.96,
    mode: "standard",
    text
  });
}

async function speakTarget(lesson, item) {
  console.log(
    "Gini [" + lesson.name + "]:",
    item.target,
    "(" + item.roman + ")"
  );

  return Voice.speak({
    language: lesson.language,
    voice: lesson.voice,
    delivery: TARGET_DELIVERY,
    preset: "storyteller",
    speed: 0.88,
    mode: "standard",
    text: item.target
  });
}

function waitForEnter(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function status() {
  console.log("=".repeat(58));
  console.log("GINI TEACHER v0.1 - STATUS");
  console.log("=".repeat(58));
  console.log("Rebuildo:", Voice.config.rebuildoUrl);

  const health = await Voice.health();

  if (!health.ok) {
    console.log("Rebuildo voice server: NOT READY");
    console.log("Reason:", health.error || "health check failed");
    console.log("");
    console.log("Start Rebuildo renderer first:");
    console.log("  cd D:\\Rebuildo\\renderer");
    console.log("  npm start");
    process.exitCode = 2;
    return;
  }

  console.log("Rebuildo voice server: READY");
  console.log("Tamil Voice Artist:", health.tamilVoiceArtist || "unknown");
  console.log("Kokoro Voice Artist:", health.voiceArtist || "unknown");

  try {
    const catalog = await Voice.catalog();
    const languages = catalog.languages || {};

    for (const code of ["ta", "hi", "ja"]) {
      const item = languages[code];
      console.log(
        "  " + code + " " +
        (item ? item.label : "unknown") +
        ": " +
        (item && item.ready ? "READY" : "NOT READY")
      );
    }
  } catch (error) {
    console.log("Language readiness check failed:", error.message);
  }

  console.log("");
  console.log("Teacher lessons:");

  for (const lesson of Lessons.listLessons()) {
    console.log("  " + lesson.id + "  " + lesson.name + "  " + lesson.items + " words");
  }

  console.log("  ar  Arabic  planned - local voice not selected yet");
}

async function runLesson(languageId, interactive, maxItems = null) {
  const lesson = Lessons.getLesson(languageId);

  if (!lesson) {
    if (String(languageId || "").toLowerCase() === "ar" ||
        String(languageId || "").toLowerCase() === "arabic") {
      throw new Error(
        "Arabic is not enabled yet. We will add it only after a local Arabic TTS engine passes the Gini/Rebuildo fit test."
      );
    }

    throw new Error("Unknown lesson: " + languageId);
  }

  const health = await Voice.health();

  if (!health.ok) {
    throw new Error(
      "Rebuildo voice server is not ready at " +
      Voice.config.rebuildoUrl +
      ". Start D:\\Rebuildo\\renderer with npm start."
    );
  }

  console.log("");
  console.log("=".repeat(58));
  console.log("GINI TEACHER v0.1 - " + lesson.name.toUpperCase());
  console.log("Tamil explanation -> native target voice -> repeat");
  console.log("Pronunciation scoring: OFF in v0.1");
  console.log("=".repeat(58));
  console.log("");

  await speakTamil(lesson.introTamil);

  const items = maxItems == null
    ? lesson.items
    : lesson.items.slice(0, Math.max(1, maxItems));

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    console.log("");
    console.log(
      "[" + (index + 1) + "/" + items.length + "] " +
      item.meaningTamil + " -> " + item.target + " / " + item.roman
    );

    await speakTamil(item.promptTamil);
    await speakTarget(lesson, item);

    await speakTamil("இப்போது நீ சொல்லிப் பார்.");

    if (interactive) {
      await waitForEnter(
        "Child repeats now. Press ENTER after the child finishes..."
      );

      // v0.1 deliberately avoids fake pronunciation grading.
      await speakTamil("சூப்பர். இன்னொரு முறை கேட்டு சொல்லிப் பார்.");
      await speakTarget(lesson, item);
      await waitForEnter("Repeat once more, then press ENTER...");
    }
  }

  await speakTamil(lesson.outroTamil);

  console.log("");
  console.log("Lesson complete.");
  console.log("No pronunciation score was invented.");
}

async function main() {
  const command = String(process.argv[2] || "status").toLowerCase();
  const language = String(process.argv[3] || "hi").toLowerCase();
  const requestedCount = Number(process.argv[4] || 1);

  if (command === "status") {
    await status();
    return;
  }

  if (command === "demo") {
    await runLesson(
      language,
      false,
      Number.isFinite(requestedCount) ? requestedCount : 1
    );
    return;
  }

  if (command === "lesson") {
    await runLesson(language, true, null);
    return;
  }

  usage();
  process.exitCode = 2;
}

main().catch(error => {
  console.error("");
  console.error("GINI TEACHER ERROR:", error.message);
  process.exitCode = 1;
});
