"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

require("./gini-env");

const Voice = require("./gini-teacher-voice");
const Listen = require("./gini-teacher-listen");
const Curriculum = require("./gini-teacher-curriculum");

const ROOT = path.resolve(__dirname, "..");
const REBUILDO_START = path.join(__dirname, "gini-rebuildo-start.ps1");
const LISTEN_SECONDS = Number(process.env.GINI_TEACHER_LISTEN_SECONDS || 3.0);

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[.,!?;:'"“”‘’()\[\]{}\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tamilSegment(text) {
  return {
    language: "ta",
    voice: "female",
    delivery: "calm",
    preset: "storyteller",
    speed: 0.90,
    mode: "standard",
    gainDb: 0,
    text
  };
}

function targetSegment(language, target) {
  return {
    language: language.ttsLanguage || language.id,
    voice: language.voice,
    delivery: language.delivery,
    preset: "storyteller",
    speed: language.speed,
    mode: "standard",
    gainDb: 0,
    text: target.target
  };
}

async function ensureRebuildo() {
  let health = await Voice.health();
  if (health.ok) return;

  const started = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", REBUILDO_START
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true
    }
  );

  health = await Voice.health();

  if (!health.ok) {
    throw new Error(
      "Rebuildo is not ready. Startup exit code: " +
      String(started.status)
    );
  }
}

function englishPass(text, target) {
  const heard = normalizeText(text);
  if (!heard) return false;

  const expected = [
    target.target,
    target.roman,
    ...(target.accept || [])
  ].map(normalizeText);

  return expected.some(item =>
    item &&
    (
      heard === item ||
      heard.includes(item) ||
      item.includes(heard)
    )
  );
}

async function listenForChild(language, target) {
  const result = await Listen.listenOnce({
    language: language.id,
    seconds: LISTEN_SECONDS,
    transcribe: language.transcribe
  });

  if (!result || !(result.voiceDetected || result.heardAudio)) {
    return {
      state: "not-heard",
      text: ""
    };
  }

  if (!language.transcribe) {
    return {
      state: "heard",
      text: ""
    };
  }

  if (englishPass(result.text, target)) {
    return {
      state: "pass",
      text: result.text
    };
  }

  return {
    state: "uncertain",
    text: result.text || ""
  };
}

async function speakSoftTamil(text) {
  console.log("Gini [Tamil]:", text);
  await Voice.speak(tamilSegment(text));
}

async function teachOne(language, item, index) {
  const target = item[language.id];

  const intro =
    language.id === "ta"
      ? (index === 0
          ? "சரி, நாம மெதுவா ஆரம்பிக்கலாம். இந்த வார்த்தை " + target.target + "."
          : "அடுத்த வார்த்தை " + target.target + ".")
      : (index === 0
          ? "சரி, நாம மெதுவா ஆரம்பிக்கலாம். " +
            item.meaningTamil +
            " என்பதைக் " +
            language.tamilName +
            " மொழியில் இப்படிச் சொல்வோம்."
          : item.meaningTamil +
            " என்பதைக் " +
            language.tamilName +
            " மொழியில் இப்படிச் சொல்வோம்.");

  console.log("");
  console.log(
    "[" + (index + 1) + "] " +
    item.meaningTamil +
    " -> " +
    target.target +
    " / " +
    target.roman
  );

  await Voice.speakSequence(
    [
      tamilSegment(intro),
      targetSegment(language, target),
      tamilSegment("நீ தயாரானதும் சொல்லிப் பார்க்கலாமா?")
    ],
    { pauseMs: 260 }
  );

  let heard = await listenForChild(language, target);

  if (heard.state === "pass") {
    await speakSoftTamil("அருமை. நன்றாக சொன்னாய்.");
    return;
  }

  if (heard.state === "heard") {
    await speakSoftTamil("கேட்டேன். நல்ல முயற்சி. அடுத்ததுக்கு போகலாம்.");
    return;
  }

  const retryPrompt =
    heard.state === "not-heard"
      ? "பரவாயில்லை. கொஞ்சம் நேரம் எடுத்துக்கோ. நான் இன்னொரு முறை மெதுவா சொல்றேன்."
      : "பரவாயில்லை. நான் சரியாக உறுதி செய்ய முடியவில்லை. இன்னொரு முறை மெதுவா கேட்போம்.";

  await Voice.speakSequence(
    [
      tamilSegment(retryPrompt),
      targetSegment(
        { ...language, speed: Math.max(0.72, language.speed - 0.08) },
        target
      ),
      tamilSegment("இப்போ சொல்லிப் பார்க்கலாமா?")
    ],
    { pauseMs: 300 }
  );

  heard = await listenForChild(language, target);

  if (heard.state === "pass") {
    await speakSoftTamil("இப்போ சரி. அருமை.");
    return;
  }

  if (heard.state === "heard") {
    await speakSoftTamil("கேட்டேன். நல்ல முயற்சி. இதை பின்னாடி மறுபடியும் பார்க்கலாம்.");
    return;
  }

  await speakSoftTamil(
    "பரவாயில்லை. இப்போ இதை விட்டு அடுத்ததுக்கு போகலாம். பிறகு திரும்ப முயற்சி பண்ணலாம்."
  );
}

