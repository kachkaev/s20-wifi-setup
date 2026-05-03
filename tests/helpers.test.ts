import assert from "node:assert/strict";
import test from "node:test";

import {
  findLocalBindIpFromInterfaces,
  isIpv4OnSameNetwork,
} from "../src/lib/network.ts";
import {
  isDeviceReply,
  isOkReply,
  parseDiscoveryReply,
} from "../src/lib/s20.ts";
import { shouldUseBroadcastFallback } from "../src/lib/udp.ts";

void test("parseDiscoveryReply parses a valid device response", () => {
  assert.deepEqual(
    parseDiscoveryReply("10.10.100.254,ACCF235676D6,HF-LPB100"),
    {
      ip: "10.10.100.254",
      mac: "ACCF235676D6",
      module: "HF-LPB100",
    },
  );
});

void test("parseDiscoveryReply ignores non-device responses", () => {
  assert.equal(parseDiscoveryReply("HF-A11ASSISTHREAD"), undefined);
  assert.equal(parseDiscoveryReply("10.10.100.254"), undefined);
});

void test("isDeviceReply distinguishes device replies from self echo", () => {
  assert.equal(isDeviceReply("10.10.100.254,ACCF235676D6,HF-LPB100"), true);
  assert.equal(isDeviceReply("HF-A11ASSISTHREAD"), false);
});

void test("isOkReply accepts the plug acknowledgement line", () => {
  assert.equal(isOkReply("+ok"), true);
  assert.equal(isOkReply("+ok\r"), true);
  assert.equal(isOkReply("OK"), false);
});

void test("isIpv4OnSameNetwork matches addresses inside the same subnet", () => {
  assert.equal(
    isIpv4OnSameNetwork("10.10.100.254", "10.10.100.150", "255.255.255.0"),
    true,
  );
  assert.equal(
    isIpv4OnSameNetwork("10.10.101.254", "10.10.100.150", "255.255.255.0"),
    false,
  );
});

void test("findLocalBindIpFromInterfaces returns the matching IPv4 address", () => {
  assert.equal(
    findLocalBindIpFromInterfaces("10.10.100.254", {
      en0: [
        {
          address: "10.10.100.150",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:11:22:33:44:55",
          internal: false,
          cidr: "10.10.100.150/24",
        },
      ],
      lo0: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
    }),
    "10.10.100.150",
  );
});

void test("shouldUseBroadcastFallback only enables fallback for transient unicast errors", () => {
  const transientError = Object.assign(new Error("send EHOSTUNREACH"), {
    code: "EHOSTUNREACH",
  });
  const permanentError = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  });

  assert.equal(shouldUseBroadcastFallback(transientError, false), true);
  assert.equal(shouldUseBroadcastFallback(transientError, true), false);
  assert.equal(shouldUseBroadcastFallback(permanentError, false), false);
});
