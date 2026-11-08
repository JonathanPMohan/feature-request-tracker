#!/usr/bin/env node
// Claude Code PreToolUse hook: stops Claude from reading or touching .env files
// (secrets), through any tool. .env.example is allowed. See CLAUDE.md.
//
// Claude Code sends the pending tool call as JSON on stdin:
//   { "tool_name": "Bash", "tool_input": { "command": "cat .env" }, ... }
// Printing a "deny" decision blocks the call and shows Claude the reason.
// Printing nothing (and exiting 0) lets the call proceed.

import { envFileTouchedBy } from "./env-guard.mjs";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

const { tool_name: toolName, tool_input: toolInput } = JSON.parse(raw);
const file = envFileTouchedBy(toolName, toolInput);

if (file) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Blocked: this ${toolName} call touches "${file}", which may hold secrets. ` +
          "Claude must not read or change .env files (see CLAUDE.md). " +
          "Use .env.example for variable names, or ask Jonathan to make the change.",
      },
    }),
  );
}
