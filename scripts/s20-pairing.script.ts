#!/usr/bin/env node

import * as dgram from "node:dgram";
import * as os from "node:os";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, Option, Redacted } from "effect";
import { Command, Flag } from "effect/unstable/cli";

const DEFAULT_BROADCAST_IP = "10.10.100.255";
const DEFAULT_TARGET_PORT = 48899;
const DEFAULT_RESPONSE_TIMEOUT_MS = 3000;

interface UdpResponse {
  readonly ip: string;
  readonly port: number;
  readonly text: string;
}

interface SendOptions {
  readonly message: string;
  readonly targetIp: string;
  readonly targetPort: number;
  readonly localBindIp: Option.Option<string>;
  readonly enableBroadcast: boolean;
  readonly expectResponse: boolean;
  readonly finishOnFirstReply: boolean;
  readonly timeoutMs: number;
}

const buildDiscoveryFailedMessage = (broadcastIp: string, targetPort: number) =>
  [
    `No S20 replied to broadcast on ${broadcastIp}:${String(targetPort)}.`,
    "Checks:",
    "  - The S20 LED is flashing blue (pairing mode).",
    "  - The Mac is joined to the WiWo-S20 SSID (ipconfig getifaddr en0 → 10.10.100.x).",
    "  - No VPN is intercepting the default route.",
    "  - If your firmware uses a different IP, pass --target-ip <ip>.",
  ].join("\n");

const isTransientSendError = (err: Error) => {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EHOSTUNREACH" || code === "ENETUNREACH";
};

const ipv4ToInt = (ip: string) =>
  ip.split(".").reduce((acc, part) => {
    const octet = Number(part);
    return Number.isInteger(octet) && octet >= 0 && octet <= 255
      ? (acc << 8) | octet
      : Number.NaN;
  }, 0);

const isIpv4OnSameNetwork = (
  candidateIp: string,
  address: string,
  netmask: string,
) => {
  const candidate = ipv4ToInt(candidateIp);
  const iface = ipv4ToInt(address);
  const mask = ipv4ToInt(netmask);
  if (Number.isNaN(candidate) || Number.isNaN(iface) || Number.isNaN(mask)) {
    return false;
  }
  return (candidate & mask) === (iface & mask);
};

const findLocalBindIp = (candidateIp: string) => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        address.family !== "IPv4" ||
        address.internal ||
        !isIpv4OnSameNetwork(candidateIp, address.address, address.netmask)
      ) {
        continue;
      }
      return Option.some(address.address);
    }
  }
  return Option.none<string>();
};

const retryTransient = <A, R>(
  effect: Effect.Effect<A, Error, R>,
  remaining: number,
): Effect.Effect<A, Error, R> =>
  effect.pipe(
    Effect.catch((err) =>
      remaining > 0 && isTransientSendError(err)
        ? Console.log(
            `  ↻ ${(err as NodeJS.ErrnoException).code ?? "error"}, retrying...`,
          ).pipe(
            Effect.andThen(Effect.sleep("200 millis")),
            Effect.andThen(retryTransient(effect, remaining - 1)),
          )
        : Effect.fail(err),
    ),
  );

