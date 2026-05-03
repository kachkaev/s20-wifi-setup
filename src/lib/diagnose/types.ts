import type { Effect } from "effect";

import type { SupportedPlatform } from "../network.ts";
import type { CapturedCommandResult } from "../process.ts";

export type RawDiagnoseOptions = {
  readonly interfaceName: string | undefined;
  readonly targetIp: string;
  readonly gatewayIp: string;
  readonly broadcastIp: string;
  readonly targetPort: number;
  readonly probeTimeoutMs: number;
  readonly captureSeconds: number;
  readonly reportPath: string;
  readonly capturePath: string;
};

export type DiagnoseOptions = RawDiagnoseOptions & {
  readonly platform: SupportedPlatform;
};

export type Reporter = {
  readonly line: (text?: string) => Effect.Effect<void>;
  readonly section: (title: string) => Effect.Effect<void>;
  readonly flush: () => Effect.Effect<void, Error>;
};

type DiagnoseStepCommand = {
  readonly kind: "command";
  readonly header: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly requiredCommands: readonly string[];
  readonly transformOutput?: (result: CapturedCommandResult) => string;
};

type DiagnoseStepSkip = {
  readonly kind: "skip";
  readonly header: string;
  readonly reason: string;
};

export type DiagnoseStep = DiagnoseStepCommand | DiagnoseStepSkip;
