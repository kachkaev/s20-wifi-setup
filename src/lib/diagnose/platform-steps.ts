import {
  formatLinuxAddress,
  formatLinuxNeighbors,
  formatLinuxRoute,
  formatMacOsArp,
  formatMacOsIfconfig,
  formatMacOsNetstat,
} from "./format.ts";
import type { DiagnoseOptions, DiagnoseStep } from "./types.ts";

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
          formatLinuxNeighbors(result.stdout, options.targetIp),
      },
    ];
  }

  if (options.platform === "win32") {
    return [
      {
        kind: "skip",
        header: "Windows-specific network checks",
        reason:
          "Skipped: diagnose is not supported on Windows yet, so there is no built-in command profile",
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
