"use strict";

require("./gini-env");

const Voice = require("./gini-teacher-voice");
const Listen = require("./gini-teacher-listen");
const Lessons = require("./gini-teacher-lessons");

const TAMIL_VOICE = process.env.GINI_TEACHER_TAMIL_VOICE || "female";
const TARGET_DELIVERY = process.env.GINI_TEACHER_TARGET_DELIVERY || "clear";
const TAMIL_DELIVERY = process.env.GINI_TEACHER_TAMIL_DELIVERY || "natural";
const CHILD_LISTEN_SECONDS = Number(
  process.env.GINI_TEACHER_LISTEN_SECONDS || 3.2
);

function usage() {
  console.log("");
  console.log("Gini Teacher v0.2 - hands-free conversation");
  console.log("");
  console.log("Commands:");
  console.log("  node .\\scripts\\gini-teacher.js status");
  console.log("  node .\\scripts\\gini-teacher.js demo hi       # 1-word hands-free sample");
  console.log("  node .\\scripts\\gini-teacher.js demo ja       # 1-word hands-free sample");
  console.log("  node .\\scripts\\gini-teacher.js lesson hi     # all 5 words, no keyboard");
  console.log("  node .\\scripts\\gini-teacher.js lesson ja     # all 5 words, no keyboard");
  console.log("");
  console.log("hi = Hindi, ja = Japanese");
  console.log("Arabic remains disabled until a local Arabic voice passes the fit test.");
  console.log("");
}

function tamilSegment(text) {
  return {
    language: "ta",
    voice: TAMIL_VOICE,
    delivery: TAMIL_DELIVERY,
    preset: "storyteller",
    speed: 0.96,
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
    speed: 0.88,
    mode: "standard",
    text: item.target
  };
}

async function speakTamil(text) {
  console.log("Gini [Tamil]:", text);
  return Voice.speak(tamilSegment(text));
}

async function speakTeachingTurn(lesson, item, index, leadTamil = "") {
  const position = index === 0 ? "முதல் வார்த்தை." : "அடுத்த வார்த்தை.";
  const direction = index === 0
    ? "நான் சொல்லி முடித்ததும் ஒரு கணம் காத்திருந்து நீ திருப்பிச் சொல்லு."
    : "கேட்டு, ஒரு கணம் காத்திருந்து நீ திருப்பிச் சொல்லு.";

  const prompt = [
    leadTamil,
    position,
    "இதன் அர்த்தம் " + item.meaningTamil + ".",
    direction
  ].filter(Boolean).join(" ");

  console.log("");
  console.log(
    "[" + (index + 1) + "] " +
    item.meaningTamil + " -> " + item.target + " / " + item.roman
  );
  console.log("Gini [Tamil -> " + lesson.name + "]:", prompt, "=>", item.target);

  // One camera utterance: Tamil teaching cue, a short natural pause, then the
  // native Hindi/Japanese target. As soon as this finishes, Gini opens its mic.
  await Voice.speakSequence(
    [
      tamilSegment(prompt),
      targetSegment(lesson, item)
    ],
    { pauseMs: 220 }
  );
}

function describeHeard(result) {
  if (!result) return "nothing";

  if (result.heardSpeech) {
    console.log(
      "Gini [HEARD CHILD]:",
      result.text,
      "|",
      Number(result.maxDb || -100).toFixed(1) + " dB"
    );
    return "speech";
  }

  if (result.heardAudio) {
    console.log(
      "Gini [HEARD AUDIO]: speech was not confidently transcribed |",
      Number(result.maxDb || -100).toFixed(1) + " dB"
    );
    return "audio";
  }

  console.log("Gini [NO CHILD VOICE DETECTED]");
  return "none";
}

async function listenForChild(lesson) {
  return Listen.listenOnce({
    language: lesson.language,
    seconds: CHILD_LISTEN_SECONDS
  });
}

async function status() {
  console.log("=".repeat(62));
  console.log("GINI TEACHER v0.2 - STATUS");
  console.log("=".repeat(62));
  console.log("Rebuildo:", Voice.config.rebuildoUrl);

  const talkback = Voice.talkbackStatus();

  if (talkback.ok) {
    console.log("Camera talkback: READY (" + talkback.mode + ")");
    console.log("Talkback runtime:", talkback.path);
  } else {
    console.log("Camera talkback: NOT READY");
    console.log("Expected verified runtime:", talkback.path);
    if (talkback.alsoChecked) {
      console.log("Also checked:", talkback.alsoChecked);
    }
  }

  const listening = Listen.status();
  console.log(
    "Hands-free child listening:",
    listening.ok ? "READY" : "NOT READY"
  );
  console.log(
    "Listening window:",
    (listening.listenMs / 1000).toFixed(1) + "s",
    "| speech threshold:",
    listening.speechThresholdDb + " dB"
  );

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
  console.log("demo   = one-word hands-free hardware sample");
  console.log("lesson = full five-word hands-free conversation");
  console.log("No ENTER key is required during a lesson.");
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
  console.log("=".repeat(62));
  console.log(
    "GINI TEACHER v0.2 - " +
    lesson.name.toUpperCase() +
    (demo ? " DEMO" : "")
  );
  console.log("Hands-free: Gini speaks -> automatically listens -> continues");
  console.log("Keyboard / screen confirmation: NOT REQUIRED");
  console.log("Pronunciation scoring: OFF - Gini only confirms that it heard the child");
  console.log("=".repeat(62));
  console.log("");

  const intro = demo
    ? (
      "சரி. ஒரு " + lesson.name +
      " வார்த்தையை sample ஆக பார்க்கலாம். " +
      "நான் வார்த்தையை சொல்லி முடித்ததும் ஒரு கணம் காத்திருந்து நீ திருப்பிச் சொல்லு."
    )
    : (
      lesson.introTamil +
      " ஒவ்வொரு வார்த்தையையும் நான் சொல்லி முடித்ததும் ஒரு கணம் காத்திருந்து நீ திருப்பிச் சொல்லு. " +
      "நான் தானாகவே உன் பதிலை கேட்பேன். Screen பார்க்க வேண்டாம்."
    );

  await speakTamil(intro);

  let leadTamil = "";

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    await speakTeachingTurn(
      lesson,
      item,
      index,
      leadTamil
    );

    // Important: no "press Enter" and no extra spoken prompt after the target.
    // The mic opens automatically as the child's conversational turn.
    let heard = await listenForChild(lesson);
    let heardKind = describeHeard(heard);

    if (heardKind === "none") {
      await speakTamil("உன் குரல் கேட்கவில்லை. இன்னொரு முறை சொல்லிப் பார்.");

      heard = await listenForChild(lesson);
      heardKind = describeHeard(heard);
    }

    if (heardKind === "speech") {
      leadTamil = "ஆமாம், கேட்டேன். சூப்பர்.";
    } else if (heardKind === "audio") {
      leadTamil = "உன் குரல் கேட்டது. நல்ல முயற்சி.";
    } else {
      leadTamil = "பரவாயில்லை.";
    }
  }

  const endingLead = leadTamil || "சூப்பர்.";

  if (demo) {
    await speakTamil(
      endingLead +
      " Demo முடிந்தது. Full lesson போட்டால் ஐந்து வார்த்தைகளையும் தொடர்ந்து கற்போம்."
    );
  } else {
    await speakTamil(
      endingLead + " " + lesson.outroTamil
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
