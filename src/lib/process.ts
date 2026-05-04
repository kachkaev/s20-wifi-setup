import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Fiber, Scope, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";

export type CapturedCommandResult = {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly combined: string;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | undefined;
};

type RunningCommandCapture = {
  readonly stop: () => Effect.Effect<CapturedCommandResult, Error>;
};

const captureStream = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (output, chunk) => output + chunk,
    ),
  );

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export const commandExists = (command: string): Effect.Effect<boolean> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* (
        process.platform === "win32"
          ? ChildProcess.make("where", [command], {
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            })
          : ChildProcess.make(
              "/bin/sh",
              ["-lc", `command -v ${command} >/dev/null 2>&1`],
              {
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              },
            )
      ).asEffect();

      const exitCode = yield* handle.exitCode;
      return exitCode === 0;
    }),
  ).pipe(
    Effect.catch(() => Effect.succeed(false)),
    Effect.provide(NodeServices.layer),
  );

export const runCapturedCommand = (
  command: string,
  args: readonly string[],
  options?: {
    readonly stdin?: "ignore" | "inherit";
  },
): Effect.Effect<CapturedCommandResult, Error> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, [...args], {
        stdin: options?.stdin ?? "ignore",
      }).asEffect();

      const { stdout, stderr, combined, exitCode } = yield* Effect.all(
        {
          stdout: captureStream(handle.stdout),
          stderr: captureStream(handle.stderr),
          combined: captureStream(handle.all),
          exitCode: handle.exitCode,
        },
        { concurrency: "unbounded" },
      );

      return {
        command,
        args,
        stdout,
        stderr,
        combined,
        exitCode: Number(exitCode),
        signal: undefined,
      } satisfies CapturedCommandResult;
    }),
  ).pipe(Effect.mapError(toError), Effect.provide(NodeServices.layer));

export const runInteractiveCommand = (
  command: string,
  args: readonly string[],
): Effect.Effect<number, Error> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, [...args], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }).asEffect();

      return Number(yield* handle.exitCode);
    }),
  ).pipe(Effect.mapError(toError), Effect.provide(NodeServices.layer));

export const startCapturedCommand = (
  command: string,
  args: readonly string[],
  options?: {
    readonly stdin?: "ignore" | "inherit";
    readonly timeoutMs?: number;
  },
): Effect.Effect<RunningCommandCapture, Error> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const handle = yield* Effect.provideService(
      ChildProcess.make(command, [...args], {
        stdin: options?.stdin ?? "ignore",
      }).asEffect(),
      Scope.Scope,
      scope,
    ).pipe(Effect.mapError(toError));

    const stdoutFiber = yield* Effect.forkIn(
      captureStream(handle.stdout),
      scope,
    );
    const stderrFiber = yield* Effect.forkIn(
      captureStream(handle.stderr),
      scope,
    );
    const combinedFiber = yield* Effect.forkIn(
      captureStream(handle.all),
      scope,
    );
    const exitCodeFiber = yield* Effect.forkIn(handle.exitCode, scope);

    if (options?.timeoutMs) {
      yield* Effect.forkIn(
        Effect.sleep(options.timeoutMs).pipe(
          Effect.andThen(handle.kill({ killSignal: "SIGTERM" })),
          Effect.catch(() => Effect.void),
        ),
        scope,
      );
    }

    let finished = false;

    return {
      stop: () =>
        Effect.gen(function* () {
          if (!finished) {
            finished = true;
            yield* handle
              .kill({ killSignal: "SIGTERM" })
              .pipe(Effect.catch(() => Effect.void));
          }

          const { stdout, stderr, combined, exitCode } = yield* Effect.all(
            {
              stdout: Fiber.join(stdoutFiber),
              stderr: Fiber.join(stderrFiber),
              combined: Fiber.join(combinedFiber),
              exitCode: Fiber.join(exitCodeFiber),
            },
            { concurrency: "unbounded" },
          );

          yield* Scope.close(scope, Exit.void);

          return {
            command,
            args,
            stdout,
            stderr,
            combined,
            exitCode: Number(exitCode),
            signal: undefined,
          } satisfies CapturedCommandResult;
        }).pipe(
          Effect.ensuring(Scope.close(scope, Exit.void)),
          Effect.mapError(toError),
        ),
    } satisfies RunningCommandCapture;
  }).pipe(Effect.provide(NodeServices.layer));
