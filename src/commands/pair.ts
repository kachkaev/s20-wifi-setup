import { Config, Console, Effect, Option, Redacted } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { findLocalBindIp } from "../lib/network.ts";
import {
  buildDiscoveryFailedMessage,
  defaultBroadcastIp,
  defaultResponseTimeoutMs,
  defaultTargetPort,
  discoveryMessage,
  type DiscoveryReply,
  formatMacAddress,
  isOkReply,
  parseDiscoveryReply,
} from "../lib/s20.ts";
import {
  getErrnoCode,
  isTransientSendError,
  type SendOptions,
  sendUdpOnce,
  type UdpResponse,
} from "../lib/udp.ts";

type PairOptions = {
  readonly ssid: string;
  readonly password: Redacted.Redacted;
  readonly targetIp: string | undefined;
  readonly broadcastIp: string;
  readonly targetPort: number;
  readonly timeoutMs: number;
};

export type ExpectedResponse = {
  readonly description: string;
  readonly matches: (text: string) => boolean;
};

type SendOptionsWithValidation = {
  readonly expectResponse?: boolean;
  readonly expectedResponse?: ExpectedResponse;
};

const formatUdpLine = (ip: string, port: number, text: string) =>
  `  <- ${ip}:${String(port)} ${text}`;

const formatCommand = (message: string) =>
  message.replace(/\r$/, String.raw`\r`);

export const buildPairFailedMessage = (
  message: string,
  expectedResponse: ExpectedResponse | undefined,
  responses: ReadonlyArray<Pick<UdpResponse, "text">>,
) =>
  [
    `Pairing failed after sending ${formatCommand(message)}.`,
    responses.length === 0
      ? "No response received from the socket."
      : `Received replies: ${responses
          .map((response) => JSON.stringify(response.text))
          .join(", ")}`,
    expectedResponse
      ? `Expected reply: ${expectedResponse.description}.`
      : "Expected the socket to acknowledge the command.",
    "Run `s20-wifi-setup diagnose` for a deeper report.",
  ].join("\n");

const retryTransient = <A, R>(
  effectFactory: () => Effect.Effect<A, Error, R>,
  remaining: number,
): Effect.Effect<A, Error, R> =>
  effectFactory().pipe(
    Effect.catch((error) =>
      remaining > 0 && isTransientSendError(error)
        ? Console.log(
            `  ↻ ${getErrnoCode(error) ?? "error"}, retrying...`,
          ).pipe(
            Effect.andThen(Effect.sleep("200 millis")),
            Effect.andThen(retryTransient(effectFactory, remaining - 1)),
          )
        : Effect.fail(error),
    ),
  );

const discoverDevice = (
  broadcastIp: string,
  targetPort: number,
  timeoutMs: number,
  localBindIp: string | undefined,
) =>
  Effect.gen(function* () {
    yield* Console.log(
      `Discovering S20 via UDP broadcast to ${broadcastIp}:${String(targetPort)}...`,
    );
    yield* Console.log(`  -> ${discoveryMessage} (broadcast)`);

    const responses = yield* retryTransient(
      () =>
        sendUdpOnce({
          message: discoveryMessage,
          targetIp: broadcastIp,
          targetPort,
          localBindIp,
          enableBroadcast: true,
          expectResponse: true,
          finishOnFirstReply: false,
          timeoutMs,
        }),
      6,
    );

    for (const response of responses) {
      yield* Console.log(
        formatUdpLine(response.ip, response.port, response.text),
      );
    }

    const parsedReplies = responses
      .map((response) => parseDiscoveryReply(response.text))
      .filter((reply) => reply !== undefined);

    if (parsedReplies.length === 0) {
      return yield* Effect.fail(
        new Error(buildDiscoveryFailedMessage(broadcastIp, targetPort)),
      );
    }

    const [firstReply] = parsedReplies;

    if (firstReply === undefined) {
      return yield* Effect.fail(
        new Error(buildDiscoveryFailedMessage(broadcastIp, targetPort)),
      );
    }

    yield* Console.log("Found S20:");
    yield* Console.log(`  IP: ${firstReply.ip}`);
    yield* Console.log(`  MAC: ${formatMacAddress(firstReply.mac)}`);
    yield* Console.log(`  Module: ${firstReply.module}\n`);

    return firstReply;
  });

type SendUdpEffect = (
  options: SendOptions,
) => Effect.Effect<readonly UdpResponse[], Error>;

export const createSendUdpWithBroadcastFallback =
  (sendUdp: SendUdpEffect = sendUdpOnce) =>
  (options: SendOptions, fallbackBroadcastIp: string) =>
    sendUdp(options).pipe(
      Effect.catch((error) =>
        !options.enableBroadcast && isTransientSendError(error)
          ? Console.log(
              `  ↻ ${getErrnoCode(error) ?? "error"}, retrying via broadcast ${fallbackBroadcastIp}...`,
            ).pipe(
              Effect.andThen(
                retryTransient(
                  () =>
                    sendUdp({
                      ...options,
                      targetIp: fallbackBroadcastIp,
                      enableBroadcast: true,
                    }),
                  6,
                ),
              ),
            )
          : Effect.fail(error),
      ),
    );

export const validateExpectedResponse = (
  message: string,
  expectedResponse: ExpectedResponse | undefined,
  responses: ReadonlyArray<Pick<UdpResponse, "text">>,
) => {
  if (
    responses.length === 0 ||
    (expectedResponse !== undefined &&
      responses.every((response) => !expectedResponse.matches(response.text)))
  ) {
    throw new Error(
      buildPairFailedMessage(message, expectedResponse, responses),
    );
  }
};

