"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

require("./gini-env");

const Voice = require("./gini-teacher-voice");
const Listen = require("./gini-teacher-listen");
const Lessons = require("./gini-teacher-lessons");

const TAMIL_VOICE = process.env.GINI_TEACHER_TAMIL_VOICE || "female";
const TARGET_DELIVERY = process.env.GINI_TEACHER_TARGET_DELIVERY || "clear";
const TAMIL_DELIVERY = process.env.GINI_TEACHER_TAMIL_DELIVERY || "natural";
const CHILD_LISTEN_SECONDS = Number(
  process.env.GINI_TEACHER_LISTEN_SECONDS || 2.4
);
const ROOT = path.resolve(__dirname, "..");
const REBUILDO_START = path.join(__dirname, "gini-rebuildo-start.ps1");

function usage() {
  console.log("");
  console.log("Gini Teacher v0.4 - multilingual concept teaching");
  console.log("");
  console.log("Commands:");
  console.log("  node .\\scripts\\gini-teacher.js status");
  console.log("  node .\\scripts\\gini-teacher.js demo");
  console.log("  node .\\scripts\\gini-teacher.js lesson");
  console.log("");
  console.log("demo   = one Tamil/Hindi/Japanese concept");
  console.log("lesson = all five concepts");
  console.log("");
}

function tamilSegment(text, extra = {}) {
  return {
    language: "ta",
    voice: TAMIL_VOICE,
    delivery: TAMIL_DELIVERY,
    preset: "storyteller",
    speed: 0.98,
    mode: "standard",
    gainDb: 0,
    text,
    ...extra
  };
}

function languageSegment(language, data, extra = {}) {
  const isHindi = language === "hi";

  return {
    language,
    voice: isHindi ? "hf_alpha" : "jf_alpha",
    delivery: TARGET_DELIVERY,
    preset: "storyteller",
    speed: Number(data.speed || (isHindi ? 0.86 : 0.82)),
    mode: "standard",
    gainDb: Number(data.gainDb || (isHindi ? 3 : 4)),
    text: data.target,
    ...extra
  };
}

async function speakTamil(text) {
  console.log("Gini [Tamil]:", text);
  return Voice.speak(tamilSegment(text));
}

