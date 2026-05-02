# s20-wifi-pairing

Pair an [Orvibo Wiwo S20](https://www.orvibo.com/) smart plug with a Wi-Fi
network from the command line.

This repo exists for a very specific problem: the original Wiwo mobile app is
long gone, but the plugs still work. The script here reproduces the UDP pairing
flow used by the app, with a few practical fixes for modern macOS networking.

## What It Does

The plug starts in AP mode and exposes a Wi-Fi network such as `WiWo-S20`. Once
your laptop is connected to that network, the script:

1.  broadcasts `HF-A11ASSISTHREAD` to discover the plug,
1.  reads the plug IP from the reply,
1.  sends the handshake and AT commands that configure the target SSID and
    password,
1.  reboots the plug so it joins your normal network.

It also handles a macOS-specific failure mode where broadcast discovery works,
but the OS refuses unicast sends to `10.10.100.254` with `EHOSTUNREACH`. In
that case, the script falls back to subnet broadcast for the rest of the
pairing session.

## Requirements

- Node 24+.
- `pnpm`.
- A laptop connected directly to the plug's AP-mode Wi-Fi network.
- No active VPN while pairing.

## Install

```sh
pnpm install
```

## Pair A Plug

1.  Hold the plug button until the LED flashes blue.
1.  Join the `WiWo-S20` Wi-Fi network from your laptop.
1.  Run:

```sh
WIFI_SSID="MyWifi" WIFI_PASSWORD="super-secret" node scripts/s20-pairing.script.ts
```

**Tip:** Add a space before the command so that it does not add to your shell history.
That way you can avoid accidentally leaking your Wi-Fi password in a future `history` review.

or:

```sh
pnpm pair -- --ssid "MyWifi" --password "super-secret"
```

If your plug uses a different AP-mode IP than the default, skip discovery and
force a target:

```sh
node scripts/s20-pairing.script.ts \
  --ssid "MyWifi" \
  --password "super-secret" \
  --target-ip 10.10.100.254
```

## Flags

| Flag             | Env var            | Default         |
| ---------------- | ------------------ | --------------- |
| `--ssid`         | `WIFI_SSID`        | _required_      |
| `--password`     | `WIFI_PASSWORD`    | _required_      |
| `--target-ip`    | `S20_TARGET_IP`    | _auto-discover_ |
| `--broadcast-ip` | `S20_BROADCAST_IP` | `10.10.100.255` |
| `--target-port`  | `S20_TARGET_PORT`  | `48899`         |
| `--timeout-ms`   | —                  | `3000`          |

Run `node scripts/s20-pairing.script.ts --help` for generated CLI help.

## Troubleshooting

- Make sure the plug LED is flashing blue before running the script.
- Confirm your machine has a `10.10.100.x` address while connected to the
  temporary plug network.
- Disable VPNs and other software that can hijack default routes.
- If discovery works but unicast fails with `EHOSTUNREACH`, the script should
  fall back to broadcast automatically.
- If pairing still fails, run:

```sh
bash scripts/s20-diagnose.sh
```

That collects route state, ARP state, UDP probes, and a `tcpdump` capture to
help debug what the host OS is doing on the AP network.

## Development

```sh
pnpm install
pnpm lint
pnpm fix
```

Useful commands:

- `pnpm pair -- --ssid "MyWifi" --password "super-secret"` runs the pairing CLI.
- `pnpm lint` runs cspell, eslint, knip, markdownlint, pnpm dedupe, prettier,
  and TypeScript checks.
- `pnpm fix` applies the available autofixes.
