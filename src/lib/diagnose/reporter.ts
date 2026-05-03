import { writeFile } from "node:fs/promises";

import { Console, Effect } from "effect";

import type { Reporter } from "./types.ts";

export const createReporter = (reportPath: string): Reporter => {
  const lines: string[] = [];

  return {
    line: (text = "") =>
      Console.log(text).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            lines.push(text);
          }),
        ),
      ),
    section: (title: string) =>
      Effect.gen(function* () {
        yield* Console.log("");
        yield* Console.log(`### ${title} ###`);
        yield* Effect.sync(() => {
          lines.push("", `### ${title} ###`);
        });
      }),
    flush: () =>
      Effect.promise(() =>
        writeFile(reportPath, `${lines.join("\n")}\n`, "utf8"),
      ),
  };
};
