"use strict";

const assert = require("assert");
const {
  H264BootstrapCache,
  extractAnnexBNals,
  findStartCodes,
  isVideoFrameType
} = require("./gini-xsight-h264-bridge");

const sample = Buffer.concat([
  Buffer.from([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x1f]),
  Buffer.from([0, 0, 0, 1, 0x68, 0xee, 0x3c, 0x80]),
  Buffer.from([0, 0, 1, 0x65, 0x88, 0x84, 0x21])
]);

assert.deepStrictEqual(
  findStartCodes(sample).map(x => x.index),
  [0, 8, 16]
);

assert.deepStrictEqual(
  extractAnnexBNals(sample).map(x => x.type),
  [7, 8, 5]
);

const cache = new H264BootstrapCache();
cache.observe(sample);

const bootstrap = cache.payload();
assert(bootstrap.length > 0);
assert.deepStrictEqual(
  extractAnnexBNals(bootstrap).map(x => x.type),
  [7, 8, 5]
);

assert.strictEqual(isVideoFrameType(0), false);
assert.strictEqual(isVideoFrameType(1), true);
assert.strictEqual(isVideoFrameType(2), true);

console.log("gini-xsight-h264-bridge tests: PASS");
