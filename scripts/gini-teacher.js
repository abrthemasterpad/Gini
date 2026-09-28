"use strict";

require("./gini-env");

const Voice = require("./gini-teacher-voice");
const Listen = require("./gini-teacher-listen");
const Lessons = require("./gini-teacher-lessons");

const TAMIL_VOICE = process.env.GINI_TEACHER_TAMIL_VOICE || "female";
const TARGET_DELIVERY = process.env.GINI_TEACHER_TARGET_DELIVERY || "clear";
const TAMIL_DELIVERY = process.env.GINI_TEACHER_TAMIL_DELIVERY || "natural";
const CHILD_LISTEN_SECONDS = Number(
  process.env.GINI_TEACHER_LISTEN_SECONDS || 2.6
);
const TRANSCRIBE_CHILD = process.env.GINI_TEACHER_TRANSCRIBE === "1";

function usage() {
  console.log("");
  console.log("Gini Teacher v0.3 - natural hands-free lesson");
  console.log("");
  console.log("Commands:");
  console.log("  node .\\scripts\\gini-teacher.js status");
  console.log("  node .\\scripts\\gini-teacher.js demo hi");
  console.log("  node .\\scripts\\gini-teacher.js demo ja");
  console.log("  node .\\scripts\\gini-teacher.js lesson hi");
  console.log("  node .\\scripts\\gini-teacher.js lesson ja");
  console.log("");
  console.log("demo = one word");
  console.log("lesson = all 5 words");
  console.log("No keyboard interaction is required during a lesson.");
  console.log("");
}

function tamilLanguageName(lesson) {
  return lesson.id === "ja" ? "ஜப்பானிய" : "ஹிந்தி";
}

function tamilSegment(text) {
  return {
    language: "ta",
    voice: TAMIL_VOICE,
    delivery: TAMIL_DELIVERY,
    preset: "storyteller",
    speed: 0.98,
    mode: "standard",
    text
  };
}

function targetSegment(lesson, item) {
  return {
    language: lesson.language,
    voice: lesson.voice,
    delivery: TARGET_DELIVERY,
    preset: "storyteller",
    speed: 0.90,
    mode: "standard",
    text: item.target
  };
}

async function speakTamil(text) {
  console.log("Gini [Tamil]:", text);
  return Voice.speak(tamilSegment(text));
}

async function speakTeachingTurn(lesson, item, index, leadTamil = "") {
  const first = index === 0;
  const prompt = [
    leadTamil,
    first ? "முதல் வார்த்தை." : "அடுத்தது.",
    "இதன் அர்த்தம் " + item.meaningTamil + "."
  ].filter(Boolean).join(" ");

  console.log("");
  console.log(
    "[" + (index + 1) + "] " +
    item.meaningTamil + " -> " + item.target + " / " + item.roman
  );
  console.log(
    "Gini [Tamil -> " + lesson.name + "]:",
    prompt,
    "=>",
    item.target
  );

  await Voice.speakSequence(
    [
      tamilSegment(prompt),
      targetSegment(lesson, item)
    ],
    { pauseMs: 180 }
  );
}

async function speakRetryTurn(lesson, item) {
  console.log(
    "Gini [retry -> " + lesson.name + "]:",
    item.target
  );

  await Voice.speakSequence(
    [
      tamilSegment("கேட்கவில்லை. இன்னொரு முறை சொல்லிப் பார்."),
      targetSegment(lesson, item)
    ],
    { pauseMs: 160 }
  );
}

function safeDb(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) + " dB" : "unknown dB";
}

function describeHeard(result) {
  if (!result) return "none";

  if (result.voiceDetected || result.heardAudio) {
    if (result.text) {
      console.log(
        "Gini [HEARD CHILD]:",
        result.text,
        "|",
        safeDb(result.maxDb)
      );
    } else {
      console.log(
        "Gini [CHILD VOICE]: detected |",
        safeDb(result.maxDb)
      );
    }
    return "voice";
  }

  console.log("Gini [NO CHILD VOICE DETECTED]");
  return "none";
}

async function listenForChild(lesson) {
  return Listen.listenOnce({
    language: lesson.language,
    seconds: CHILD_LISTEN_SECONDS,
    transcribe: TRANSCRIBE_CHILD
  });
}

