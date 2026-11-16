// PreToolUse hook (Read|Edit|Write|Bash).
// Blocks: secrets and signing files (any access), edits to generated atlases, edits to committed save fixtures.
// Exit 2 = block, stderr is shown to Claude. Exit 0 = no decision.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const tool = input?.tool_name ?? '';

const block = (reason) => {
  process.stderr.write(`Blocked by .claude/hooks/guard-paths.mjs: ${reason}\n`);
  process.exit(2);
};

const SECRETS_HINT =
  'Secrets and signing files are off-limits. Use .env.example and ask the user to update local secrets/keystores.';

// Bash: block commands that reference a .env file (anything but .env.example) or a concrete keystore/signing file.
if (tool === 'Bash') {
  const command = String(input?.tool_input?.command ?? '');
  if (/(?:^|[\s'"=<>|;&(/\\])\.env(?:\.(?!example\b)[\w-]+)*(?=$|[\s'"<>|;&)])/.test(command)) {
    block(`command references a .env file. ${SECRETS_HINT}`);
  }
  if (/[\w-]+\.(?:jks|keystore|p12)\b|(?:^|[\s'"/\\])(?:key|keystore)\.properties\b/.test(command)) {
    block(`command references a keystore / signing file. ${SECRETS_HINT}`);
  }
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = path.relative(root, filePath).split(path.sep).join('/');
const base = path.basename(filePath);

if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
  block(`"${rel}" is a secrets file. ${SECRETS_HINT}`);
}
if (/\.(jks|keystore|p12)$/i.test(base) || /^(key|keystore)\.properties$/i.test(base)) {
  block(`"${rel}" is a signing file. ${SECRETS_HINT}`);
}

if (tool === 'Read') process.exit(0);

// Generated output: atlases are rebuilt from assets-src/ by `pnpm sprites`.
if (/^public\/atlases\//.test(rel)) {
  block(`"${rel}" is generated. Edit the source in assets-src/ and run \`pnpm sprites\` (see /sprite).`);
}

// Save fixtures are snapshots of real old save formats. Once tracked by git they are immutable,
// otherwise migration tests stop proving anything. Add a new fixture instead (see /save-migration).
if (/^tests\/fixtures\/saves\/.+/.test(rel) && existsSync(filePath)) {
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, stdio: 'ignore' });
  // status 1 = untracked; anything else (tracked, or git unavailable) → treat as immutable.
  if (tracked.status !== 1) {
    block(`"${rel}" is a committed save fixture. Add a new fixture for the new version instead (see /save-migration).`);
  }
}

process.exit(0);
