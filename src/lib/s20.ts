export const defaultBroadcastIp = "10.10.100.255";
export const defaultGatewayIp = "10.10.100.1";
export const defaultTargetIp = "10.10.100.254";
export const defaultTargetPort = 48_899;
export const defaultResponseTimeoutMs = 3000;
export const defaultCapturePath = "/tmp/s20-tcpdump.txt";
export const defaultReportPath = "/tmp/s20-diag.txt";
export const discoveryMessage = "HF-A11ASSISTHREAD";
const okReply = "+ok";

type DiscoveryReply = {
  readonly ip: string;
  readonly mac: string;
  readonly module: string;
};

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
  /^\d+\.\d+\.\d+\.\d+,[0-9a-f]+,/i.test(text);

export const isOkReply = (text: string) => text.trim() === okReply;

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
