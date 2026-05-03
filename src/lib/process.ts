import { spawn } from "node:child_process";

import { Effect } from "effect";

export type CapturedCommandResult = {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly combined: string;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
};

type RunningCommandCapture = {
  readonly stop: () => Effect.Effect<CapturedCommandResult, Error>;
};

const chunksToString = (chunks: readonly Buffer[]) =>
  Buffer.concat(chunks).toString("utf8");

export const commandExists = (command: string) =>
  Effect.promise<boolean>(
    () =>
      new Promise((resolve) => {
        const lookup =
          process.platform === "win32"
            ? spawn("where", [command], { stdio: "ignore" })
            : spawn(
                "/bin/sh",
                ["-lc", `command -v ${command} >/dev/null 2>&1`],
                {
                  stdio: "ignore",
                },
              );

        lookup.on("error", () => {
          resolve(false);
        });

        lookup.on("close", (code) => {
          resolve(code === 0);
        });
      }),
  );

export const runCapturedCommand = (
  command: string,
  args: readonly string[],
  options?: {
    readonly stdin?: "ignore" | "inherit";
  },
) =>
  Effect.promise<CapturedCommandResult>(
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(command, [...args], {
          stdio: [options?.stdin ?? "ignore", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        child.on("error", (error) => {
          reject(error);
        });

        child.stdout.on("data", (chunk: Buffer) => {
          stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderrChunks.push(chunk);
        });

        child.on("close", (exitCode, signal) => {
          const stdout = chunksToString(stdoutChunks);
          const stderr = chunksToString(stderrChunks);

          resolve({
            command,
            args,
            stdout,
            stderr,
            combined: `${stdout}${stderr}`,
            exitCode: exitCode ?? 1,
            signal,
          });
        });
      }),
  );

export const runInteractiveCommand = (
  command: string,
  args: readonly string[],
) =>
  Effect.promise<number>(
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(command, [...args], {
          stdio: "inherit",
        });

        child.on("error", (error) => {
          reject(error);
        });

        child.on("close", (exitCode) => {
          resolve(exitCode ?? 1);
        });
      }),
  );

export const startCapturedCommand = (
  command: string,
  args: readonly string[],
  options?: {
    readonly stdin?: "ignore" | "inherit";
    readonly timeoutMs?: number;
  },
) =>
  Effect.promise<RunningCommandCapture>(
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(command, [...args], {
          stdio: [options?.stdin ?? "ignore", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let finished = false;
        let timeout: NodeJS.Timeout | undefined;

        const completion = new Promise<CapturedCommandResult>(
          (resolveCompletion) => {
            child.stdout.on("data", (chunk: Buffer) => {
              stdoutChunks.push(chunk);
            });

            child.stderr.on("data", (chunk: Buffer) => {
              stderrChunks.push(chunk);
            });

            child.on("close", (exitCode, signal) => {
              if (timeout) {
                clearTimeout(timeout);
              }

              const stdout = chunksToString(stdoutChunks);
              const stderr = chunksToString(stderrChunks);

              resolveCompletion({
                command,
                args,
                stdout,
                stderr,
                combined: `${stdout}${stderr}`,
                exitCode: exitCode ?? 1,
                signal,
              });
            });
          },
        );

        child.on("error", (error) => {
          reject(error);
        });

        if (options?.timeoutMs) {
          timeout = setTimeout(() => {
            child.kill("SIGTERM");
          }, options.timeoutMs);
        }

        resolve({
          stop: () =>
            Effect.promise(async () => {
              if (!finished && !child.killed) {
                finished = true;
                child.kill("SIGTERM");
              }

              return completion;
            }),
        });
      }),
  );
