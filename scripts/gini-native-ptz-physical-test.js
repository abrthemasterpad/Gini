require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";
const STREAM = 0;

let connection = null;
let opened = false;
let audioFrames = 0;
let audioBytes = 0;
let videoFrames = 0;
let firstAudio = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function snapshot(label) {
  console.log(
    "[" + label + "] video=" + videoFrames +
    " audio=" + audioFrames +
    " audioBytes=" + audioBytes
  );
  return { audioFrames, audioBytes, videoFrames };
}

async function observe(seconds, label) {
  const before = snapshot(label + " START");

  for (let i = 1; i <= seconds; i++) {
    await sleep(1000);
    if (i === seconds) snapshot(label + " " + seconds + "s");
  }

  const da = audioFrames - before.audioFrames;
  const db = audioBytes - before.audioBytes;
  const dv = videoFrames - before.videoFrames;

  console.log(
    "[" + label + " DELTA] +" + da +
    " audio frames, +" + db +
    " audio bytes, +" + dv + " video frames"
  );

  return { da, db, dv };
}

async function move(type, name) {
  console.log("");
  console.log(">>> WATCH GINI NOW: moving " + name + " for 1200 ms");
  console.log("Using exact SDK demo parameter: param=6");

  Player.ptz_ctrl("", IP, 0, type, 6);
  await sleep(1200);

  console.log("Stopping PTZ with exact SDK demo stop: type=0 param=0");
  Player.ptz_ctrl("", IP, 0, 0, 0);

  await sleep(300);
}

async function main() {
  console.log("");
  console.log("STEP 1 - baseline mic for 8 seconds.");
  const base = await observe(8, "BASELINE");

  if (base.da < 20) {
    console.log("RESULT: baseline mic is not healthy. Reboot first.");
    shutdown(3);
    return;
  }

  console.log("");
  console.log("STEP 2 - LEFT using the exact CameraSDK demo values.");
  await move(4, "LEFT");
  const afterLeft = await observe(8, "AFTER LEFT");

  console.log("");
  console.log("STEP 3 - RIGHT using the exact CameraSDK demo values.");
  await move(5, "RIGHT");
  const afterRight = await observe(8, "AFTER RIGHT");

  console.log("");
  console.log("==============================================");
  console.log("TEST COMPLETE");
  console.log("==============================================");
  console.log("LEFT mic delta :", afterLeft.da, "audio frames");
  console.log("RIGHT mic delta:", afterRight.da, "audio frames");
  console.log("");
  console.log("IMPORTANT: terminal PTZ result=0 only means the command was accepted.");
  console.log("Physical movement must be confirmed by watching Gini.");
  console.log("");

  if (afterLeft.da >= 15 && afterRight.da >= 15) {
    console.log("MIC RESULT: AAC SURVIVED BOTH NATIVE PTZ COMMANDS.");
  } else {
    console.log("MIC RESULT: AAC DID NOT REMAIN HEALTHY.");
  }

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
  main().catch(err => {
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
console.log("GINI NATIVE PTZ PHYSICAL-MOVEMENT TEST");
console.log("==================================================");
console.log("Uses exact CameraSDK sample values:");
console.log("LEFT=type 4,param 6 | RIGHT=type 5,param 6 | STOP=type 0,param 0");
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
