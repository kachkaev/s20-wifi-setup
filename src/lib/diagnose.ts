import { writeFile } from "node:fs/promises";
import * as os from "node:os";

import { Console, Effect } from "effect";

import {
  findLocalBindIp,
  getSubnetPrefix,
  getSupportedPlatform,
  resolveDefaultInterface,
  type SupportedPlatform,
} from "./network.ts";
import {
  type CapturedCommandResult,
  commandExists,
  runCapturedCommand,
  runInteractiveCommand,
  startCapturedCommand,
} from "./process.ts";
import {
  defaultBroadcastIp,
  defaultCapturePath,
  defaultGatewayIp,
  defaultReportPath,
  defaultResponseTimeoutMs,
  defaultTargetIp,
  defaultTargetPort,
  discoveryMessage,
} from "./s20.ts";
import { sendUdpOnce } from "./udp.ts";

type RawDiagnoseOptions = {
  readonly interfaceName: string | undefined;
  readonly targetIp: string;
  readonly gatewayIp: string;
  readonly broadcastIp: string;
  readonly targetPort: number;
  readonly probeTimeoutMs: number;
  readonly captureSeconds: number;
  readonly reportPath: string;
  readonly capturePath: string;
};

type DiagnoseOptions = RawDiagnoseOptions & {
  readonly platform: SupportedPlatform;
};

type Reporter = {
  readonly line: (text?: string) => Effect.Effect<void>;
  readonly section: (title: string) => Effect.Effect<void>;
  readonly flush: () => Effect.Effect<void, Error>;
};

type DiagnoseStepCommand = {
  readonly kind: "command";
  readonly header: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly requiredCommands: readonly string[];
  readonly transformOutput?: (result: CapturedCommandResult) => string;
};

type DiagnoseStepSkip = {
  readonly kind: "skip";
  readonly header: string;
  readonly reason: string;
};

export type DiagnoseStep = DiagnoseStepCommand | DiagnoseStepSkip;

const trimTrailingWhitespace = (text: string) => text.trimEnd();

const normalizeCapturedOutput = (result: CapturedCommandResult) => {
  const text = trimTrailingWhitespace(result.combined);

  if (text.length > 0) {
    return text;
  }

  if (result.exitCode === 0) {
    return "(no output)";
  }

  return `(exit code ${String(result.exitCode)} with no output)`;
};

const filterLines = (
  text: string,
  predicate: (line: string) => boolean,
  maxLines?: number,
) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && predicate(line));

  if (maxLines !== undefined) {
    return lines.slice(0, maxLines);
  }

  return lines;
};

const formatMacOsNetstat = (
  text: string,
  targetIp: string,
  interfaceName: string | undefined,
) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) =>
      line.includes(subnetPrefix) ||
      (interfaceName !== undefined && line.includes(interfaceName)),
    20,
  );

  return lines.length > 0 ? lines.join("\n") : "(no matching routes)";
};

const formatMacOsArp = (
  text: string,
  targetIp: string,
  broadcastIp: string,
) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) =>
      line.includes(targetIp) ||
      line.includes(broadcastIp) ||
      line.includes(subnetPrefix),
  );

  return lines.length > 0 ? lines.join("\n") : "(arp empty)";
};

const formatMacOsIfconfig = (text: string) => {
  const lines = filterLines(text, (line) => /ether|inet |status:/.test(line));

  return lines.length > 0 ? lines.join("\n") : "(no matching lines)";
};

const formatLinuxAddress = (text: string) => trimTrailingWhitespace(text);

const formatLinuxRoute = (text: string) => trimTrailingWhitespace(text);

const formatLinuxNeighbours = (text: string, targetIp: string) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) => line.includes(targetIp) || line.includes(subnetPrefix),
  );

  return lines.length > 0 ? lines.join("\n") : "(no matching neighbours)";
};

const formatCapturePreview = (text: string) => {
  const preview = text.split(/\r?\n/).slice(0, 200).join("\n").trimEnd();
  return preview.length > 0 ? preview : "(no packets captured)";
};

const createReporter = (reportPath: string): Reporter => {
  const lines: string[] = [];

  return {
    line: (text = "") =>
      Console.log(text).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            lines.push(text);
          }),
        ),
      ),
    section: (title: string) =>
      Effect.gen(function* () {
        yield* Console.log("");
        yield* Console.log(`### ${title} ###`);
        yield* Effect.sync(() => {
          lines.push("", `### ${title} ###`);
        });
      }),
    flush: () =>
      Effect.promise(() =>
        writeFile(reportPath, `${lines.join("\n")}\n`, "utf8"),
      ),
  };
};

export const resolveDiagnoseStepAvailability = (
  step: DiagnoseStep,
  availableCommands: Readonly<Record<string, boolean>>,
): DiagnoseStep => {
  if (step.kind === "skip") {
    return step;
  }

  const missingCommands = step.requiredCommands.filter(
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
    reportPath: input.reportPath || defaultReportPath,
    capturePath: input.capturePath || defaultCapturePath,
    platform: supportedPlatform,
  };
};