const sendUdpOnce = (options: SendOptions) =>
  Effect.callback<ReadonlyArray<UdpResponse>, Error>((resume) => {
    const socket = dgram.createSocket("udp4");
    const responses: UdpResponse[] = [];
    let timer: NodeJS.Timeout | undefined;
    let boundAddress: string | undefined;
    let settled = false;

    const finish = (
      effect: Effect.Effect<ReadonlyArray<UdpResponse>, Error>,
    ) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.removeAllListeners();
      socket.close();
      resume(effect);
    };

    socket.on("error", (err) => {
      finish(Effect.fail(err));
    });

    socket.on("message", (msg, rinfo) => {
      if (boundAddress && rinfo.address === boundAddress) {
        return;
      }
      const text = msg.toString().replace(/\r?\n$/, "");
      responses.push({ ip: rinfo.address, port: rinfo.port, text });
      Effect.runFork(Console.log(`  ← ${rinfo.address}:${rinfo.port} ${text}`));
      if (options.finishOnFirstReply) {
        finish(Effect.succeed(responses));
      }
    });

    Option.match(options.localBindIp, {
      onSome: (address) =>
        socket.bind(
          { port: options.targetPort, address, exclusive: true },
          () => {
            boundAddress = socket.address().address;
            if (options.enableBroadcast) {
              socket.setBroadcast(true);
            }
            socket.send(
              options.message,
              options.targetPort,
              options.targetIp,
              (sendErr) => {
                if (sendErr) {
                  finish(Effect.fail(sendErr));
                  return;
                }
                if (!options.expectResponse) {
                  finish(Effect.succeed(responses));
                }
              },
            );
          },
        ),
      onNone: () =>
        socket.bind(options.targetPort, () => {
          boundAddress = socket.address().address;
          if (options.enableBroadcast) {
            socket.setBroadcast(true);
          }
          socket.send(
            options.message,
            options.targetPort,
            options.targetIp,
            (sendErr) => {
              if (sendErr) {
                finish(Effect.fail(sendErr));
                return;
              }
              if (!options.expectResponse) {
                finish(Effect.succeed(responses));
              }
            },
          );
        }),
    });

    if (options.expectResponse) {
      timer = setTimeout(() => {
        if (responses.length === 0) {
          Effect.runFork(Console.log("  ⏱ timeout waiting for response"));
        }
        finish(Effect.succeed(responses));
      }, options.timeoutMs);
    }

    return Effect.sync(() => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        socket.removeAllListeners();
        socket.close();
      }
    });
  });

const sendUdpWithRetries = (options: SendOptions) =>
  retryTransient(sendUdpOnce(options), 6);

const isDeviceReply = (text: string) =>
  /^\d+\.\d+\.\d+\.\d+,[0-9A-Fa-f]+,/.test(text);

const discoverDevice = (
  broadcastIp: string,
  targetPort: number,
  timeoutMs: number,
  localBindIp: Option.Option<string>,
) =>
  Effect.gen(function* () {
    yield* Console.log(
      `Discovering S20 via UDP broadcast to ${broadcastIp}:${String(targetPort)}...`,
    );
    yield* Console.log("  → HF-A11ASSISTHREAD (broadcast)");
    const responses = yield* sendUdpWithRetries({
      message: "HF-A11ASSISTHREAD",
      targetIp: broadcastIp,
      targetPort,
      localBindIp,
      enableBroadcast: true,
      expectResponse: true,
      finishOnFirstReply: false,
      timeoutMs,
    });
    const deviceReplies = responses.filter((r) => isDeviceReply(r.text));
    if (deviceReplies.length === 0) {
      return yield* Effect.fail(
        new Error(buildDiscoveryFailedMessage(broadcastIp, targetPort)),
      );
    }
    const first = deviceReplies[0]!;
    const [ip, mac, module_] = first.text.split(",");
    yield* Console.log(
      `Found S20: ip=${ip ?? "?"} mac=${mac ?? "?"} module=${module_ ?? "?"}\n`,
    );
    return first.ip;
  });

interface PairOptions {
  readonly ssid: string;
  readonly password: Redacted.Redacted<string>;
  readonly targetIp: Option.Option<string>;
  readonly broadcastIp: string;
  readonly targetPort: number;
  readonly timeoutMs: number;
}

const sendUdpWithBroadcastFallback = (
  options: SendOptions,
  fallbackBroadcastIp: string,
) =>
  sendUdpOnce(options).pipe(
    Effect.catch((err) =>
      !options.enableBroadcast && isTransientSendError(err)
        ? Console.log(
            `  ↻ ${(err as NodeJS.ErrnoException).code ?? "error"}, retrying via broadcast ${fallbackBroadcastIp}...`,
          ).pipe(
            Effect.andThen(
              sendUdpWithRetries({
                ...options,
                targetIp: fallbackBroadcastIp,
                enableBroadcast: true,
              }),
            ),
          )
        : Effect.fail(err),
    ),
  );

