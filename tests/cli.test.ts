import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

const runCli = (...args: ReadonlyArray<string>) =>
  spawnSync(process.execPath, ["src/cli.ts", ...args], {
    cwd: rootDirectory,
    encoding: "utf8",
  });

void test("root help lists the available subcommands", () => {
  const result = runCli("--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /SUBCOMMANDS/);
  assert.match(result.stdout, /pair/);
  assert.match(result.stdout, /diagnose/);
});

void test("pair help exposes the pairing flags", () => {
  const result = runCli("pair", "--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--ssid string/);
  assert.match(result.stdout, /--password string/);
});

void test("diagnose help exposes the diagnostics flags", () => {
  const result = runCli("diagnose", "--help");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--interface string/);
  assert.match(result.stdout, /--capture-path string/);
});
