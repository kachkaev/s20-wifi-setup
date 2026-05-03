import { Console, Effect } from "effect";

import type { Reporter } from "./types.ts";

export const createReporter = (): Reporter => ({
  line: (text = "") => Console.log(text),
  section: (title: string) =>
    Effect.gen(function* () {
      yield* Console.log("");
      yield* Console.log(`### ${title} ###`);
    }),
});
