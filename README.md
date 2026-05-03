# s20-wifi-setup

Pair an [Orvibo](https://www.orvibo.com/) Wiwo S20 smart plug with your Wi-Fi network from Terminal.

The original Wiwo mobile app is gone, but old S20 plugs still work.
This CLI recreates the pairing flow used by the app, so you can point the plug at your Wi-Fi network from a laptop.

If your plug looks like this, you're in the right place:

<img src="docs/images/orvibo-wiwo-s20-light-blue.png" width="170" height="282" alt="Orvibo Wiwo S20 smart plug">

## Safety

[Home Assistant's Orvibo integration page](https://www.home-assistant.io/integrations/orvibo/) warns about the European ORVIBO Wi-Fi SMART SOCKET S20 (`LGS-20`) and links to the [RAPEX recall entry](https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/10002910).
The warning is about electrical safety, not software support.
Treat this repo as a way to pair hardware you already own, not as a recommendation to buy or keep using a recalled device without making your own safety assessment.

## Before You Start

- macOS and Linux are the supported platforms for this project.
- `pair` may also work on Windows, but that path is experimental.
- `diagnose` is for macOS and Linux only. On Windows, do not rely on it.
- You need [Node.js](https://nodejs.org/) 22 or newer.
- You need the Wi-Fi name and password that the plug should use.
- The plug must be in pairing mode, with its LED flashing blue.
- Your laptop must be connected to the plug's temporary Wi-Fi network, usually `WiWo-S20`.
- VPNs should be turned off while pairing.

You do not need to clone this repo.
You do not need to know TypeScript, JavaScript, or `pnpm`.
The `npx` command below comes with Node.js.
It downloads the tool [from npm](https://www.npmjs.com/package/s20-wifi-setup) and runs it.

If `node --version` or `npx --version` fails, install Node.js first and then come back here.

## Quick Start

Run this in Terminal and replace the Wi-Fi details with your own:

```sh
npx s20-wifi-setup@latest pair \
  --ssid "MyWifi" \
  --password "super-secret"
```

If `npx` asks whether it should download the package, answer `y`.

On Windows, `pair` may still work, but it is not part of the main support matrix.
If it fails there, retry from macOS or Linux before digging any deeper.

The CLI will then:

1.  discover the plug on the temporary `WiWo-S20` network,
1.  send your Wi-Fi name and password to the plug,
1.  reboot the plug so it leaves AP mode and joins your normal network.

When the command ends with:

```text
Done. The S20 should now reboot and join the SSID.
```

wait a few seconds for the plug to reconnect.
Your laptop may lose connectivity at that point because it is still joined to the plug's temporary Wi-Fi network, so reconnect it to your usual Wi-Fi if needed.

## If Pairing Fails

Start with these checks:

- Make sure the LED is still flashing blue.
- Confirm that your laptop got a `10.10.100.x` address while joined to `WiWo-S20`.
- Turn off VPNs or route-altering network tools.
- If the plug uses a non-default IP, try `--target-ip`.

Example:

```sh
npx s20-wifi-setup@latest pair \
  --ssid "MyWifi" \
  --password "super-secret" \
  --target-ip 10.10.100.254
```

If that still does not work and you are on macOS or Linux, collect a diagnostic report:

```sh
npx s20-wifi-setup@latest diagnose
```

Do not use `diagnose` as your next step on Windows.

`diagnose` prints a full report to stdout.
It may prompt for `sudo` so it can clear stale ARP state and run `tcpdump`.

## What The Tool Actually Does

The S20 exposes a temporary Wi-Fi network while in pairing mode.
Once your laptop is connected to that network, this tool talks to the plug over UDP and reproduces the same AP-mode commands used by the original app.

It also handles a macOS-specific failure mode where discovery works, but direct sends to `10.10.100.254` fail with `EHOSTUNREACH`.
When that happens, the CLI retries via subnet broadcast automatically.

On Windows, pairing may still work because the actual pairing flow is just UDP over the plug's temporary network.
The unsupported part is diagnostics, not the core pairing protocol.

## Command Reference

Show built-in help:

```sh
npx s20-wifi-setup@latest --help
```

Use environment variables instead of command-line flags:

```sh
WIFI_SSID="MyWifi" WIFI_PASSWORD="super-secret" \
  npx s20-wifi-setup@latest pair
```

### `pair` Flags

`pair` is supported on macOS and Linux.
It may also work on Windows, but that path is experimental.

| Flag             | Env var            | Default         |
| ---------------- | ------------------ | --------------- |
| `--ssid`         | `WIFI_SSID`        | _required_      |
| `--password`     | `WIFI_PASSWORD`    | _required_      |
| `--target-ip`    | `S20_TARGET_IP`    | _auto-discover_ |
| `--broadcast-ip` | `S20_BROADCAST_IP` | `10.10.100.255` |
| `--target-port`  | `S20_TARGET_PORT`  | `48899`         |
| `--timeout-ms`   | —                  | `3000`          |

### `diagnose` Flags

`diagnose` is intended for macOS and Linux only.
On Windows, it shows a warning and only produces a best-effort report.

| Flag                 | Default         |
| -------------------- | --------------- |
| `--interface`        | `en0` on macOS  |
| `--target-ip`        | `10.10.100.254` |
| `--gateway-ip`       | `10.10.100.1`   |
| `--broadcast-ip`     | `10.10.100.255` |
| `--target-port`      | `48899`         |
| `--probe-timeout-ms` | `3000`          |
| `--capture-seconds`  | `4`             |

## Development

This section is for working on the CLI itself.
If you only want to pair a plug, you can ignore it.

Install dependencies:

```sh
pnpm install
```

Run the main checks:

```sh
pnpm lint
pnpm test
```

Useful commands:

- `pnpm build` builds the bundled `dist/cli.js` artifact used for npm publishing.
- `node src/cli.ts pair --ssid "MyWifi" --password "super-secret"` runs the pairing flow locally.
- `node src/cli.ts diagnose` runs the diagnostics flow locally.
- `pnpm lint` runs cspell, eslint, knip, markdownlint, pnpm dedupe, prettier, and TypeScript checks.
- `pnpm test` runs the hardware-free regression suite with built-in `node:test`.
- `pnpm fix` applies the available autofixes.

## Acknowledgements

This project was inspired by [darrensteele/s20](https://github.com/darrensteele/s20), a Python tool for pairing Orvibo S20 plugs.
That project helped confirm the basic UDP pairing flow, even though it did not work on my setup without further changes.
