import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

// Get commits since last tag
let commits;
try {
  const lastTag = execSync("git describe --tags --abbrev=0 HEAD^", {
    encoding: "utf8",
    cwd: root,
  }).trim();
  commits = execSync(`git log ${lastTag}..HEAD --oneline --no-decorate`, {
    encoding: "utf8",
    cwd: root,
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^[a-f0-9]+ /, "- "));
} catch {
  // No previous tag, get all commits
  commits = execSync("git log --oneline --no-decorate", {
    encoding: "utf8",
    cwd: root,
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^[a-f0-9]+ /, "- "));
}

const date = new Date().toISOString().split("T")[0];
const newEntry = `## [${version}] - ${date}\n${commits.join("\n")}\n`;

const changelogPath = join(root, "CHANGELOG.md");
let changelog;
try {
  changelog = readFileSync(changelogPath, "utf8");
} catch {
  changelog = "# Changelog\n\n";
}

// Insert after "# Changelog" header
const updatedChangelog = changelog.replace(
  /^# Changelog\n+/,
  `# Changelog\n\n${newEntry}\n`
);

writeFileSync(changelogPath, updatedChangelog);

// Stage the changelog
execSync("git add CHANGELOG.md", { cwd: root });

console.log(`Updated CHANGELOG.md for v${version}`);
