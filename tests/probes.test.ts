import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { Effect } from "effect";

import { runPingStep, runUdpProbeSection } from "../src/lib/diagnose/probes.ts";
import {
  type DiagnoseOptions,
  type Reporter,
} from "../src/lib/diagnose/types.ts";
import type { CapturedCommandResult } from "../src/lib/process.ts";
import type { UdpResponse } from "../src/lib/udp.ts";

function createReporter() {
  const sections: string[] = [];
  const lines: string[] = [];

  const reporter: Reporter = {
    line: (text = "") =>
      Effect.sync(() => {
        lines.push(text);
      }),
    section: (title) =>
      Effect.sync(() => {
        sections.push(title);
      }),
    flush: () => Effect.void,
  };

  return { reporter, sections, lines };
}

function makeDiagnoseOptions(): DiagnoseOptions {
  return {
    interfaceName: "en0",
    targetIp: "10.10.100.254",
    gatewayIp: "10.10.100.1",
    broadcastIp: "10.10.100.255",
    targetPort: 48_899,
    probeTimeoutMs: 3000,
    captureSeconds: 4,
    reportPath: "/tmp/s20-diag.txt",
    capturePath: "/tmp/s20-tcpdump.txt",
    platform: "darwin",
  };
}

function makeCapturedCommandResult(stdout: string): CapturedCommandResult {
  const noSignal = spawnSync(process.execPath, ["-e", ""], {
    encoding: "utf8",
  }).signal;

  return {
    command: "ping",
    args: ["-c2", "-W500", "10.10.100.254"],
    stdout,
    stderr: "",
    combined: stdout,
    exitCode: 0,
    signal: noSignal,
  };
}

void test("runPingStep records captured ping output via an injected runner", async () => {
  const { reporter, sections, lines } = createReporter();

  await Effect.runPromise(
    runPingStep(
      "10.10.100.254",
      makeDiagnoseOptions(),
      reporter,
      { ping: true },
      () => Effect.succeed(makeCapturedCommandResult("PING OK\n")),
    ),
  );

  assert.deepEqual(sections, ["ping -c2 -W500 10.10.100.254"]);
  assert.deepEqual(lines, ["PING OK"]);
});

void test("runUdpProbeSection probes the three targets sequentially with an injected sender", async () => {
  const { reporter, sections, lines } = createReporter();
  const calls: string[] = [];

  await Effect.runPromise(
    runUdpProbeSection(makeDiagnoseOptions(), reporter, (options) => {
      calls.push(options.targetIp);

      const response: readonly UdpResponse[] =
        options.targetIp === "10.10.100.255"
          ? [{ ip: "10.10.100.254", port: 48_899, text: "first" }]
          : options.targetIp === "10.10.100.254"
            ? [{ ip: "10.10.100.254", port: 48_899, text: "second" }]
            : [];

      return Effect.succeed(response);
    }),
  );

  assert.deepEqual(sections, ["TypeScript UDP probes (broadcast + unicast)"]);
  assert.deepEqual(calls, [
    "10.10.100.255",
    "10.10.100.254",
    "255.255.255.255",
  ]);
  assert.deepEqual(lines, [
    "[broadcast] sent HF-A11ASSISTHREAD -> 10.10.100.255:48899",
    '[broadcast] reply from (10.10.100.254, 48899): "first"',
    "[unicast] sent HF-A11ASSISTHREAD -> 10.10.100.254:48899",
    '[unicast] reply from (10.10.100.254, 48899): "second"',
    "[global-broadcast] sent HF-A11ASSISTHREAD -> 255.255.255.255:48899",
    "[global-broadcast] (no replies)",
  ]);
});
