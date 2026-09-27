const path = require("path");
const { spawn } = require("child_process");

require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const ROOT = path.resolve(__dirname, "..");
const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = Number(process.env.GINI_CAMERA_STREAM || 0);

const PTZ = path.join(ROOT, "gini.ps1");
const SAY_LOCAL = path.join(ROOT, "scripts", "gini-say-local.ps1");

let connection = null;
let opened = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let firstAudio = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(file, args) {
  return new Promise(resolve => {
    const child = spawn(file, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: "inherit"
    });

    child.on("error", err => resolve({ code: -1, error: err }));
    child.on("close", code => resolve({ code: code ?? -1 }));
  });
}

function snapshot(label) {
  console.log(
    "[" + label + "] video=" + videoFrames +
    " audio=" + audioFrames +
    " audioBytes=" + audioBytes
  );
  return { audioFrames, audioBytes, videoFrames };
}

async function watchForNewAudio(startCount, seconds, label) {
  const deadline = Date.now() + seconds * 1000;

  while (Date.now() < deadline) {
    await sleep(1000);
    snapshot(label);

    if (audioFrames > startCount) return true;
  }

  return false;
}

async function testSequence() {
  console.log("");
  console.log("STEP 1 - baseline: waiting 8 seconds with no PTZ and no speech...");
  await sleep(8000);

  const baseline = snapshot("BASELINE");

  if (baseline.audioFrames < 10) {
    console.log("");
    console.log("RESULT: MIC WAS ALREADY STUCK BEFORE THE ISOLATION TEST.");
    console.log("Reboot Gini once, then run this script again.");
    shutdown(3);
    return;
  }

  console.log("");
  console.log("STEP 2 - PTZ ONLY: turning left. No Gini speech will run.");
  const beforePtz = audioFrames;

  const ptz = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", PTZ,
      "-Action", "left",
      "-Step", "1",
      "-Speed", "8"
    ]
  );

  if (ptz.code !== 0) {
    console.log("PTZ command failed with code", ptz.code);
    shutdown(4);
    return;
  }

  console.log("Watching native mic for 12 seconds after PTZ...");
  const survivedPtz = await watchForNewAudio(beforePtz, 12, "AFTER PTZ");

  if (!survivedPtz) {
    console.log("");
    console.log("RESULT: PTZ ALONE REPRODUCED THE MIC FREEZE.");
    console.log("Camera talkback and PC speech were not involved.");
    shutdown(10);
    return;
  }

  console.log("");
  console.log("PTZ did NOT stop AAC. Continuing to STEP 3.");

  console.log("");
  console.log("STEP 3 - PC SPEAKER ONLY: speaking locally. No camera talkback.");
  const beforeLocalSpeech = audioFrames;

  const say = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", SAY_LOCAL,
      "Gini local speaker isolation test."
    ]
  );

  if (say.code !== 0) {
    console.log("Local speech command failed with code", say.code);
    shutdown(5);
    return;
  }

  console.log("Watching native mic for 12 seconds after local PC speech...");
  const survivedLocalSpeech = await watchForNewAudio(
    beforeLocalSpeech,
    12,
    "AFTER LOCAL SPEECH"
  );

  console.log("");

  if (!survivedLocalSpeech) {
    console.log("RESULT: LOCAL PC SPEECH CORRELATED WITH THE MIC FREEZE.");
    console.log("No camera talkback was used.");
    shutdown(11);
    return;
  }

  console.log("RESULT: MIC SURVIVED PTZ AND LOCAL PC SPEECH.");
  console.log("The freeze must be isolated elsewhere in the continuous brain path.");
  shutdown(0);
}

function shutdown(code) {
  try {
    if (connection && opened) API.close_stream(connection, 0, STREAM);
  } catch {}

  setTimeout(() => {
    try { Player.DisConnectDevice("", IP); } catch {}
    setTimeout(() => process.exit(code), 400);
  }, 250);
}

API.onconnect = function(conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    console.error("Native connection failed:", code);
    process.exit(2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function(conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    console.error("Native login failed:", result);
    process.exit(2);
    return;
  }

  connection = conn;
  conn.logined = true;
  API.open_stream(conn, 0, STREAM);
};

API.onopenstream = function(conn, channel, streamid, result) {
  console.log("OPEN STREAM:", result, "channel=" + channel, "stream=" + streamid);

  if (result !== 0) {
    console.error("Live stream open failed:", result);
    process.exit(2);
    return;
  }

  opened = true;
  testSequence().catch(err => {
    console.error(err);
    shutdown(9);
  });
};

API.onrecvframeex = function(
  conn,
  frametype,
  data,
  datalen,
  channel,
  param1,
  param2,
  enc,
  param4
) {
  if (frametype === 0) {
    audioFrames += 1;
    audioBytes += datalen;

    if (!firstAudio) {
      firstAudio = true;
      console.log(
        "FIRST AUDIO FRAME:",
        { codec: enc, sampleRate: param1, sampleWidth: param2, channels: param4 },
        "bytes=" + datalen
      );
    }
  } else {
    videoFrames += 1;
  }
};

console.log("==================================================");
console.log("GINI MIC FREEZE ISOLATION TEST");
console.log("==================================================");
console.log("No camera talkback is used anywhere in this test.");
console.log("");

Player.ConnectDevice(
  "",
  IP,
  USER,
  PASS,
  0,
  PORT,
  0,
  0,
  STREAM,
  "",
  null
);

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
