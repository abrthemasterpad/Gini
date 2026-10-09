"use strict";

const path = require("path");
const { spawn } = require("child_process");

require("./gini-env");

const Say = require("./gini-lab-say");
const Listen = require("./gini-teacher-listen");
const Brain = require("./gini-assistant-brain");
const Expression = require("./gini-expression");

const ROOT = path.resolve(__dirname, "..");
const VISION = path.join(ROOT, "scripts", "gini-vision-track.py");

function parseArgs() {
  const args = process.argv.slice(2);
  const languageIndex = args.indexOf("--language");
  const language = String(
    languageIndex >= 0 && args[languageIndex + 1]
      ? args[languageIndex + 1]
      : "en"
  ).toLowerCase();

  if (!["en", "ta", "hi"].includes(language)) {
    throw new Error("Supported languages: en, ta, hi");
  }

  return {
    language,
    liveVision: args.includes("--live-vision")
  };
}

function stage(name, state, detail = {}) {
  const payload = {
    stage: name,
    state,
    at: new Date().toISOString(),
    ...detail
  };

  console.log("GINI_FULL_STAGE " + JSON.stringify(payload));
  return payload;
}

function runProcess(command, args, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;

      try {
        if (process.platform === "win32") {
          spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore"
          });
        } else {
          child.kill("SIGTERM");
        }
      } catch {}
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", chunk => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });

    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + "\n" + error.message });
    });
  });
}

function promptFor(language) {
  if (language === "ta") {
    return "முழு ரோபோ சோதனை தொடங்குகிறது. பீப் இல்லாமல், நான் அமைதியானதும் ஒரு குறுகிய வாக்கியம் சொல்லுங்கள்.";
  }

  if (language === "hi") {
    return "पूरा रोबोट परीक्षण शुरू हो रहा है। मैं चुप हो जाऊँ, तब एक छोटा वाक्य बोलिए।";
  }

  return "Full robot test is starting. When I become quiet, please say one short sentence.";
}

function heardReply(language) {
  if (language === "ta") return "உங்கள் குரலை கேட்டேன்.";
  if (language === "hi") return "मैंने आपकी आवाज़ सुनी.";
  return "I heard your voice.";
}

function noVoiceReply(language) {
  if (language === "ta") {
    return "தெளிவான குரல் கிடைக்கவில்லை. மீதமுள்ள சோதனைகளை தொடர்கிறேன்.";
  }
  if (language === "hi") {
    return "मुझे साफ़ आवाज़ नहीं मिली। बाकी परीक्षण जारी रखता हूँ।";
  }
  return "I did not detect a clear voice. The test will continue with the remaining modules.";
}

async function main() {
  const args = parseArgs();
  const results = [];

  stage("speech", "starting");
  await Say.say(args.language, promptFor(args.language));
  results.push(stage("speech", "passed"));

  stage("hearing", "starting", { listenSeconds: 3.2 });
  const heard = await Listen.listenOnce({
    language: args.language,
    seconds: 3.2,
    transcribe: true
  });

  if (!heard || !heard.voiceDetected) {
    results.push(stage("hearing", "failed", {
      maxDb: heard && heard.maxDb,
      audioFrames: heard && heard.audioFrames
    }));

    await Say.say(args.language, noVoiceReply(args.language));
  } else {
    results.push(stage("hearing", "passed", {
      text: heard.text || "",
      maxDb: heard.maxDb,
      audioFrames: heard.audioFrames
    }));

    stage("brain", "starting", { transcript: heard.text || "" });

    let reply = heardReply(args.language);
    let source = "voice-detected";

    if (heard.text) {
      const decision = await Brain.decide(heard.text);
      source = decision.source || "unknown";
      if (decision.reply) reply = decision.reply;
    }

    results.push(stage("brain", "passed", {
      source,
      reply: String(reply).slice(0, 180)
    }));

    await Say.say(args.language, reply);
  }

  stage("head", "starting");
  await Expression.runExpression("acknowledge", {
    pulseMs: 85,
    gapMs: 90
  });
  results.push(stage("head", "passed"));

  stage("vision", "starting", {
    mode: args.liveVision ? "bounded-live" : "dry-run"
  });

  const visionArgs = [
    "-3",
    VISION,
    "--live-seconds", args.liveVision ? "10" : "7",
    "--max-live-moves", "2",
    "--pulse-ms", "85",
    "--stable-frames", "3",
    "--cooldown-ms", "900",
    "--post-move-settle-ms", "1000"
  ];

  if (args.liveVision) {
    visionArgs.push("--live");
  }

  const vision = await runProcess(
    "py.exe",
    visionArgs,
    args.liveVision ? 18000 : 14000
  );

  if (vision.code === 0) {
    results.push(stage("vision", "passed", {
      mode: args.liveVision ? "bounded-live" : "dry-run"
    }));
  } else {
    results.push(stage("vision", "failed", {
      code: vision.code,
      error: vision.stderr.slice(-240)
    }));
  }

  const failed = results.filter(item => item.state === "failed");

  const summary = {
    ok: failed.length === 0,
    liveVision: args.liveVision,
    failedStages: failed.map(item => item.stage),
    stages: results
  };

  console.log("GINI_FULL_TEST_RESULT " + JSON.stringify(summary));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  stage("fatal", "failed", { error: error.message });
  console.error("GINI FULL ROBOT TEST ERROR:", error.stack || error.message);
  process.exitCode = 1;
});
