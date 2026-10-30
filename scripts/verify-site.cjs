#!/usr/bin/env node
// Verify that accessibility, privacy, discovery and security remain intact.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

try {
  const root = path.resolve(__dirname, "..");
  const read = name => fs.readFileSync(path.join(root, name), "utf8");
  const home = read("index.html");
  const privacy = read("privacy.html");
  const robots = read("robots.txt");
  const sitemap = read("sitemap.xml");
  const config = read("netlify.toml");
  for (const id of ["return-form", "saved-list", "calendar-button",
                    "reminder-days", "result-panel"]) {
    assert.ok(home.includes(`id="${id}"`), `Missing control ${id}`);
  }
  assert.ok(home.includes('rel="canonical" href="https://returnby-tool.netlify.app/"'));
  assert.match(privacy, /local storage/i);
  assert.match(home, /retailer.s actual policy/i);
  assert.match(robots, /returnby-tool\.netlify\.app\/sitemap\.xml/);
  assert.match(sitemap, /returnby-tool\.netlify\.app/);
  for (const policy of ["Content-Security-Policy", "Strict-Transport-Security",
                       "X-Frame-Options", "Referrer-Policy"]) {
    assert.ok(config.includes(policy), `Missing security policy: ${policy}`);
  }
  assert.ok(!home.includes('onload='), "Unexpected inline event handler");
  console.log("PASS: calculator controls, privacy, SEO and response policies");
} catch (error) {
  console.error("ReturnBy site-contract check failed:", error);
  process.exitCode = 1;
}
