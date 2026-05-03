#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { diagnoseCommand } from "./commands/diagnose.ts";
import { pairCommand } from "./commands/pair.ts";

const cli = Command.make("s20-wifi-pairing").pipe(
  Command.withDescription(
    "Pair and diagnose Orvibo Wiwo S20 smart plugs from the command line",
  ),
  Command.withSubcommands([pairCommand, diagnoseCommand]),
);

const program = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
