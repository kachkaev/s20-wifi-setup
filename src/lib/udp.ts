import * as dgram from "node:dgram";

import { Effect } from "effect";

type UdpResponse = {
  readonly ip: string;
  readonly port: number;
  readonly text: string;
};

export type SendOptions = {
  readonly message: string;
  readonly targetIp: string;
  readonly targetPort: number;
  readonly localBindIp: string | undefined;
  readonly enableBroadcast: boolean;
  readonly expectResponse: boolean;
  readonly finishOnFirstReply: boolean;
  readonly timeoutMs: number;
};

export const getErrnoCode = (error: Error) =>
  "code" in error && typeof error.code === "string" ? error.code : undefined;

export const isTransientSendError = (err: Error) => {
  const code = getErrnoCode(err);
  return code === "EHOSTUNREACH" || code === "ENETUNREACH";
};

export const shouldUseBroadcastFallback = (
  err: Error,
  enableBroadcast: boolean,
) => !enableBroadcast && isTransientSendError(err);

export const sendUdpOnce = (options: SendOptions) =>
  Effect.callback<readonly UdpResponse[], Error>((resume) => {
    const socket = dgram.createSocket("udp4");
    const responses: UdpResponse[] = [];
    let timer: NodeJS.Timeout | undefined;
    let boundAddress: string | undefined;
    let settled = false;

    const finish = (effect: Effect.Effect<readonly UdpResponse[], Error>) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      socket.removeAllListeners();
      socket.close();
      resume(effect);
    };

    socket.on("error", (err) => {
      finish(Effect.fail(err));
    });

    socket.on("message", (message, remoteInfo) => {
      if (boundAddress && remoteInfo.address === boundAddress) {
        return;
      }

      responses.push({
        ip: remoteInfo.address,
        port: remoteInfo.port,
        text: message.toString().replace(/\r?\n$/, ""),
      });

      if (options.finishOnFirstReply) {
        finish(Effect.succeed(responses));
      }
    });

    const onBound = () => {
      const socketAddress = socket.address();
      boundAddress =
        typeof socketAddress === "string" ? undefined : socketAddress.address;

      if (options.enableBroadcast) {
        socket.setBroadcast(true);
      }

      socket.send(
        options.message,
        options.targetPort,
        options.targetIp,
        (sendErr) => {
          if (sendErr) {
            finish(Effect.fail(sendErr));
            return;
          }

          if (!options.expectResponse) {
            finish(Effect.succeed(responses));
          }
        },
      );
    };

    if (options.localBindIp) {
      socket.bind(
        {
          port: options.targetPort,
          address: options.localBindIp,
          exclusive: true,
        },
        onBound,
      );
    } else {
      socket.bind(options.targetPort, onBound);
    }

    if (options.expectResponse) {
      timer = setTimeout(() => {
        finish(Effect.succeed(responses));
      }, options.timeoutMs);
    }

    return Effect.sync(() => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      socket.removeAllListeners();
      socket.close();
    });
  });
