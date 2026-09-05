import { Effect } from "effect";

import { normalizeCapturedOutput } from "./diagnose/format.ts";
import { buildPlatformDiagnoseSteps } from "./diagnose/platform-steps.ts";
import {
  runNodeSnapshot,
  runPingStep,
  runUdpProbeSection,
} from "./diagnose/probes.ts";
import { createReporter } from "./diagnose/reporter.ts";
import type {
  DiagnoseOptions,
  DiagnoseStep,
  RawDiagnoseOptions,
  Reporter,
} from "./diagnose/types.ts";
import { getSupportedPlatform, resolveDefaultInterface } from "./network.ts";
import {
  type CapturedCommandResult,
  commandExists,
  runCapturedCommand,
  runInteractiveCommand,
  startCapturedCommand,
} from "./process.ts";
import {
  defaultBroadcastIp,
  defaultGatewayIp,
  defaultResponseTimeoutMs,
  defaultTargetIp,
  defaultTargetPort,
} from "./s20.ts";

export const resolveDiagnoseStepAvailability = (
  step: DiagnoseStep,
  availableCommands: Readonly<Record<string, boolean>>,
): DiagnoseStep => {
  if (step.kind === "skip") {
    return step;
  }

  const missingCommands = step.requiredCommands.filter(
    // eslint-disable-next-line unicorn/no-computed-property-existence-check -- availableCommands maps every command to a boolean, so this checks the value, not the key
    (command) => !availableCommands[command],
  );

  if (missingCommands.length === 0) {
    return step;
  }

  return {
    kind: "skip",
    header: step.header,
    reason: `Skipped: missing command${
      missingCommands.length === 1 ? "" : "s"
    } ${missingCommands.join(", ")}`,
  };
};

export const resolveDiagnoseOptions = (
  input: RawDiagnoseOptions,
  platform: NodeJS.Platform = process.platform,
): DiagnoseOptions => {
  const supportedPlatform = getSupportedPlatform(platform);

  return {
    interfaceName: resolveDefaultInterface(
      supportedPlatform,
      input.interfaceName,
    ),
    targetIp: input.targetIp || defaultTargetIp,
    gatewayIp: input.gatewayIp || defaultGatewayIp,
    broadcastIp: input.broadcastIp || defaultBroadcastIp,
    targetPort: Math.max(1, input.targetPort || defaultTargetPort),
    probeTimeoutMs: Math.max(
      1,
      input.probeTimeoutMs || defaultResponseTimeoutMs,
    ),
    captureSeconds: Math.max(1, input.captureSeconds || 4),
    platform: supportedPlatform,
  };
};

const collectAvailableCommands = (commands: readonly string[]) =>
  Effect.forEach(commands, (command) =>
    commandExists(command).pipe(
      Effect.map((exists) => {
        const entry: readonly [string, boolean] = [command, exists];
        return entry;
      }),
    ),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));

