export const DEFAULT_BROADCAST_IP = "10.10.100.255";
export const DEFAULT_GATEWAY_IP = "10.10.100.1";
export const DEFAULT_TARGET_IP = "10.10.100.254";
export const DEFAULT_TARGET_PORT = 48_899;
export const DEFAULT_RESPONSE_TIMEOUT_MS = 3_000;
export const DEFAULT_CAPTURE_PATH = "/tmp/s20-tcpdump.txt";
export const DEFAULT_REPORT_PATH = "/tmp/s20-diag.txt";
export const DISCOVERY_MESSAGE = "HF-A11ASSISTHREAD";

interface DiscoveryReply {
  readonly ip: string;
  readonly mac: string;
  readonly module: string;
}

export const buildDiscoveryFailedMessage = (
  broadcastIp: string,
  targetPort: number,
) =>
  [
    `No S20 replied to broadcast on ${broadcastIp}:${String(targetPort)}.`,
    "Checks:",
    "  - The S20 LED is flashing blue (pairing mode).",
    "  - The host is joined to the WiWo-S20 SSID (10.10.100.x).",
    "  - No VPN is intercepting the default route.",
    "  - If your firmware uses a different IP, pass --target-ip <ip>.",
  ].join("\n");

export const isDeviceReply = (text: string) =>
  /^\d+\.\d+\.\d+\.\d+,[0-9A-Fa-f]+,/.test(text);

export const parseDiscoveryReply = (
  text: string,
): DiscoveryReply | undefined => {
  if (!isDeviceReply(text)) {
    return undefined;
  }

  const [ip, mac, module] = text.split(",");

  if (ip === undefined || mac === undefined || module === undefined) {
    return undefined;
  }

  return { ip, mac, module };
};
