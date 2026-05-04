# s20-wifi-setup

Connect legacy Orvibo Wiwo S20 smart plugs to Wi-Fi from the terminal.

The original Wiwo app is no longer available, but older S20 plugs still work.
This command-line tool recreates the pairing flow used by the app, so you can connect the plug to your Wi-Fi network from a laptop.

If your plug looks like this, you're probably in the right place:

<img src="docs/images/orvibo-wiwo-s20-light-blue.png" width="170" height="282" alt="Orvibo Wiwo S20 smart plug">

> [!WARNING]
> [Home Assistant's Orvibo integration page](https://www.home-assistant.io/integrations/orvibo/) warns about the European ORVIBO Wi-Fi SMART SOCKET S20 (`LGS-20`) and links to the [RAPEX recall entry](https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/10002910).
> That warning is about electrical safety, not software support.
> Use this repo to pair hardware you already own.
> It is not a recommendation to buy, keep using, or power up a recalled device without making your own safety assessment.

## What you will need

- An Orvibo Wiwo S20 plug.
- A Mac or Linux laptop with Wi-Fi and Terminal access.
- [Node.js](https://nodejs.org/) 22 or newer installed.
- The Wi-Fi name and password that the plug should use.

> [!NOTE]
> Windows may also work, but this tool was tested on macOS and Linux.

If `node --version` or `npm --version` fails, install Node.js first and then come back here.

Install the tool while your laptop is still connected to the internet:

```sh
npm install --global s20-wifi-setup
```

This avoids relying on the npm registry after you switch to the plug's temporary Wi-Fi network.
You do not need to clone this repo or know JavaScript.

## Pair the plug

1.  While your laptop is still connected to the internet, make sure the pairing tool is ready:

    ```sh
    s20-wifi-setup --help
    ```

    You should see the help output.

1.  Plug the S20 into a power socket.

1.  Put the plug into pairing mode by pressing and holding the button on it.
    The LED should start flashing blue.

1.  On your laptop, turn off any VPN or network-routing tools until the plug is paired.

1.  Connect your laptop to the plug's temporary Wi-Fi network, usually `WiWo-S20`.

1.  Run the pairing command and replace the Wi-Fi details with your own:

    ```sh
    s20-wifi-setup pair --ssid "MyWifi" --password "super-secret"
    ```

    > [!TIP]
    > The command above includes your Wi-Fi password, so it may end up in your shell history.
    > In Bash, adding a leading space can keep it out of history if `HISTCONTROL` is set to `ignorespace` or `ignoreboth`.

1.  Wait for the command to finish with:

    ```text
    Done. The S20 should now reboot and join the SSID.
    ```

1.  Wait a few seconds for the plug to reconnect to your normal Wi-Fi.
1.  Reconnect your laptop to your usual Wi-Fi network if needed.

## If pairing fails

Start with these checks:

- Make sure the LED is still quickly flashing blue.
- Confirm that your laptop got a `10.10.100.x` address while joined to `WiWo-S20`.
- Turn off VPNs or route-altering network tools.
- If the plug uses a non-default IP, try `--target-ip`.

Example:

```sh
s20-wifi-setup pair \
  --ssid "MyWifi" \
  --password "super-secret" \
  --target-ip 10.10.100.254
```

If that still does not work and you are on macOS or Linux, collect a diagnostic report:

```sh
s20-wifi-setup diagnose
```

Do not use `diagnose` as your next step on Windows.

`diagnose` prints a full report to stdout.
It may prompt for `sudo` so it can clear stale ARP state and run `tcpdump`.

## What the tool actually does

The S20 exposes a temporary Wi-Fi network while in pairing mode.
Once your laptop is connected to that network, this tool talks to the plug over UDP and reproduces the same AP-mode commands used by the original app.

It also handles a macOS-specific failure mode where discovery works, but direct sends to `10.10.100.254` fail with `EHOSTUNREACH`.
When that happens, the CLI retries via subnet broadcast automatically.

On Windows, pairing may still work because the actual pairing flow is just UDP over the plug's temporary network.
The unsupported part is diagnostics, not the core pairing protocol.

## Command reference

Show built-in help:

```sh
s20-wifi-setup --help
```

Use environment variables instead of command-line flags:

```sh
WIFI_SSID="MyWifi" WIFI_PASSWORD="super-secret" \
  s20-wifi-setup pair
```

### `pair` flags

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

### `diagnose` flags

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
