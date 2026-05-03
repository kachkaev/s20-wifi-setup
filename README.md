# s20-wifi-pairing

Pair an [Orvibo Wiwo S20](https://www.orvibo.com/) smart plug with a Wi-Fi network from the command line.

This repo exists for a specific problem: the original Wiwo mobile app is gone, but the plugs still work.
This CLI reproduces the UDP pairing flow used by the app and adds a few practical fixes for modern macOS and Linux hosts.

## What It Does

The plug starts in AP mode and exposes a Wi-Fi network such as `WiWo-S20`.
Once your laptop is connected to that network, the CLI can:

1.  discover the plug via UDP broadcast,
1.  configure the target SSID and password with the same AP-mode commands as the original app,
1.  reboot the plug so it joins your normal network,
1.  collect a diagnostic report if pairing fails.

It also handles a macOS-specific failure mode where broadcast discovery works, but the OS refuses unicast sends to `10.10.100.254` with `EHOSTUNREACH`.
In that case, the pairing flow falls back to subnet broadcast automatically.

## Requirements

- Node 24+.
- A laptop connected directly to the plug's AP-mode Wi-Fi network.
- No active VPN while pairing.

This package executes `.ts` files directly, so the Node 24+ requirement is intentional.

## Usage

Run help:

```sh
npx s20-wifi-pairing@latest --help
```

Pair a plug:

```sh
WIFI_SSID="MyWifi" WIFI_PASSWORD="super-secret" \
  npx s20-wifi-pairing@latest pair
```

or:

```sh
npx s20-wifi-pairing@latest pair \
  --ssid "MyWifi" \
  --password "super-secret"
```

If your plug uses a different AP-mode IP than the default, skip discovery:

```sh
npx s20-wifi-pairing@latest pair \
  --ssid "MyWifi" \
  --password "super-secret" \
  --target-ip 10.10.100.254
```

Collect diagnostics:

```sh
npx s20-wifi-pairing@latest diagnose
```

By default, `diagnose` writes:

- `/tmp/s20-diag.txt`
- `/tmp/s20-tcpdump.txt`

It may prompt for `sudo` so it can clear stale ARP state and run `tcpdump`.

## Pair Flags

| Flag             | Env var            | Default         |
| ---------------- | ------------------ | --------------- |
| `--ssid`         | `WIFI_SSID`        | _required_      |
| `--password`     | `WIFI_PASSWORD`    | _required_      |
| `--target-ip`    | `S20_TARGET_IP`    | _auto-discover_ |
| `--broadcast-ip` | `S20_BROADCAST_IP` | `10.10.100.255` |
| `--target-port`  | `S20_TARGET_PORT`  | `48899`         |
| `--timeout-ms`   | —                  | `3000`          |

## Diagnose Flags

| Flag                 | Default                |
| -------------------- | ---------------------- |
| `--interface`        | `en0` on macOS         |
| `--target-ip`        | `10.10.100.254`        |
| `--gateway-ip`       | `10.10.100.1`          |
| `--broadcast-ip`     | `10.10.100.255`        |
| `--target-port`      | `48899`                |
| `--probe-timeout-ms` | `3000`                 |
| `--capture-seconds`  | `4`                    |
| `--report-path`      | `/tmp/s20-diag.txt`    |
| `--capture-path`     | `/tmp/s20-tcpdump.txt` |

## Troubleshooting

- Make sure the plug LED is flashing blue before running `pair`.
- Confirm your machine has a `10.10.100.x` address while connected to the temporary plug network.
- Disable VPNs and other software that can hijack default routes.
- If discovery works but unicast fails with `EHOSTUNREACH`, the CLI should fall back to broadcast automatically.
- If pairing still fails, run:

```sh
npx s20-wifi-pairing@latest diagnose
```

That collects route state, interface state, UDP probes, and a `tcpdump` capture to help debug what the host OS is doing on the AP network.

## Development

```sh
pnpm install
pnpm lint
pnpm test
pnpm fix
```

Useful commands:

- `node src/cli.ts pair --ssid "MyWifi" --password "super-secret"` runs the pairing CLI locally.
- `node src/cli.ts diagnose` runs the diagnostics CLI locally.
- `pnpm lint` runs cspell, eslint, knip, markdownlint, pnpm dedupe, prettier, and TypeScript checks.
- `pnpm test` runs the hardware-free regression suite with built-in `node:test`.
- `pnpm fix` applies the available autofixes.