async function runSession(languageId, demo = false) {
  const language = Curriculum.getLanguage(languageId);

  if (!language) {
    throw new Error(
      "Supported teacher languages are Tamil, English and Hindi."
    );
  }

  await ensureRebuildo();

  const listening = Listen.status();
  if (!listening.ok) {
    throw new Error(
      "Camera microphone is not ready. Missing: " +
      listening.missing.join(", ")
    );
  }

  const concepts = Curriculum.getConcepts(demo ? 1 : null);

  console.log("");
  console.log("=".repeat(68));
  console.log(
    "GINI TEACHER v0.5 - " +
    language.name.toUpperCase() +
    (demo ? " DEMO" : "")
  );
  console.log("Calm child-friendly teaching");
  console.log("Tamil understanding + one target language at a time");
  console.log(
    language.id === "en"
      ? "English word recognition: experimental"
      : "Pronunciation judgement: OFF until phoneme verifier is ready"
  );
  console.log("=".repeat(68));
  console.log("");

  const welcome =
    language.id === "ta"
      ? "சரி. தமிழ் கற்போம். அவசரம் இல்லை. ஒன்றாக மெதுவா பார்க்கலாம்."
      : "சரி. " +
        language.tamilName +
        " கற்போம். அர்த்தத்தை தமிழில் சொல்றேன். அவசரம் இல்லை. ஒன்றாக மெதுவா பார்க்கலாம்.";

  await speakSoftTamil(welcome);

  for (let i = 0; i < concepts.length; i++) {
    await teachOne(language, concepts[i], i);
  }

  await speakSoftTamil(
    demo
      ? "சூப்பர். இன்றைக்கு இந்த ஒரு வார்த்தை போதும்."
      : "சூப்பர். இன்றைக்கு இவ்வளவு போதும். பிறகு இன்னும் கொஞ்சம் கற்போம்."
  );

  console.log("");
  console.log("Teacher session complete.");
}

async function main() {
  const language = String(process.argv[2] || "").toLowerCase();
  const mode = String(process.argv[3] || "lesson").toLowerCase();

  if (!language) {
    console.log("Usage:");
    console.log("  node .\\scripts\\gini-teacher-session.js en demo");
    console.log("  node .\\scripts\\gini-teacher-session.js en lesson");
    console.log("  node .\\scripts\\gini-teacher-session.js hi lesson");
    console.log("  node .\\scripts\\gini-teacher-session.js ta lesson");
    process.exitCode = 2;
    return;
  }

  await runSession(language, mode === "demo");
}

main().catch(error => {
  console.error("");
  console.error("GINI TEACHER v0.5 ERROR:", error.message);
  process.exitCode = 1;
});
