import * as os from "node:os";

export type SupportedPlatform = "darwin" | "linux" | "win32" | "other";

export const getSupportedPlatform = (
  platform: NodeJS.Platform = process.platform,
): SupportedPlatform => {
  if (platform === "darwin") {
    return "darwin";
  }

  if (platform === "linux") {
    return "linux";
  }

  if (platform === "win32") {
    return "win32";
  }

  return "other";
};

const ipv4ToInt = (ip: string) => {
  let result = 0;

  for (const part of ip.split(".")) {
    const octet = Number(part);

    if (!Number.isSafeInteger(octet) || octet < 0 || octet > 255) {
      return NaN;
    }

    result = (result << 8) | octet;
  }

  return result;
};

export const isIpv4OnSameNetwork = (
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

export const findLocalBindIpFromInterfaces = (
  candidateIp: string,
  networkInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
) => {
  for (const addresses of Object.values(networkInterfaces)) {
    for (const address of addresses ?? []) {
      if (
        address.family !== "IPv4" ||
        address.internal ||
        !isIpv4OnSameNetwork(candidateIp, address.address, address.netmask)
      ) {
        continue;
      }

      return address.address;
    }
  }

  return;
};

export const findLocalBindIp = (candidateIp: string) =>
  findLocalBindIpFromInterfaces(candidateIp, os.networkInterfaces());

export const getSubnetPrefix = (ip: string) =>
  ip.split(".").slice(0, 3).join(".");

export const resolveDefaultInterface = (
  platform: SupportedPlatform,
  providedInterface: string | undefined,
) => providedInterface ?? (platform === "darwin" ? "en0" : undefined);
