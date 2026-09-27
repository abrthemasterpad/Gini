"use strict";

require("./gini-env");
require("../esee-sdk/CameraSDK/play");

const readline = require("readline");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = process.env.GINI_CAMERA_IP || "172.14.10.1";
const PORT = Number(process.env.GINI_CAMERA_PORT || 10000);
const USER = process.env.GINI_CAMERA_USER || "admin";
const PASS = process.env.GINI_CAMERA_PASSWORD || "";

const args = process.argv.slice(2);
const pulseIndex = args.indexOf("--pulse-ms");
const PULSE_MS = Math.max(
  100,
  Math.min(
    800,
    Number(
      pulseIndex >= 0 && args[pulseIndex + 1]
        ? args[pulseIndex + 1]
        : process.env.GINI_VISION_PULSE_MS || 250
    )
  )
);

const PARAM = 6;

const PTZ_TYPES = {
  up: 2,
  down: 3,
  left: 4,
  right: 5
};

let connection = null;
let ready = false;
let busy = false;
let stopping = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connect() {
  Player.ConnectDevice(
    "",
    IP,
    USER,
    PASS,
    0,
    PORT,
    0,
    0,
    0,
    "",
    null
  );
}

async function pulse(direction) {
  const type = PTZ_TYPES[direction];

  if (!type || !ready || busy || stopping) {
    return false;
  }

  busy = true;

  try {
    Player.ptz_ctrl("", IP, 0, type, PARAM);
    await sleep(PULSE_MS);
    Player.ptz_ctrl("", IP, 0, 0, 0);
    await sleep(180);
    return true;
  } finally {
    busy = false;
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;

  try {
    Player.ptz_ctrl("", IP, 0, 0, 0);
  } catch {}

  try {
    Player.DisConnectDevice("", IP);
  } catch {}

  setTimeout(() => process.exit(code), 250);
}

API.onconnect = function (conn, code) {
  if (code !== 0) {
    process.stdout.write("ERROR connect=" + code + "\n");
    shutdown(2);
    return;
  }

  connection = conn;
  API.login(conn, USER, PASS);
};

API.onloginresult = function (conn, result) {
  if (result !== 0) {
    process.stdout.write("ERROR login=" + result + "\n");
    shutdown(2);
    return;
  }

  connection = conn;
  connection.logined = true;
  ready = true;
  process.stdout.write("READY\n");
  process.stdout.write("GINI_PTZ_READY\n");
};

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async line => {
  const cmd = line.trim().toLowerCase();

  if (cmd === "quit" || cmd === "exit") {
    shutdown(0);
    return;
  }

  if (!PTZ_TYPES[cmd]) {
    process.stdout.write("IGNORED " + cmd + "\n");
    process.stdout.write("GINI_PTZ_ACK IGNORED " + cmd + "\n");
    return;
  }

  if (!ready) {
    process.stdout.write("NOT_READY\n");
    process.stdout.write("GINI_PTZ_ACK NOT_READY\n");
    return;
  }

  if (busy) {
    process.stdout.write("BUSY\n");
    process.stdout.write("GINI_PTZ_ACK BUSY\n");
    return;
  }

  const ok = await pulse(cmd);
  process.stdout.write(ok ? "MOVED " + cmd + "\n" : "BLOCKED " + cmd + "\n");
  process.stdout.write(
    "GINI_PTZ_ACK " +
    (ok ? "MOVED " + cmd : "BLOCKED " + cmd) +
    "\n"
  );
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

connect();

setTimeout(() => {
  if (!ready && !stopping) {
    process.stdout.write("ERROR timeout\n");
    shutdown(2);
  }
}, 10000);
