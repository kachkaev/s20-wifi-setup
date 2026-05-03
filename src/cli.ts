import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import packageJson from "../package.json" with { type: "json" };
import { diagnoseCommand } from "./commands/diagnose.ts";
import { pairCommand } from "./commands/pair.ts";

const cli = Command.make("s20-wifi-setup").pipe(
  Command.withDescription(
    "Pair and diagnose Orvibo Wiwo S20 smart plugs from the command line",
  ),
  Command.withSubcommands([diagnoseCommand, pairCommand]),
);

const program = Command.run(cli, { version: packageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
