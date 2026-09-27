"use strict";

require("./gini-env");

const brain = require("./gini-assistant-brain");

(async () => {
  console.log("==================================================");
  console.log("GINI AI STATUS v0.4.0");
  console.log("==================================================");
  console.log("Provider:", brain.config.provider);
  console.log("Model:", brain.config.ollamaModel);
  console.log("Memory:", brain.config.memoryEnabled ? "ON" : "OFF");

  const health = await brain.providerHealth();

  console.log("Ready:", health.ok ? "YES" : "NO");
  console.log("Detail:", health.detail);

  if (health.models && health.models.length) {
    console.log("Installed models:", health.models.join(", "));
  }

  process.exitCode = health.ok ? 0 : 2;
})().catch(error => {
  console.error("Status check failed:", error.message);
  process.exitCode = 2;
});
