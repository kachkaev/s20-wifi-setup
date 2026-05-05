import assert from "node:assert/strict";
import test from "node:test";

import { Effect } from "effect";

import {
  buildPairFailedMessage,
  createSendUdpWithBroadcastFallback,
  type ExpectedResponse,
  validateExpectedResponse,
} from "../src/commands/pair.ts";
import type { SendOptions, UdpResponse } from "../src/lib/udp.ts";

const baseSendOptions: SendOptions = {
  message: "AT+WSSSID=test\r",
  targetIp: "10.10.100.254",
  targetPort: 48_899,
  localBindIp: "10.10.100.2",
  enableBroadcast: false,
  expectResponse: true,
  finishOnFirstReply: true,
  timeoutMs: 3000,
};

const okResponseExpectation: ExpectedResponse = {
  description: JSON.stringify("+ok"),
  matches: (text) => text === "+ok",
};

void test("createSendUdpWithBroadcastFallback retries via broadcast on transient unicast errors", async () => {
  const calls: SendOptions[] = [];
  const response: readonly UdpResponse[] = [
    { ip: "10.10.100.254", port: 48_899, text: "+ok" },
  ];
  const transientError = Object.assign(new Error("send EHOSTUNREACH"), {
    code: "EHOSTUNREACH",
  });

  const sendUdpWithFallback = createSendUdpWithBroadcastFallback((options) => {
    calls.push(options);

    return calls.length === 1
      ? Effect.fail(transientError)
      : Effect.succeed(response);
  });

  const result = await Effect.runPromise(
    sendUdpWithFallback(baseSendOptions, "10.10.100.255"),
  );

  assert.deepEqual(result, response);
  assert.deepEqual(
    calls.map((call) => ({
      targetIp: call.targetIp,
      enableBroadcast: call.enableBroadcast,
    })),
    [
      { targetIp: "10.10.100.254", enableBroadcast: false },
      { targetIp: "10.10.100.255", enableBroadcast: true },
    ],
  );
});

void test("createSendUdpWithBroadcastFallback does not retry on permanent errors", async () => {
  const calls: SendOptions[] = [];
  const permanentError = Object.assign(new Error("send EACCES"), {
    code: "EACCES",
  });

  const sendUdpWithFallback = createSendUdpWithBroadcastFallback((options) => {
    calls.push(options);
    return Effect.fail(permanentError);
  });

  await assert.rejects(
    () =>
      Effect.runPromise(sendUdpWithFallback(baseSendOptions, "10.10.100.255")),
    /EACCES/,
  );
  assert.equal(calls.length, 1);
});

void test("validateExpectedResponse throws a detailed error when replies are missing", () => {
  assert.throws(() => {
    validateExpectedResponse("AT+WSSSID=test\r", okResponseExpectation, []);
  }, /No response received from the socket\./);
});

void test("buildPairFailedMessage includes received replies and the expected response", () => {
  const message = buildPairFailedMessage(
    "AT+WSKEY=...",
    okResponseExpectation,
    [{ text: "ERROR" }, { text: "busy" }],
  );

  assert.match(message, /Received replies: "ERROR", "busy"/);
  assert.match(message, /Expected reply: "\+ok"\./);
  assert.match(message, /Run `s20-wifi-setup diagnose`/);
});
