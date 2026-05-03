import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import {
  DEFAULT_BROADCAST_IP,
  DEFAULT_CAPTURE_PATH,
  DEFAULT_GATEWAY_IP,
  DEFAULT_REPORT_PATH,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  DEFAULT_TARGET_IP,
  DEFAULT_TARGET_PORT,
  runDiagnose,
} from "../lib/diagnose.ts";

export const diagnoseCommand = Command.make("diagnose", {
  interfaceName: Flag.optional(
    Flag.string("interface").pipe(
      Flag.withDescription(
        "Network interface to inspect (defaults to en0 on macOS)",
      ),
    ),
  ),
  targetIp: Flag.string("target-ip").pipe(
    Flag.withDefault(DEFAULT_TARGET_IP),
    Flag.withDescription("Target S20 AP-mode IP to probe"),
  ),
  gatewayIp: Flag.string("gateway-ip").pipe(
    Flag.withDefault(DEFAULT_GATEWAY_IP),
    Flag.withDescription("Gateway IP to ping during diagnostics"),
  ),
  broadcastIp: Flag.string("broadcast-ip").pipe(
    Flag.withDefault(DEFAULT_BROADCAST_IP),
    Flag.withDescription("Subnet broadcast IP to probe"),
  ),
  targetPort: Flag.integer("target-port").pipe(
    Flag.withDefault(DEFAULT_TARGET_PORT),
    Flag.withDescription("UDP port used by the S20 pairing protocol"),
  ),
  probeTimeoutMs: Flag.integer("probe-timeout-ms").pipe(
    Flag.withDefault(DEFAULT_RESPONSE_TIMEOUT_MS),
    Flag.withDescription("Timeout for each UDP probe"),
  ),
  captureSeconds: Flag.integer("capture-seconds").pipe(
    Flag.withDefault(4),
    Flag.withDescription("Upper bound for the tcpdump capture duration"),
  ),
  reportPath: Flag.string("report-path").pipe(
    Flag.withDefault(DEFAULT_REPORT_PATH),
    Flag.withDescription("Where to write the full text diagnostic report"),
  ),
  capturePath: Flag.string("capture-path").pipe(
    Flag.withDefault(DEFAULT_CAPTURE_PATH),
    Flag.withDescription("Where to write the tcpdump capture log"),
  ),
}).pipe(
  Command.withDescription(
    "Collect network diagnostics for a Wiwo S20 pairing session",
  ),
  Command.withHandler((config) =>
    runDiagnose({
      interfaceName: Option.match(config.interfaceName, {
        onSome: (value) => value,
        onNone: () => undefined,
      }),
      targetIp: config.targetIp,
      gatewayIp: config.gatewayIp,
      broadcastIp: config.broadcastIp,
      targetPort: config.targetPort,
      probeTimeoutMs: config.probeTimeoutMs,
      captureSeconds: config.captureSeconds,
      reportPath: config.reportPath,
      capturePath: config.capturePath,
    }),
  ),
);
