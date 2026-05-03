import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlatformDiagnoseSteps,
  type DiagnoseStep,
  resolveDiagnoseOptions,
  resolveDiagnoseStepAvailability,
} from "../src/lib/diagnose.ts";

function makeRawDiagnoseOptions() {
  return {
    interfaceName: undefined,
    targetIp: "10.10.100.254",
    gatewayIp: "10.10.100.1",
    broadcastIp: "10.10.100.255",
    targetPort: 48_899,
    probeTimeoutMs: 3000,
    captureSeconds: 4,
  };
}

void test("resolveDiagnoseOptions defaults to en0 on macOS", () => {
  const resolved = resolveDiagnoseOptions(makeRawDiagnoseOptions(), "darwin");
  assert.equal(resolved.interfaceName, "en0");
  assert.equal(resolved.platform, "darwin");
});

void test("resolveDiagnoseOptions leaves the interface unset on Linux", () => {
  const resolved = resolveDiagnoseOptions(makeRawDiagnoseOptions(), "linux");
  assert.equal(resolved.interfaceName, undefined);
  assert.equal(resolved.platform, "linux");
});

void test("buildPlatformDiagnoseSteps returns macOS-specific checks", () => {
  const steps = buildPlatformDiagnoseSteps(
    resolveDiagnoseOptions(makeRawDiagnoseOptions(), "darwin"),
  );
  const [firstStep] = steps;

  assert.notEqual(firstStep, undefined);

  if (firstStep?.kind !== "command") {
    assert.fail("expected a macOS command step");
  }

  assert.equal(firstStep.command, "networksetup");
  assert.match(firstStep.header, /getairportnetwork/);
});

void test("buildPlatformDiagnoseSteps returns Linux-specific checks", () => {
  const steps = buildPlatformDiagnoseSteps(
    resolveDiagnoseOptions(makeRawDiagnoseOptions(), "linux"),
  );
  const [firstStep] = steps;

  assert.notEqual(firstStep, undefined);

  if (firstStep?.kind !== "command") {
    assert.fail("expected a Linux command step");
  }

  assert.equal(firstStep.command, "ip");
});

void test("resolveDiagnoseStepAvailability marks missing commands as skipped", () => {
  const step: DiagnoseStep = {
    kind: "command",
    header: "tcpdump",
    command: "tcpdump",
    args: ["-n"],
    requiredCommands: ["tcpdump"],
  };

  const resolved = resolveDiagnoseStepAvailability(step, { tcpdump: false });
  assert.equal(resolved.kind, "skip");
  assert.match(resolved.reason, /missing command/);
});
