// Decides whether a Claude Code tool call touches a .env file.
// Used by block-env-files.mjs (the hook) and tested in env-guard.test.mjs.

// ".env" as its own path segment or word, plus optional suffixes:
// .env, .env.local, .env.production.local, ./config/.env, ...
// It does NOT match process.env, .envrc, or my.env-thing.
const ENV_FILE =
  /(?:^|[^A-Za-z0-9_.-])(\.env(?:\.[A-Za-z0-9_-]+)*)(?=$|[^A-Za-z0-9_.-])/g;

// The template holds variable names without values, so it isn't a secret.
const ALLOWED = new Set([".env.example"]);

// Fields that hold a file path or path pattern, per tool. For file tools only
// these are checked, so editing a document that merely mentions ".env" is fine.
const PATH_FIELDS = {
  Read: ["file_path"],
  Edit: ["file_path"],
  Write: ["file_path"],
  NotebookEdit: ["notebook_path"],
  Grep: ["path", "glob"],
  Glob: ["pattern", "path"],
};

/** Returns the first .env file name found in the text, or null. */
export function findEnvFile(text) {
  if (typeof text !== "string") return null;
  for (const match of text.matchAll(ENV_FILE)) {
    if (!ALLOWED.has(match[1])) return match[1];
  }
  return null;
}

/** Returns the .env file a tool call would touch, or null if it's safe. */
export function envFileTouchedBy(toolName, toolInput = {}) {
  if (toolName === "Bash") return findEnvFile(toolInput.command);

  for (const field of PATH_FIELDS[toolName] ?? []) {
    const found = findEnvFile(toolInput[field]);
    if (found) return found;
  }
  return null;
}
