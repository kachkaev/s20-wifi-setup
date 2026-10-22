import { Option } from "effect";
import { Command, Flag } from "effect/cli";

import {
  defaultBroadcastIp,
  defaultGatewayIp,
  defaultResponseTimeoutMs,
  defaultTargetIp,
  defaultTargetPort,
  runDiagnose,
} from "../lib/diagnose.ts";

export const diagnoseCommand = Command.make("diagnose", {
  interfaceName: Flag.optional(
    Flag.String("interface").pipe(
      Flag.withDescription(
        "Network interface to inspect (defaults to en0 on macOS)",
      ),
    ),
  ),
  targetIp: Flag.String("target-ip").pipe(
    Flag.withDefault(defaultTargetIp),
    Flag.withDescription("Socket IP to probe on the temporary Wi-Fi network"),
  ),
  gatewayIp: Flag.String("gateway-ip").pipe(
    Flag.withDefault(defaultGatewayIp),
    Flag.withDescription("Gateway IP to ping during diagnostics"),
  ),
  broadcastIp: Flag.String("broadcast-ip").pipe(
    Flag.withDefault(defaultBroadcastIp),
    Flag.withDescription("Broadcast IP to probe on the temporary network"),
  ),
  targetPort: Flag.Int("target-port").pipe(
    Flag.withDefault(defaultTargetPort),
    Flag.withDescription("UDP port used by the socket"),
  ),
  probeTimeoutMs: Flag.Int("probe-timeout-ms").pipe(
    Flag.withDefault(defaultResponseTimeoutMs),
    Flag.withDescription("How long to wait for each UDP probe"),
  ),
  captureSeconds: Flag.Int("capture-seconds").pipe(
    Flag.withDefault(4),
    Flag.withDescription("Maximum tcpdump capture duration in seconds"),
  ),
}).pipe(
  Command.withDescription(
    "Collect a network report for failed pairing on macOS/Linux only",
  ),
  Command.withHandler((config) =>
    runDiagnose({
      interfaceName: Option.getOrUndefined(config.interfaceName),
      targetIp: config.targetIp,
      gatewayIp: config.gatewayIp,
      broadcastIp: config.broadcastIp,
      targetPort: config.targetPort,
      probeTimeoutMs: config.probeTimeoutMs,
      captureSeconds: config.captureSeconds,
    }),
  ),
);