const runPair = (options: PairOptions) =>
  Effect.gen(function* () {
    if (process.platform === "win32") {
      yield* Console.log("==================================================");
      yield* Console.log(" WARNING: Windows pairing support is experimental.");
      yield* Console.log(
        " This command may work on Windows, but it is mainly developed and tested on macOS and Linux.",
      );
      yield* Console.log(" If pairing fails here, retry from macOS or Linux.");
      yield* Console.log(
        "==================================================\n",
      );
    }

    const password = Redacted.value(options.password);
    const broadcastBindIp = findLocalBindIp(options.broadcastIp);

    let discoveredDevice: DiscoveryReply | undefined;
    let targetIp = options.targetIp;

    if (!targetIp) {
      discoveredDevice = yield* discoverDevice(
        options.broadcastIp,
        options.targetPort,
        options.timeoutMs,
        broadcastBindIp,
      );
      targetIp = discoveredDevice.ip;
    }

    const localBindIp = findLocalBindIp(targetIp) ?? broadcastBindIp;

    if (options.targetIp) {
      yield* Console.log(`Using --target-ip override: ${options.targetIp}\n`);
    }

    yield* localBindIp
      ? Console.log(`Using local Wi-Fi IP: ${localBindIp}\n`)
      : Console.log(
          "Could not infer a local Wi-Fi IP from the S20 subnet, falling back to 0.0.0.0\n",
        );
    const sendUdpWithBroadcastFallback = createSendUdpWithBroadcastFallback();

    const sendWithValidation = (
      message: string,
      sendOptions: SendOptionsWithValidation = {},
    ) =>
      Effect.gen(function* () {
        const expectResponse = sendOptions.expectResponse ?? true;
        const expectedResponse = sendOptions.expectedResponse;

        yield* Console.log(`  -> ${formatCommand(message)}`);

        const responses = yield* sendUdpWithBroadcastFallback(
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

        for (const response of responses) {
          yield* Console.log(
            formatUdpLine(response.ip, response.port, response.text),
          );
        }

        if (expectResponse) {
          try {
            validateExpectedResponse(message, expectedResponse, responses);
          } catch (error) {
            return yield* Effect.fail(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      });

    const send = (message: string, expectResponse = true) =>
      sendWithValidation(message, { expectResponse });

    yield* Console.log(
      `Pairing Wiwo S20 at ${targetIp}:${String(options.targetPort)}`,
    );
    yield* Console.log(`Target Wi-Fi: ${options.ssid}\n`);

    yield* Console.log("Step 1: handshake");
    yield* sendWithValidation(discoveryMessage, {
      expectedResponse: {
        description: "a device discovery reply",
        matches: (text) => parseDiscoveryReply(text) !== undefined,
      },
    });
    yield* Effect.sleep("1 seconds");

    yield* Console.log("Step 2: confirm");
    yield* send("+ok", false);
    yield* Effect.sleep("1 seconds");

    yield* Console.log("Step 3: configure Wi-Fi");
    yield* sendWithValidation(`AT+WSSSID=${options.ssid}\r`, {
      expectedResponse: {
        description: JSON.stringify("+ok"),
        matches: isOkReply,
      },
    });
    yield* sendWithValidation(`AT+WSKEY=WPA2PSK,AES,${password}\r`, {
      expectedResponse: {
        description: JSON.stringify("+ok"),
        matches: isOkReply,
      },
    });
    yield* sendWithValidation("AT+WMODE=STA\r", {
      expectedResponse: {
        description: JSON.stringify("+ok"),
        matches: isOkReply,
      },
    });

    yield* Console.log("Step 4: reboot");
    yield* send("AT+Z\r", false);

    yield* Console.log(
      "\nDone. The S20 should now reboot and join your Wi-Fi.",
    );

    if (discoveredDevice) {
      yield* Console.log(
        `S20 MAC address: ${formatMacAddress(discoveredDevice.mac)}`,
      );
    }
  });

export const pairCommand = Command.make("pair", {
  ssid: Flag.string("ssid").pipe(
    Flag.withDescription("Name of the Wi-Fi network the socket should join"),
    Flag.withFallbackConfig(Config.string("WIFI_SSID")),
  ),
  password: Flag.redacted("password").pipe(
    Flag.withDescription("Password for that Wi-Fi network"),
    Flag.withFallbackConfig(Config.redacted("WIFI_PASSWORD")),
  ),
  targetIp: Flag.optional(
    Flag.string("target-ip").pipe(
      Flag.withDescription(
        "Skip discovery and talk to this socket IP directly",
      ),
      Flag.withFallbackConfig(Config.string("S20_TARGET_IP")),
    ),
  ),
  broadcastIp: Flag.string("broadcast-ip").pipe(
    Flag.withDefault(defaultBroadcastIp),
    Flag.withDescription("Broadcast address used to discover the socket"),
    Flag.withFallbackConfig(Config.string("S20_BROADCAST_IP")),
  ),
  targetPort: Flag.integer("target-port").pipe(
    Flag.withDefault(defaultTargetPort),
    Flag.withDescription("UDP port used by the socket"),
    Flag.withFallbackConfig(Config.int("S20_TARGET_PORT")),
  ),
  timeoutMs: Flag.integer("timeout-ms").pipe(
    Flag.withDefault(defaultResponseTimeoutMs),
    Flag.withDescription("How long to wait for discovery and replies"),
  ),
}).pipe(
  Command.withDescription(
    "Pair a Wiwo S20 on macOS/Linux; Windows may also work experimentally",
  ),
  Command.withHandler((config) =>
    runPair({
      ssid: config.ssid,
      password: config.password,
      targetIp: Option.getOrUndefined(config.targetIp),
      broadcastIp: config.broadcastIp,
      targetPort: config.targetPort,
      timeoutMs: config.timeoutMs,
    }),
  ),
);
