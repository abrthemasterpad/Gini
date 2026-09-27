"use strict";

require("./gini-env");
require("../esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";

const direction = String(process.argv[2] || "").toLowerCase();
const pulseMs = Math.max(60, Math.min(500, Number(process.argv[3] || 100)));
const speed = Math.max(1, Math.min(5, Number(process.argv[4] || 1)));

const TYPES = {
  up: 2,
  down: 3,
  left: 4,
  right: 5
};

if (!TYPES[direction]) {
  console.error("Usage: node .\\scripts\\gini-vision-ptz-calibrate.js left|right|up|down [pulseMs] [speed1to5]");
  process.exit(2);
}

let phase = "connect";
let stopped = false;
let watchdog = null;

function done(code, message) {
  if (stopped) return;
  stopped = true;

  if (watchdog) clearTimeout(watchdog);

  try {
    Player.ptz_ctrl("", IP, 0, 0, 0);
  } catch {}

  console.log(message);

  setTimeout(() => {
    try {
      Player.DisConnectDevice("", IP);
    } catch {}

    setTimeout(() => process.exit(code), 250);
  }, 300);
}

function arm(label, ms = 2500) {
  if (watchdog) clearTimeout(watchdog);

  watchdog = setTimeout(() => {
    try {
      Player.ptz_ctrl("", IP, 0, 0, 0);
    } catch {}

    done(2, "FAIL: timeout waiting for " + label + ". Emergency STOP sent.");
  }, ms);
}

API.onconnect = function (conn, code) {
  console.log("CONNECT:", code);

  if (code !== 0) {
    done(2, "FAIL: connect");
    return;
  }

  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  console.log("LOGIN:", result);

  if (result !== 0) {
    done(2, "FAIL: login");
    return;
  }

  conn.logined = true;
  phase = "wait-move-ack";

  console.log("");
  console.log("ONE-PULSE PTZ CALIBRATION");
  console.log("Direction:", direction);
  console.log("Speed:", speed, "(CameraSDK documented range 1-5)");
  console.log("Pulse starts AFTER movement ACK:", pulseMs, "ms");
  console.log("");

  Player.ptz_ctrl("", IP, 0, TYPES[direction], speed);
  arm("MOVE ACK");
};

API.onptzresult = function (_conn, result) {
  console.log("PTZ RESULT:", result, "phase=" + phase);

  if (phase === "wait-move-ack") {
    if (result !== 0) {
      done(2, "FAIL: movement rejected");
      return;
    }

    if (watchdog) clearTimeout(watchdog);
    phase = "moving";

    console.log("MOVE ACK received. Timing physical pulse now...");

    setTimeout(() => {
      if (stopped || phase !== "moving") return;

      phase = "wait-stop-ack";
      console.log("Sending STOP...");
      Player.ptz_ctrl("", IP, 0, 0, 0);
      arm("STOP ACK");
    }, pulseMs);

    return;
  }

  if (phase === "wait-stop-ack") {
    if (result !== 0) {
      done(2, "FAIL: STOP rejected; emergency STOP sent");
      return;
    }

    phase = "done";
    done(0, "PASS: MOVE acknowledged -> timed pulse -> STOP acknowledged.");
  }
};

console.log("Connecting for a SINGLE motor pulse only...");
Player.ConnectDevice("", IP, USER, PASS, 0, PORT, 0, 0, 0, "", null);

setTimeout(() => {
  if (!stopped && phase === "connect") {
    done(2, "FAIL: connection timeout");
  }
}, 10000);

process.on("SIGINT", () => done(130, "Stopped by user. Emergency STOP sent."));
process.on("SIGTERM", () => done(143, "Stopped. Emergency STOP sent."));