const pair = (options: PairOptions) =>
  Effect.gen(function* () {
    const password = Redacted.value(options.password);
    const broadcastBindIp = findLocalBindIp(options.broadcastIp);

    const targetIp = yield* Option.match(options.targetIp, {
      onSome: (ip) =>
        Console.log(`Using --target-ip override: ${ip}\n`).pipe(Effect.as(ip)),
      onNone: () =>
        discoverDevice(
          options.broadcastIp,
          options.targetPort,
          options.timeoutMs,
          broadcastBindIp,
        ),
    });
    const localBindIp = Option.orElse(() => broadcastBindIp)(
      findLocalBindIp(targetIp),
    );

    yield* Option.match(localBindIp, {
      onSome: (ip) => Console.log(`Using local Wi-Fi IP: ${ip}\n`),
      onNone: () =>
        Console.log(
          "Could not infer a local Wi-Fi IP from the S20 subnet, falling back to 0.0.0.0\n",
        ),
    });

    const send = (message: string, expectResponse = true) =>
      Effect.gen(function* () {
        yield* Console.log(`  → ${message.replace(/\r$/, "\\r")}`);
        yield* sendUdpWithBroadcastFallback(
          {
            message,
            targetIp,
            targetPort: options.targetPort,
            localBindIp,
            enableBroadcast: false,
            expectResponse,
            finishOnFirstReply: expectResponse,
            timeoutMs: options.timeoutMs,
          },
          options.broadcastIp,
        );
      });

    yield* Console.log(
      `Pairing Wiwo S20 at ${targetIp}:${String(options.targetPort)}`,
    );
    yield* Console.log(`Target SSID: ${options.ssid}\n`);

    yield* Console.log("Step 1: handshake");
    yield* send("HF-A11ASSISTHREAD");
    yield* Effect.sleep("1 seconds");

    yield* Console.log("Step 2: confirm");
    yield* send("+ok", false);
    yield* Effect.sleep("1 seconds");

    yield* Console.log("Step 3: configure Wi-Fi");
    yield* send(`AT+WSSSID=${options.ssid}\r`);
    yield* send(`AT+WSKEY=WPA2PSK,AES,${password}\r`);
    yield* send("AT+WMODE=STA\r");

    yield* Console.log("Step 4: reboot");
    yield* send("AT+Z\r", false);

    yield* Console.log("\nDone. The S20 should now reboot and join the SSID.");
  });

const pairCommand = Command.make("s20-wifi-pairing", {
  ssid: Flag.string("ssid").pipe(
    Flag.withDescription("Wi-Fi SSID the S20 should join"),
    Flag.withFallbackConfig(Config.string("WIFI_SSID")),
  ),
  password: Flag.redacted("password").pipe(
    Flag.withDescription("WPA2 password for the SSID"),
    Flag.withFallbackConfig(Config.redacted("WIFI_PASSWORD")),
  ),
  targetIp: Flag.optional(
    Flag.string("target-ip").pipe(
      Flag.withDescription(
        "Skip broadcast discovery and use this S20 IP directly",
      ),
      Flag.withFallbackConfig(Config.string("S20_TARGET_IP")),
    ),
  ),
  broadcastIp: Flag.string("broadcast-ip").pipe(
    Flag.withDefault(DEFAULT_BROADCAST_IP),
    Flag.withDescription("Subnet broadcast address used for discovery"),
    Flag.withFallbackConfig(Config.string("S20_BROADCAST_IP")),
  ),
  targetPort: Flag.integer("target-port").pipe(
    Flag.withDefault(DEFAULT_TARGET_PORT),
    Flag.withDescription("S20 UDP control port"),
    Flag.withFallbackConfig(Config.int("S20_TARGET_PORT")),
  ),
  timeoutMs: Flag.integer("timeout-ms").pipe(
    Flag.withDefault(DEFAULT_RESPONSE_TIMEOUT_MS),
    Flag.withDescription("How long to wait for each response / discovery"),
  ),
}).pipe(
  Command.withDescription(
    "Send the AP-mode UDP commands that join an Orvibo Wiwo S20 to a Wi-Fi network",
  ),
  Command.withHandler((config) =>
    pair({
      ssid: config.ssid,
      password: config.password,
      targetIp: config.targetIp,
      broadcastIp: config.broadcastIp,
      targetPort: config.targetPort,
      timeoutMs: config.timeoutMs,
    }),
  ),
);

const program = Command.run(pairCommand, { version: "0.1.0" }).pipe(
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
