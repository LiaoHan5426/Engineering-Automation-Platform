/**
 * Static guard: Electron 45 sandboxed preload must stay CommonJS.
 * Does not launch Electron; fails CI/local if preload regresses to ESM.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const preloadPath = path.join(__dirname, "preload.cjs");
const source = fs.readFileSync(preloadPath, "utf8");

const problems = [];
if (!fs.existsSync(preloadPath)) problems.push("missing preload.cjs");
if (/\bimport\s+/.test(source) || /\bexport\s+/.test(source)) {
  problems.push("preload.cjs must not use ESM import/export (Electron 45 sandbox)");
}
if (!/require\(['"]electron['"]\)/.test(source)) {
  problems.push("preload.cjs must require('electron')");
}
if (!/contextBridge\.exposeInMainWorld\(['"]eap['"]/.test(source)) {
  problems.push("preload.cjs must expose window.eap");
}

const mainPath = path.join(__dirname, "main.mjs");
const main = fs.readFileSync(mainPath, "utf8");
if (!main.includes("preload.cjs")) {
  problems.push("main.mjs must load preload.cjs");
}
if (!/sandbox:\s*true/.test(main)) {
  problems.push("main.mjs must keep sandbox:true");
}

if (problems.length) {
  console.error("desktop preload check failed:");
  for (const item of problems) console.error(` - ${item}`);
  process.exit(1);
}

console.log("desktop preload check ok (Electron 45 CJS sandbox contract)");
