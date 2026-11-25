#!/usr/bin/env node
/**
 * Refreshes public/data/snapshot.json and publishes public/ to the gh-pages branch.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

run("node scripts/fetch-data.mjs");
run("git add public/data/snapshot.json");
try {
  execSync("git diff --cached --quiet", { cwd: root });
} catch {
  run('git commit -m "chore: refresh snapshot.json"');
}

const commitSha = execSync("git subtree split --prefix public", {
  cwd: root,
  encoding: "utf8",
}).trim();
run(`git push -f origin ${commitSha}:refs/heads/gh-pages`);
console.log("Published public/ to gh-pages branch.");
