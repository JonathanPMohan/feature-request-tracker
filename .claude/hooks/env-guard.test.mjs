import { describe, expect, it } from "vitest";

import { envFileTouchedBy, findEnvFile } from "./env-guard.mjs";

describe("envFileTouchedBy: Bash commands", () => {
  it.each([
    ["cat .env", ".env"],
    ["less ./.env", ".env"],
    ["source .env && npm run dev", ".env"],
    ["cp .env.example .env", ".env"],
    ["cat .env.local", ".env.local"],
    ["cat config/.env.production.local", ".env.production.local"],
    ['grep DATABASE_URL ".env"', ".env"],
    ["git add .env", ".env"],
  ])("blocks %j", (command, file) => {
    expect(envFileTouchedBy("Bash", { command })).toBe(file);
  });

  it.each([
    "cat .env.example",
    "npm run test:integration",
    "node -e 'console.log(process.env.NODE_ENV)'",
    "cat .envrc",
    "ls my.env-files",
    "git status",
  ])("allows %j", (command) => {
    expect(envFileTouchedBy("Bash", { command })).toBeNull();
  });
});

describe("envFileTouchedBy: file tools", () => {
  it.each([
    ["Read", { file_path: "/repo/.env" }],
    ["Edit", { file_path: "/repo/.env.local" }],
    ["Write", { file_path: ".env" }],
    ["Grep", { pattern: "SECRET", path: "/repo/.env" }],
    ["Grep", { pattern: "SECRET", glob: ".env*" }],
    ["Glob", { pattern: "**/.env" }],
  ])("blocks %s %j", (tool, input) => {
    expect(envFileTouchedBy(tool, input)).not.toBeNull();
  });

  it("allows the .env.example template", () => {
    expect(
      envFileTouchedBy("Read", { file_path: "/repo/.env.example" }),
    ).toBeNull();
  });

  it("allows editing a document that only mentions .env in its content", () => {
    const input = {
      file_path: "/repo/docs/LOCAL_DEVELOPMENT.md",
      new_string: "cp .env.example .env",
    };
    expect(envFileTouchedBy("Edit", input)).toBeNull();
  });

  it("allows a Grep whose search pattern (not path) mentions .env", () => {
    expect(
      envFileTouchedBy("Grep", { pattern: "\\.env", path: "/repo/src" }),
    ).toBeNull();
  });

  it("ignores tools it doesn't know", () => {
    expect(
      envFileTouchedBy("WebFetch", { url: "https://example.com/.env" }),
    ).toBeNull();
  });
});

describe("findEnvFile", () => {
  it("returns null for missing input", () => {
    expect(findEnvFile(undefined)).toBeNull();
  });

  it("finds a real .env file even after an allowed .env.example", () => {
    expect(findEnvFile("diff .env.example .env")).toBe(".env");
  });
});
