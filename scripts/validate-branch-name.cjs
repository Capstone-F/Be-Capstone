'use strict';

const { execSync } = require('node:child_process');

const PREFIXES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'perf',
  'build',
  'revert',
];
const MAX_LEN = 60;

function getBranch() {
  try {
    return execSync('git symbolic-ref --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function isGloballyAllowed(name) {
  if (name === 'main') return true;
  if (name.startsWith('release/')) return true;
  if (name.startsWith('hotfix/')) return true;
  if (name.startsWith('dependabot/')) return true;
  if (name.startsWith('cursor/')) return true;
  return false;
}

const pattern = new RegExp(
  `^(${PREFIXES.join('|')})\\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$`,
);

function fail(branch, extraLines = []) {
  console.error(`[branch-name] '${branch}' is not a valid branch name.`);
  for (const line of extraLines) {
    console.error(line);
  }
  console.error(`  Allowed prefixes: ${PREFIXES.join(', ')}`);
  console.error(`  Pattern        : <type>/<short-kebab-description>`);
  console.error(`  Example        : feat/auth0-google-login`);
  console.error(`  Rename with    : git branch -m <new-name>`);
  process.exit(1);
}

function main() {
  const branch = getBranch();
  if (!branch) {
    process.exit(0);
  }
  if (isGloballyAllowed(branch)) {
    process.exit(0);
  }
  if (!pattern.test(branch)) {
    fail(branch);
  }
  if (branch.length > MAX_LEN) {
    fail(branch, [
      `  Reason         : Branch name exceeds max length (${branch.length} > ${MAX_LEN} characters).`,
    ]);
  }
  process.exit(0);
}

main();
