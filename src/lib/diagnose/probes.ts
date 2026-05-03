import * as os from "node:os";

import { Effect } from "effect";

import { findLocalBindIp } from "../network.ts";
import { runCapturedCommand } from "../process.ts";
import { discoveryMessage } from "../s20.ts";
import { sendUdpOnce } from "../udp.ts";
import { normalizeCapturedOutput } from "./format.ts";
import type { DiagnoseOptions, Reporter } from "./types.ts";

export const runPingStep = (
  host: string,
  options: DiagnoseOptions,
  reporter: Reporter,
  availableCommands: Readonly<Record<string, boolean>>,
) =>
  Effect.gen(function* () {
    const args =
      options.platform === "darwin"
        ? ["-c2", "-W500", host]
        : options.platform === "linux"
          ? ["-c2", "-W1", host]
          : ["-c2", host];

    yield* reporter.section(`ping ${args.join(" ")}`);

    if (!availableCommands["ping"]) {
      yield* reporter.line("Skipped: missing command ping");
      return;
    }

    try {
      const result = yield* runCapturedCommand("ping", args);
      yield* reporter.line(normalizeCapturedOutput(result));
    } catch (error) {
      yield* reporter.line(
        `Error running ping: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

const probeUdp = (
  label: string,
  targetIp: string,
  enableBroadcast: boolean,
  options: DiagnoseOptions,
) =>
  Effect.gen(function* () {
    const localBindIp =
      findLocalBindIp(options.targetIp) ?? findLocalBindIp(options.broadcastIp);

    try {
      const responses = yield* sendUdpOnce({
        message: discoveryMessage,
        targetIp,
        targetPort: options.targetPort,
        localBindIp,
        enableBroadcast,
        expectResponse: true,
        finishOnFirstReply: false,
        timeoutMs: options.probeTimeoutMs,
      });

      return [
        `[${label}] sent ${discoveryMessage} -> ${targetIp}:${String(options.targetPort)}`,
        ...(responses.length === 0
          ? [`[${label}] (no replies)`]
          : responses.map(
              (response) =>
                `[${label}] reply from (${response.ip}, ${String(response.port)}): ${JSON.stringify(response.text)}`,
            )),
      ];
    } catch (error) {
      return [
        `[${label}] send error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ];
    }
  });

export const runUdpProbeSection = (
  options: DiagnoseOptions,
  reporter: Reporter,
) =>
  Effect.gen(function* () {
    yield* reporter.section("TypeScript UDP probes (broadcast + unicast)");

    const probeTargets: ReadonlyArray<readonly [string, string, boolean]> = [
      ["broadcast", options.broadcastIp, true],
      ["unicast", options.targetIp, false],
      ["global-broadcast", "255.255.255.255", true],
    ];
    const lines: string[] = [];

    // Reuse the same local UDP port safely by probing one target at a time.
    for (const [label, targetIp, enableBroadcast] of probeTargets) {
      lines.push(
        ...(yield* probeUdp(label, targetIp, enableBroadcast, options)),
      );
    }

    for (const line of lines) {
      yield* reporter.line(line);
    }
  });

export const runNodeSnapshot = (options: DiagnoseOptions, reporter: Reporter) =>
  Effect.gen(function* () {
    yield* reporter.section("Node network snapshot");

    const networkInterfaces = os.networkInterfaces();
    const matchingAddress =
      findLocalBindIp(options.targetIp) ?? findLocalBindIp(options.broadcastIp);

    yield* reporter.line(
      JSON.stringify(
        {
          platform: process.platform,
          hostname: os.hostname(),
          interfaceName: options.interfaceName,
          matchingAddress,
          networkInterfaces,
        },
        undefined,
        2,
      ),
    );
  });