async function status() {
  console.log("=".repeat(64));
  console.log("GINI TEACHER v0.3 - STATUS");
  console.log("=".repeat(64));
  console.log("Rebuildo:", Voice.config.rebuildoUrl);

  const talkback = Voice.talkbackStatus();

  if (talkback.ok) {
    console.log("Camera talkback: READY (" + talkback.mode + ")");
    console.log("Talkback runtime:", talkback.path);
  } else {
    console.log("Camera talkback: NOT READY");
    console.log("Expected verified runtime:", talkback.path);
  }

  const listening = Listen.status();

  console.log(
    "Hands-free child listening:",
    listening.ok ? "READY" : "NOT READY"
  );
  console.log(
    "Turn window:",
    (CHILD_LISTEN_SECONDS).toFixed(1) + "s",
    "| threshold:",
    listening.speechThresholdDb + " dB"
  );
  console.log(
    "Child response mode:",
    TRANSCRIBE_CHILD
      ? "Whisper debug transcription + voice detection"
      : "FAST voice-turn detection"
  );
  console.log("Pronunciation scoring: OFF");

  if (!listening.ok) {
    for (const missing of listening.missing) {
      console.log("  missing:", missing);
    }
  }

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
    console.log(
      "  " + lesson.id + "  " + lesson.name + "  " +
      lesson.items + " words - hands-free"
    );
  }

  console.log("  ar  Arabic  planned - local voice not selected yet");
  console.log("");
  console.log("Flow: Gini teaches -> child replies -> Gini hears voice -> next word");
  console.log("No screen or ENTER key is required.");
}

async function runLesson(languageId, maxItems = null, demo = false) {
  const lesson = Lessons.getLesson(languageId);

  if (!lesson) {
    if (
      String(languageId || "").toLowerCase() === "ar" ||
      String(languageId || "").toLowerCase() === "arabic"
    ) {
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

  const listening = Listen.status();

  if (!listening.ok) {
    throw new Error(
      "Hands-free child listening is not ready. Missing: " +
      listening.missing.join(", ")
    );
  }

  const items = maxItems == null
    ? lesson.items
    : lesson.items.slice(0, Math.max(1, maxItems));

  console.log("");
  console.log("=".repeat(64));
  console.log(
    "GINI TEACHER v0.3 - " +
    lesson.name.toUpperCase() +
    (demo ? " DEMO" : "")
  );
  console.log("Natural flow: Gini speaks -> child replies -> Gini continues");
  console.log("Keyboard / screen confirmation: NOT REQUIRED");
  console.log("Pronunciation scoring: OFF");
  console.log("=".repeat(64));
  console.log("");

  if (demo) {
    await speakTamil(
      "சரி. ஒரு " + tamilLanguageName(lesson) +
      " வார்த்தை மட்டும் பார்க்கலாம். நான் சொன்னதும் நீ திருப்பிச் சொல்லு."
    );
  } else {
    await speakTamil(
      "சரி. இன்று " + tamilLanguageName(lesson) +
      " மொழியில் ஐந்து வார்த்தைகள் கற்போம். நான் சொன்னதும் நீ திருப்பிச் சொல்லு."
    );
  }

  let leadTamil = "";

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    await speakTeachingTurn(
      lesson,
      item,
      index,
      leadTamil
    );

    let heard = await listenForChild(lesson);
    let heardKind = describeHeard(heard);

    if (heardKind === "none") {
      await speakRetryTurn(lesson, item);
      heard = await listenForChild(lesson);
      heardKind = describeHeard(heard);
    }

    leadTamil = heardKind === "voice"
      ? "சூப்பர்."
      : "பரவாயில்லை.";
  }

  if (demo) {
    await speakTamil(
      (leadTamil || "சூப்பர்.") +
      " Demo முடிந்தது."
    );
  } else {
    await speakTamil(
      (leadTamil || "சூப்பர்.") +
      " இன்று ஐந்து வார்த்தைகள் முடிந்தது."
    );
  }

  console.log("");
  console.log("Lesson complete.");
  console.log("Gini listened after every target word.");
  console.log("No pronunciation score was invented.");
}

async function main() {
  const command = String(process.argv[2] || "status").toLowerCase();
  const language = String(process.argv[3] || "hi").toLowerCase();

  if (command === "status") {
    await status();
    return;
  }

  if (command === "demo") {
    await runLesson(language, 1, true);
    return;
  }

  if (command === "lesson") {
    await runLesson(language, null, false);
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
