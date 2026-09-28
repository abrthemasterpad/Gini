"use strict";

const Listen = require("./gini-teacher-listen");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    language: "auto",
    seconds: 2.4
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--language" && args[i + 1]) {
      out.language = String(args[++i]).toLowerCase();
      continue;
    }

    if (args[i] === "--seconds" && args[i + 1]) {
      out.seconds = Number(args[++i]);
      continue;
    }
  }

  if (!Number.isFinite(out.seconds)) out.seconds = 2.4;
  out.seconds = Math.max(1.8, Math.min(8, out.seconds));

  return out;
}

async function main() {
  const args = parseArgs();

  const result = await Listen.listenOnce({
    language: args.language,
    seconds: args.seconds,
    transcribe: true
  });

  console.log(
    "GINI LAB HEARING RESULT:",
    JSON.stringify({
      ok: result.ok,
      heardAudio: Boolean(result.heardAudio),
      voiceDetected: Boolean(result.voiceDetected),
      text: result.text || "",
      maxDb: result.maxDb,
      audioFrames: result.audioFrames
    })
  );
}

main().catch(error => {
  console.error("GINI LAB HEARING ERROR:", error.message);
  process.exitCode = 1;
});