async function speakConceptOverview(concept, index, lead = "") {
  const first = index === 0;
  const tamilLead = [
    lead,
    first ? "முதல் பொருள்." : "அடுத்தது.",
    concept.tamil + ".",
    "ஹிந்தியில்"
  ].filter(Boolean).join(" ");

  console.log("");
  console.log("[" + (index + 1) + "] " + concept.id.toUpperCase());
  console.log(
    "Tamil:", concept.tamil,
    "| Hindi:", concept.hindi.target, "/" + concept.hindi.roman,
    "| Japanese:", concept.japanese.target, "/" + concept.japanese.roman
  );

  await Voice.speakSequence(
    [
      tamilSegment(tamilLead),
      languageSegment("hi", concept.hindi),
      tamilSegment("ஜப்பானியத்தில்"),
      languageSegment("ja", concept.japanese)
    ],
    { pauseMs: 190 }
  );
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[.,!?;:'"“”‘’()\[\]{}\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function isLatin(text) {
  return /^[a-z]+$/i.test(String(text || ""));
}

function levenshtein(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  const rows = y.length + 1;
  const cols = x.length + 1;
  const d = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = y[i - 1] === x[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[rows - 1][cols - 1];
}

function latinSimilarity(a, b) {
  const x = compactText(a);
  const y = compactText(b);

  if (!isLatin(x) || !isLatin(y) || !x || !y) return 0;

  const longest = Math.max(x.length, y.length);
  if (!longest) return 1;

  return 1 - (levenshtein(x, y) / longest);
}

function verifyPronunciation(result, targetData) {
  if (!result || !(result.voiceDetected || result.heardAudio)) {
    return {
      state: "not-heard",
      transcript: ""
    };
  }

  const transcript = normalizeText(result.text);

  if (!transcript) {
    return {
      state: "uncertain",
      transcript: ""
    };
  }

  const accepted = [
    targetData.target,
    targetData.roman,
    ...(targetData.accept || [])
  ];

  const compactTranscript = compactText(transcript);

  for (const item of accepted) {
    const normalized = normalizeText(item);
    const compact = compactText(item);

    if (!compact) continue;

    if (
      compactTranscript === compact ||
      compactTranscript.includes(compact) ||
      compact.includes(compactTranscript)
    ) {
      return {
        state: "pass",
        transcript
      };
    }

    if (latinSimilarity(compactTranscript, compact) >= 0.72) {
      return {
        state: "pass",
        transcript
      };
    }
  }

  return {
    state: "retry",
    transcript
  };
}

async function listenAndVerify(language, targetData) {
  const heard = await Listen.listenOnce({
    language,
    seconds: CHILD_LISTEN_SECONDS,
    transcribe: true
  });

  const check = verifyPronunciation(heard, targetData);

  console.log(
    "Gini [VERIFY " + language.toUpperCase() + "]:",
    check.state.toUpperCase(),
    "| heard:",
    check.transcript || "(no reliable transcript)"
  );

  return check;
}

async function practiceLanguage(language, labelTamil, targetData, leadTamil = "") {
  const intro = [
    leadTamil,
    labelTamil + ".",
    "கவனமாக கேள்."
  ].filter(Boolean).join(" ");

  await Voice.speakSequence(
    [
      tamilSegment(intro),
      languageSegment(language, targetData)
    ],
    { pauseMs: 170 }
  );

  let check = await listenAndVerify(language, targetData);

  if (check.state === "pass") {
    return {
      passed: true,
      lead: "சூப்பர்."
    };
  }

  const retryText =
    check.state === "not-heard"
      ? "உன் குரல் கேட்கவில்லை. இன்னொரு முறை."
      : "கிட்டத்தட்ட. இன்னொரு முறை கேட்டு சொல்லிப் பார்.";

  await Voice.speakSequence(
    [
      tamilSegment(retryText),
      languageSegment(
        language,
        targetData,
        {
          speed: Math.max(0.68, Number(targetData.speed || 0.82) - 0.06),
          gainDb: Number(targetData.gainDb || 4) + 1.0
        }
      )
    ],
    { pauseMs: 160 }
  );

  check = await listenAndVerify(language, targetData);

  if (check.state === "pass") {
    return {
      passed: true,
      lead: "இப்போ சரி. சூப்பர்."
    };
  }

  return {
    passed: false,
    lead: "நல்ல முயற்சி. இதை பின்னாடி மறுபடியும் practice பண்ணலாம்."
  };
}

async function runConcept(concept, index, lead = "") {
  await speakConceptOverview(concept, index, lead);

  const hindi = await practiceLanguage(
    "hi",
    "முதலில் ஹிந்தி",
    concept.hindi
  );

  const japanese = await practiceLanguage(
    "ja",
    "இப்போது ஜப்பானியம்",
    concept.japanese,
    hindi.lead
  );

  return japanese.lead;
}

async function ensureRebuildoReady() {
  let health = await Voice.health();

  if (health.ok) return health;

  console.log("Rebuildo voice server is offline. Starting it automatically...");

  const start = spawnSync(
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
      "Rebuildo voice server is not ready at " +
      Voice.config.rebuildoUrl +
      ". Startup exit code: " +
      String(start.status)
    );
  }

  return health;
}

async function status() {
  console.log("=".repeat(68));
  console.log("GINI TEACHER v0.4 - STATUS");
  console.log("=".repeat(68));
  console.log("Rebuildo:", Voice.config.rebuildoUrl);
  console.log("Speaker mode:", Voice.config.speakerMode);

  const talkback = Voice.talkbackStatus();
  if (Voice.config.speakerMode === "camera") {
    console.log(
      "Camera talkback:",
      talkback.ok ? "READY (" + talkback.mode + ")" : "NOT READY"
    );
  } else {
    console.log("External Windows speaker mode: READY");
  }

  const listening = Listen.status();
  console.log(
    "Camera child microphone:",
    listening.ok ? "READY" : "NOT READY"
  );
  console.log(
    "Pronunciation verification:",
    listening.ok ? "READY - target constrained" : "NOT READY"
  );
  console.log(
    "Turn window:",
    CHILD_LISTEN_SECONDS.toFixed(1) + "s",
    "| threshold:",
    listening.speechThresholdDb + " dB"
  );

  const health = await Voice.health();

  console.log(
    "Rebuildo voice server:",
    health.ok ? "READY" : "NOT READY"
  );

  if (health.ok) {
    console.log("Tamil Voice Artist:", health.tamilVoiceArtist || "unknown");
    console.log("Kokoro Voice Artist:", health.voiceArtist || "unknown");
  } else {
    console.log("Reason:", health.error || "health check failed");
  }

  console.log("");
  console.log("Teaching mode:");
  console.log("  Tamil meaning -> Hindi -> Japanese -> verify Hindi -> verify Japanese");
  console.log("  5 concepts: water, book, house, cat, apple");
  console.log("  Japanese target voice is slower and louder.");
  console.log("  Japanese 'いえ' is extra slow/loud for clarity.");
  console.log("  No numeric pronunciation score.");
  console.log("");
  console.log("Commands:");
  console.log("  node .\\scripts\\gini-teacher.js demo");
  console.log("  node .\\scripts\\gini-teacher.js lesson");
}

async function runLesson(limit = null, demo = false) {
  const health = await ensureRebuildoReady();

  const listening = Listen.status();

  if (!listening.ok) {
    throw new Error(
      "Camera child microphone is not ready. Missing: " +
      listening.missing.join(", ")
    );
  }

  const concepts = Lessons.getConcepts(limit);

  console.log("");
  console.log("=".repeat(68));
  console.log(
    "GINI TEACHER v0.4 - TAMIL + HINDI + JAPANESE" +
    (demo ? " DEMO" : "")
  );
  console.log("Concept based: all three languages are taught together");
  console.log("Pronunciation verification: Hindi + Japanese");
  console.log("No screen / ENTER key needed during the lesson");
  console.log("=".repeat(68));
  console.log("");

  await speakTamil(
    demo
      ? "சரி. ஒரு பொருளை தமிழ், ஹிந்தி, ஜப்பானியம் மூன்றிலும் பார்க்கலாம்."
      : "சரி. இன்று ஐந்து பொருட்களை தமிழ், ஹிந்தி, ஜப்பானியம் மூன்றிலும் கற்போம்."
  );

  let lead = "";

  for (let index = 0; index < concepts.length; index++) {
    lead = await runConcept(concepts[index], index, lead);
  }

  await speakTamil(
    (lead || "சூப்பர்.") +
    (demo
      ? " Demo முடிந்தது."
      : " இன்று ஐந்து பொருட்கள் முடிந்தது.")
  );

  console.log("");
  console.log("Lesson complete.");
}

async function main() {
  const command = String(process.argv[2] || "status").toLowerCase();

  if (command === "status") {
    await status();
    return;
  }

  if (command === "demo") {
    await runLesson(1, true);
    return;
  }

  if (command === "lesson") {
    await runLesson(null, false);
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