export const buildPlatformDiagnoseSteps = (
  options: DiagnoseOptions,
): readonly DiagnoseStep[] => {
  if (options.platform === "darwin") {
    return [
      options.interfaceName
        ? {
            kind: "command",
            header: `networksetup -getairportnetwork ${options.interfaceName}`,
            command: "networksetup",
            args: ["-getairportnetwork", options.interfaceName],
            requiredCommands: ["networksetup"],
          }
        : {
            kind: "skip",
            header: "networksetup -getairportnetwork <interface>",
            reason: "Skipped: no interface selected",
          },
      options.interfaceName
        ? {
            kind: "command",
            header: `ipconfig getifaddr ${options.interfaceName}`,
            command: "ipconfig",
            args: ["getifaddr", options.interfaceName],
            requiredCommands: ["ipconfig"],
          }
        : {
            kind: "skip",
            header: "ipconfig getifaddr <interface>",
            reason: "Skipped: no interface selected",
          },
      options.interfaceName
        ? {
            kind: "command",
            header: `ifconfig ${options.interfaceName}`,
            command: "ifconfig",
            args: [options.interfaceName],
            requiredCommands: ["ifconfig"],
            transformOutput: (result) => formatMacOsIfconfig(result.stdout),
          }
        : {
            kind: "skip",
            header: "ifconfig <interface>",
            reason: "Skipped: no interface selected",
          },
      {
        kind: "command",
        header: `route -n get ${options.targetIp}`,
        command: "route",
        args: ["-n", "get", options.targetIp],
        requiredCommands: ["route"],
      },
      {
        kind: "command",
        header: "netstat -rn -f inet",
        command: "netstat",
        args: ["-rn", "-f", "inet"],
        requiredCommands: ["netstat"],
        transformOutput: (result) =>
          formatMacOsNetstat(
            result.stdout,
            options.targetIp,
            options.interfaceName,
          ),
      },
      {
        kind: "command",
        header: "arp -an",
        command: "arp",
        args: ["-an"],
        requiredCommands: ["arp"],
        transformOutput: (result) =>
          formatMacOsArp(result.stdout, options.targetIp, options.broadcastIp),
      },
    ];
  }

  if (options.platform === "linux") {
    return [
      options.interfaceName
        ? {
            kind: "command",
            header: `ip address show dev ${options.interfaceName}`,
            command: "ip",
            args: ["address", "show", "dev", options.interfaceName],
            requiredCommands: ["ip"],
            transformOutput: (result) => formatLinuxAddress(result.stdout),
          }
        : {
            kind: "command",
            header: "ip address",
            command: "ip",
            args: ["address"],
            requiredCommands: ["ip"],
            transformOutput: (result) => formatLinuxAddress(result.stdout),
          },
      {
        kind: "command",
        header: `ip route get ${options.targetIp}`,
        command: "ip",
        args: ["route", "get", options.targetIp],
        requiredCommands: ["ip"],
        transformOutput: (result) => formatLinuxRoute(result.stdout),
      },
      {
        kind: "command",
        header: "ip neigh show",
        command: "ip",
        args: ["neigh", "show"],
        requiredCommands: ["ip"],
        transformOutput: (result) =>
          formatLinuxNeighbours(result.stdout, options.targetIp),
      },
    ];
  }

  return [
    {
      kind: "skip",
      header: "platform-specific network checks",
      reason: "Skipped: this platform has no built-in command profile yet",
    },
  ];
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
  availableCommands: Record<string, boolean>,
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
  availableCommands: Record<string, boolean>,
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

const runPingStep = (
  host: string,
  options: DiagnoseOptions,
  reporter: Reporter,
  availableCommands: Record<string, boolean>,
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

const runUdpProbeSection = (options: DiagnoseOptions, reporter: Reporter) =>
  Effect.gen(function* () {
    yield* reporter.section("TypeScript UDP probes (broadcast + unicast)");

    const lines = yield* Effect.all([
      probeUdp("broadcast", options.broadcastIp, true, options),
      probeUdp("unicast", options.targetIp, false, options),
      probeUdp("global-broadcast", "255.255.255.255", true, options),
    ]).pipe(Effect.map((groups) => groups.flat()));

    for (const line of lines) {
      yield* reporter.line(line);
    }
  });

const runNodeSnapshot = (options: DiagnoseOptions, reporter: Reporter) =>
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

export const runDiagnose = (rawOptions: RawDiagnoseOptions) =>
  Effect.gen(function* () {
    const options = resolveDiagnoseOptions(rawOptions);
    const reporter = createReporter(options.reportPath);
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
      ` s20-wifi-pairing diagnostic - ${new Date().toString()}`,
    );
    yield* reporter.line("==================================================");

    yield* runNodeSnapshot(options, reporter);

    for (const step of platformSteps.map((platformStep) =>
      resolveDiagnoseStepAvailability(platformStep, availableCommands),
    )) {
      yield* runStep(step, reporter);
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
        yield* reporter.line(
          `tcpdump will be written to ${options.capturePath} when capture stops`,
        );
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

      yield* Effect.promise(() =>
        writeFile(options.capturePath, `${captureText}\n`, "utf8"),
      );

      yield* reporter.section(`tcpdump capture (${options.capturePath})`);
      yield* reporter.line(formatCapturePreview(captureText));
    } else {
      yield* reporter.section(`tcpdump capture (${options.capturePath})`);
      yield* reporter.line("Skipped: no capture was started");
    }

    yield* reporter.line("");
    yield* reporter.line("==================================================");
    yield* reporter.line(` Done. Full output: ${options.reportPath}`);
    yield* reporter.line("==================================================");

    yield* reporter.flush();
  });

export {
  defaultBroadcastIp,
  defaultCapturePath,
  defaultGatewayIp,
  defaultReportPath,
  defaultResponseTimeoutMs,
  defaultTargetIp,
  defaultTargetPort,
} from "./s20.ts";
