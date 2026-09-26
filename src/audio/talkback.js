'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '../..');
function config() {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const ip = process.env.GINI_CAMERA_IP;
  const port = Number(process.env.GINI_CAMERA_PORT || 10000);
  if (!ip || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('Set GINI_CAMERA_IP and a valid GINI_CAMERA_PORT in .env');
  return { ip, port, user: process.env.GINI_CAMERA_USER || 'admin', password: process.env.GINI_CAMERA_PASSWORD || '' };
}
function pcmFromWav(wav) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw Error('Expected RIFF WAVE');
  let format, data;
  for (let pos = 12; pos + 8 <= wav.length;) {
    const id = wav.toString('ascii', pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    const end = pos + 8 + size;
    if (end > wav.length) throw Error('Truncated WAV chunk');
    if (id === 'fmt ') format = { codec: wav.readUInt16LE(pos + 8), channels: wav.readUInt16LE(pos + 10), rate: wav.readUInt32LE(pos + 12), bits: wav.readUInt16LE(pos + 22) };
    if (id === 'data') data = wav.subarray(pos + 8, end);
    pos = end + (size & 1);
  }
  if (!format || !data || format.codec !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16 || data.length % 4 !== 0) throw Error('Expected 16 kHz mono 16-bit PCM WAV');
  return data;
}
// Matches the encoding and level of the V2 script heard on the tested camera.
function alaw(sample) {
  sample >>= 3;
  let mask;
  if (sample >= 0) mask = 0xD5;
  else { mask = 0x55; sample = -sample - 1; }
  const ends = [0x1F, 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF];
  let seg = 0;
  while (seg < 8 && sample > ends[seg]) seg++;
  if (seg === 8) return 0x7F ^ mask;
  let value = seg << 4;
  value |= seg < 2 ? (sample >> 1) & 15 : (sample >> seg) & 15;
  return value ^ mask;
}
function encode(pcm) {
  const out = Buffer.alloc(pcm.length / 4);
  for (let i = 0; i < out.length; i++) {
    const sample = Math.round(((pcm.readInt16LE(i * 4) + pcm.readInt16LE(i * 4 + 2)) / 2) * 0.85);
    out[i] = alaw(sample);
  }
  return out;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const { ip, port, user, password } = config();
  const file = process.env.GINI_WAV_PATH;
  if (!file) throw Error('GINI_WAV_PATH is required; run scripts/gini-say.ps1');
  const audio = encode(pcmFromWav(fs.readFileSync(file)));
  const sdk = path.join(root, 'esee-sdk/CameraSDK/play');
  if (!fs.existsSync(sdk + '.js') && !fs.existsSync(sdk)) throw Error('Local CameraSDK missing: see README setup instructions');
  require(sdk);
  const player = global.VideoPlayer;
  const api = global.ConnectApi;
  if (!player || !api) throw Error('CameraSDK did not expose VideoPlayer and ConnectApi');
  let finished = false, started = false;
  const timeout = setTimeout(() => finish(1, 'Timed out waiting for camera response'), 15000);
  function finish(code, message) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (message) console.error(message);
    try { player.CallHangup('', ip, 0); } catch {}
    setTimeout(() => {
      try { player.DisConnectDevice('', ip); } catch {}
      process.exit(code);
    }, 700);
  }
  function frame(bytes) {
    player.CallSend('', ip, 0, Math.floor(Date.now() / 1000), 'G711A', 8000, 16, 1, 1, new Uint8Array(bytes), bytes.length);
  }
  api.onconnect = (conn, code) => {
    if (code !== 0) return finish(1, `Connection failed: ${code}`);
    api.login(conn, user, password);
  };
  api.onloginresult = (conn, result) => {
    if (result !== 0) return finish(1, `Login failed: ${result}`);
    conn.logined = true;
    player.OpenCall('', ip, 0);
  };
  api.onvop2pcallresult = (conn, result) => {
    if (result !== 0) return finish(1, `Talkback failed: ${result}`);
    if (started) return;
    started = true;
    clearTimeout(timeout);
    (async () => {
      const silence = Buffer.alloc(160, 0xD5);
      for (let n = 0; n < 5; n++) { frame(silence); await sleep(20); }
      const start = performance.now();
      let count = 0;
      for (let offset = 0; offset < audio.length; offset += 160) {
        const bytes = Buffer.alloc(160, 0xD5);
        audio.copy(bytes, 0, offset, Math.min(offset + 160, audio.length));
        frame(bytes);
        count++;
        await sleep(Math.max(0, start + count * 20 - performance.now()));
      }
      for (let n = 0; n < 5; n++) { frame(silence); await sleep(20); }
      await sleep(300);
      console.log('Speech sent to camera.');
      finish(0);
    })().catch(err => finish(1, err.message));
  };
  player.ConnectDevice('', ip, user, password, 0, port, 0, 0, 0, '', null);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
