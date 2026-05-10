import { getSubnetPrefix } from "../network.ts";
import type { CapturedCommandResult } from "../process.ts";

const trimTrailingWhitespace = (text: string) => text.trimEnd();

export const normalizeCapturedOutput = (result: CapturedCommandResult) => {
  const text = trimTrailingWhitespace(result.combined);

  if (text.length > 0) {
    return text;
  }

  if (result.exitCode === 0) {
    return "(no output)";
  }

  return `(exit code ${String(result.exitCode)} with no output)`;
};

const filterLines = (
  text: string,
  predicate: (line: string) => boolean,
  maxLines?: number,
) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && predicate(line));

  if (maxLines !== undefined) {
    return lines.slice(0, maxLines);
  }

  return lines;
};

export const formatMacOsNetstat = (
  text: string,
  targetIp: string,
  interfaceName: string | undefined,
) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) =>
      line.includes(subnetPrefix) ||
      (interfaceName !== undefined && line.includes(interfaceName)),
    20,
  );

  return lines.length > 0 ? lines.join("\n") : "(no matching routes)";
};

export const formatMacOsArp = (
  text: string,
  targetIp: string,
  broadcastIp: string,
) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) =>
      line.includes(targetIp) ||
      line.includes(broadcastIp) ||
      line.includes(subnetPrefix),
  );

  return lines.length > 0 ? lines.join("\n") : "(arp empty)";
};

export const formatMacOsIfconfig = (text: string) => {
  const lines = filterLines(text, (line) => /ether|inet |status:/.test(line));

  return lines.length > 0 ? lines.join("\n") : "(no matching lines)";
};

export const formatLinuxAddress = (text: string) =>
  trimTrailingWhitespace(text);

export const formatLinuxRoute = (text: string) => trimTrailingWhitespace(text);

export const formatLinuxNeighbors = (text: string, targetIp: string) => {
  const subnetPrefix = getSubnetPrefix(targetIp);
  const lines = filterLines(
    text,
    (line) => line.includes(targetIp) || line.includes(subnetPrefix),
  );

  return lines.length > 0 ? lines.join("\n") : "(no matching neighbors)";
};