const runStep = (step: DiagnoseStep, reporter: Reporter) =>
  Effect.gen(function* () {
    yield* reporter.section(step.header);

    if (step.kind === "skip") {
      yield* reporter.line(step.reason);
      return;
    }

    try {
      const result = yield* runCapturedCommand(step.command, step.args);
      const output =
        step.transformOutput?.(result) ?? normalizeCapturedOutput(result);
      yield* reporter.line(output);

      if (result.exitCode !== 0) {
        yield* reporter.line(`(exit code ${String(result.exitCode)})`);
      }
    } catch (error) {
      yield* reporter.line(
        `Error running ${step.command}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

const runSudoValidation = (
  reporter: Reporter,
  availableCommands: Readonly<Record<string, boolean>>,
) =>
  Effect.gen(function* () {
    if (!availableCommands["sudo"]) {
      yield* reporter.section("sudo -v");
      yield* reporter.line("Skipped: missing command sudo");
      return false;
    }

    yield* reporter.section("sudo -v");
    yield* reporter.line(
      "Validating sudo credentials for privileged diagnostic steps...",
    );

    try {
      const exitCode = yield* runInteractiveCommand("sudo", ["-v"]);
      yield* reporter.line(`sudo exited with code ${String(exitCode)}`);
      return exitCode === 0;
    } catch (error) {
      yield* reporter.line(
        `sudo validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  });

const runArpClearStep = (
  options: DiagnoseOptions,
  reporter: Reporter,
  availableCommands: Readonly<Record<string, boolean>>,
  sudoValidated: boolean,
) =>
  Effect.gen(function* () {
    const header =
      options.platform === "linux"
        ? `sudo ip neigh del ${options.targetIp}${
            options.interfaceName ? ` dev ${options.interfaceName}` : ""
          }`
        : `sudo arp -d ${options.targetIp}`;

    yield* reporter.section(header);

    if (!sudoValidated) {
      yield* reporter.line("Skipped: sudo credentials were not validated");
      return;
    }

    if (options.platform === "darwin") {
      if (!availableCommands["arp"]) {
        yield* reporter.line("Skipped: missing command arp");
        return;
      }

      const result = yield* runCapturedCommand("sudo", [
        "arp",
        "-d",
        options.targetIp,
      ]);
      yield* reporter.line(normalizeCapturedOutput(result));
      return;
    }

    if (options.platform === "linux") {
      if (!availableCommands["ip"]) {
        yield* reporter.line("Skipped: missing command ip");
        return;
      }

      if (!options.interfaceName) {
        yield* reporter.line("Skipped: no interface selected");
        return;
      }

      const result = yield* runCapturedCommand("sudo", [
        "ip",
        "neigh",
        "del",
        options.targetIp,
        "dev",
        options.interfaceName,
      ]);
      yield* reporter.line(normalizeCapturedOutput(result));
      return;
    }

    yield* reporter.line(
      "Skipped: no stale ARP cleanup command for this platform",
    );
  });

export const runDiagnose = (rawOptions: RawDiagnoseOptions) =>
  Effect.gen(function* () {
    const options = resolveDiagnoseOptions(rawOptions);
    const reporter = createReporter();
    const platformSteps = buildPlatformDiagnoseSteps(options);
    const requiredCommands = [
      ...new Set(
        [
          "sudo",
          "ping",
          "tcpdump",
          ...platformSteps.flatMap((step) =>
            step.kind === "command" ? [...step.requiredCommands] : [],
          ),
        ].filter((command) => command.length > 0),
      ),
    ];
    const availableCommands = yield* collectAvailableCommands(requiredCommands);

    yield* reporter.line("==================================================");
    yield* reporter.line(
      ` s20-wifi-setup diagnostic - ${new Date().toString()}`,
    );
    yield* reporter.line("==================================================");

    if (options.platform === "win32") {
      yield* reporter.line("");
      yield* reporter.line(
        "==================================================",
      );
      yield* reporter.line(" WARNING: `diagnose` is not supported on Windows.");
      yield* reporter.line(
        " The report below is best-effort only and omits the macOS/Linux checks this command was built for.",
      );
      yield* reporter.line(
        "==================================================",
      );
    }

    yield* runNodeSnapshot(options, reporter);

    for (const platformStep of platformSteps) {
      yield* runStep(
        resolveDiagnoseStepAvailability(platformStep, availableCommands),
        reporter,
      );
    }

    const sudoValidated = yield* runSudoValidation(reporter, availableCommands);
    yield* runArpClearStep(options, reporter, availableCommands, sudoValidated);

    let captureStopper:
      | (() => Effect.Effect<CapturedCommandResult, Error>)
      | undefined;

    if (
      sudoValidated &&
      availableCommands["tcpdump"] &&
      options.interfaceName
    ) {
      yield* reporter.section(
        `starting tcpdump on ${options.interfaceName} for udp/${String(
          options.targetPort,
        )} + arp`,
      );

      try {
        const capture = yield* startCapturedCommand(
          "sudo",
          [
            "tcpdump",
            "-i",
            options.interfaceName,
            "-n",
            "-v",
            "-l",
            `udp port ${String(options.targetPort)} or arp`,
          ],
          { timeoutMs: options.captureSeconds * 1000 },
        );

        captureStopper = capture.stop;
        yield* reporter.line("tcpdump output will be shown when capture stops");
      } catch (error) {
        yield* reporter.line(
          `Could not start tcpdump: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      yield* reporter.section("starting tcpdump");
      yield* reporter.line(
        sudoValidated
          ? availableCommands["tcpdump"]
            ? "Skipped: no interface selected"
            : "Skipped: missing command tcpdump"
          : "Skipped: sudo credentials were not validated",
      );
    }

    yield* runPingStep(options.targetIp, options, reporter, availableCommands);
    yield* runPingStep(options.gatewayIp, options, reporter, availableCommands);
    yield* runUdpProbeSection(options, reporter);

    if (captureStopper) {
      const captureResult = yield* captureStopper();
      const captureText = normalizeCapturedOutput(captureResult);

      yield* reporter.section("tcpdump capture");
      yield* reporter.line(captureText);
    } else {
      yield* reporter.section("tcpdump capture");
      yield* reporter.line("Skipped: no capture was started");
    }

    yield* reporter.line("");
    yield* reporter.line("==================================================");
    yield* reporter.line(" Done.");
    yield* reporter.line("==================================================");
  });

export { buildPlatformDiagnoseSteps } from "./diagnose/platform-steps.ts";
export type { DiagnoseStep } from "./diagnose/types.ts";
export {
  defaultBroadcastIp,
  defaultGatewayIp,
  defaultResponseTimeoutMs,
  defaultTargetIp,
  defaultTargetPort,
} from "./s20.ts";
