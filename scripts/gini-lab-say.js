"use strict";

const Voice = require("./gini-teacher-voice");

const LANGUAGE = {
  ta: {
    language: "ta",
    voice: "female",
    delivery: "calm",
    speed: 0.90
  },
  en: {
    language: "en-us",
    voice: "af_heart",
    delivery: "calm",
    speed: 0.92
  },
  hi: {
    language: "hi",
    voice: "hf_alpha",
    delivery: "calm",
    speed: 0.88
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    language: "en",
    text: ""
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--language" && args[i + 1]) {
      out.language = String(args[++i]).toLowerCase();
      continue;
    }

    if (args[i] === "--text" && args[i + 1]) {
      out.text = String(args[++i]);
      continue;
    }
  }

  return out;
}

async function say(language, text) {
  const config = LANGUAGE[language];

  if (!config) {
    throw new Error("Supported languages: ta, en, hi");
  }

  const clean = String(text || "").trim();

  if (!clean) {
    throw new Error("Text is required.");
  }

  await Voice.speak({
    ...config,
    text: clean,
    preset: "storyteller",
    mode: "standard"
  });

  return {
    ok: true,
    language,
    text: clean
  };
}

async function main() {
  const args = parseArgs();
  const result = await say(args.language, args.text);
  console.log("GINI LAB SAY:", JSON.stringify(result));
}

if (require.main === module) {
  main().catch(error => {
    console.error("GINI LAB SAY ERROR:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  say,
  LANGUAGE
};
