const fs = require("fs");

require("./esee-sdk/CameraSDK/play");

const Player = global.VideoPlayer;
const API = global.ConnectApi;

const IP = "172.14.10.1";
const PORT = 10000;

let phase = "connecting";
let activeConn = null;
let started = false;
let hangupRetries = 0;
let hangupTimer = null;

function getPCM(wav) {
    let pos = 12;

    while (pos + 8 <= wav.length) {
        const id = wav.toString("ascii", pos, pos + 4);
        const size = wav.readUInt32LE(pos + 4);

        if (id === "data") {
            return wav.subarray(pos + 8, pos + 8 + size);
        }

        pos += 8 + size;
        if (pos & 1) pos++;
    }

    throw new Error("PCM data not found");
}

function downsample16to8(pcm) {
    const inputSamples = Math.floor(pcm.length / 2);
    const outputSamples = Math.floor(inputSamples / 2);
    const out = new Int16Array(outputSamples);

    for (let i = 0; i < outputSamples; i++) {
        const a = pcm.readInt16LE(i * 4);
        const b = pcm.readInt16LE(i * 4 + 2);

        let sample = Math.round((a + b) / 2);
        sample = Math.round(sample * 0.85);
        sample = Math.max(-32768, Math.min(32767, sample));
        out[i] = sample;
    }

    return out;
}

const segEnd = [
    0x1F, 0x3F, 0x7F, 0xFF,
    0x1FF, 0x3FF, 0x7FF, 0xFFF
];

function alaw(sample) {
    sample >>= 3;

    let mask;

    if (sample >= 0) {
        mask = 0xD5;
    } else {
        mask = 0x55;
        sample = -sample - 1;
    }

    let seg;

    for (seg = 0; seg < 8; seg++) {
        if (sample <= segEnd[seg]) break;
    }

    if (seg >= 8) return 0x7F ^ mask;

    let val = seg << 4;

    if (seg < 2) {
        val |= (sample >> 1) & 0x0F;
    } else {
        val |= (sample >> seg) & 0x0F;
    }

    return val ^ mask;
}

function buildAudio() {
    const wav = fs.readFileSync("D:/Gini/gini-clean.wav");
    const pcm = getPCM(wav);
    const samples = downsample16to8(pcm);
    const encoded = Buffer.alloc(samples.length);

    for (let i = 0; i < samples.length; i++) {
        encoded[i] = alaw(samples[i]);
    }

    return encoded;
}

function sendFrame(data) {
    Player.CallSend(
        "",
        IP,
        0,
        Math.floor(Date.now() / 1000),
        "G711A",
        8000,
        16,
        1,
        1,
        new Uint8Array(data),
        data.length
    );
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function disconnectCleanly() {
    if (hangupTimer) {
        clearTimeout(hangupTimer);
        hangupTimer = null;
    }

    phase = "done";

    console.log("Talkback closed cleanly.");
    console.log("Waiting for camera audio path to settle...");

    setTimeout(() => {
        try {
            Player.DisConnectDevice("", IP);
        } catch {}

        setTimeout(() => process.exit(0), 500);
    }, 1200);
}

function requestHangup() {
    if (!activeConn) {
        console.error("No active connection for talkback hangup.");
        process.exit(3);
        return;
    }

    phase = "hanging-up";

    try {
        activeConn.streamlist[0].calling = false;
    } catch {}

    console.log("Requesting TALKBACK HANGUP on the same session...");

    API.vop2p_hangup(activeConn, 0);

    if (hangupTimer) clearTimeout(hangupTimer);

    hangupTimer = setTimeout(() => {
        hangupRetries++;

        if (hangupRetries <= 2) {
            console.log("No hangup acknowledgement yet. Retrying", hangupRetries, "of 2...");
            requestHangup();
            return;
        }

        console.error("");
        console.error("TALKBACK HANGUP WAS NOT ACKNOWLEDGED.");
        console.error("Not disconnecting silently because that previously left the mic stuck.");
        console.error("Run the camera reboot recovery before using the microphone again.");
        process.exit(4);
    }, 2500);
}

async function speak() {
    if (started) return;

    started = true;
    phase = "speaking";

    const audio = buildAudio();

    console.log("");
    console.log("Clean G711A:", audio.length, "bytes");
    console.log("GINI SPEAKING SAFE...");
    console.log("");

    const silence = Buffer.alloc(160, 0xD5);

    for (let x = 0; x < 5; x++) {
        sendFrame(silence);
        await sleep(20);
    }

    const start = performance.now();
    let frame = 0;

    for (let offset = 0; offset < audio.length; offset += 160) {
        let chunk = audio.subarray(
            offset,
            Math.min(offset + 160, audio.length)
        );

        if (chunk.length < 160) {
            const padded = Buffer.alloc(160, 0xD5);
            chunk.copy(padded);
            chunk = padded;
        }

        sendFrame(chunk);
        frame++;

        const target = start + frame * 20;
        const wait = target - performance.now();

        if (wait > 0) await sleep(wait);
    }

    // Longer clean tail before hangup.
    for (let x = 0; x < 10; x++) {
        sendFrame(silence);
        await sleep(20);
    }

    console.log("Speech frames complete.");

    // Give the device time to drain its speaker buffer before hangup.
    await sleep(450);

    requestHangup();
}

API.onconnect = function (conn, code) {
    console.log("CONNECT:", code);

    if (code !== 0) process.exit(1);

    activeConn = conn;
    API.login(conn, "admin", "");
};

API.onloginresult = function (conn, result) {
    console.log("LOGIN:", result);

    if (result !== 0) process.exit(1);

    activeConn = conn;
    conn.logined = true;

    phase = "opening-call";

    console.log("Opening Gini speaker...");
    Player.OpenCall("", IP, 0);
};

API.onvop2pcallresult = function (conn, result) {
    activeConn = conn;

    if (phase === "opening-call") {
        console.log("TALKBACK OPEN:", result);

        if (result !== 0) {
            console.error("Talkback open failed:", result);
            process.exit(2);
            return;
        }

        speak().catch(err => {
            console.error(err);
            process.exit(2);
        });

        return;
    }

    if (phase === "hanging-up") {
        console.log("TALKBACK HANGUP:", result);

        if (result === 0) {
            disconnectCleanly();
            return;
        }

        hangupRetries++;

        if (hangupRetries <= 2) {
            console.log("Hangup returned", result, "- retrying", hangupRetries, "of 2...");
            setTimeout(requestHangup, 500);
            return;
        }

        console.error("");
        console.error("Talkback hangup failed:", result);
        console.error("Not disconnecting as if shutdown succeeded.");
        process.exit(4);
    }
};

console.log("Connecting to Gini...");

Player.ConnectDevice(
    "",
    IP,
    "admin",
    "",
    0,
    PORT,
    0,
    0,
    0,
    "",
    null
);
