import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };
import { diagnoseCommand } from "./commands/diagnose.ts";
import { pairCommand } from "./commands/pair.ts";

const cli = Command.make("s20-wifi-setup").pipe(
  Command.withDescription(
    "Connect legacy Orvibo Wiwo S20 smart plugs to Wi-Fi from the terminal",
  ),
  Command.withSubcommands([diagnoseCommand, pairCommand]),
);

const program = Command.run(cli, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
  Effect.catch((error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);

NodeRuntime.runMain(program);
