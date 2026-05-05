# s20-wifi-setup

_Connect legacy [Orvibo](https://www.orvibo.com) WiWo S20 smart sockets to Wi-Fi from the terminal_

[![npm version](https://img.shields.io/npm/v/s20-wifi-setup?logo=npm&color=3c7ef6&labelColor=333)](https://www.npmjs.com/package/s20-wifi-setup)
[![npm downloads](https://img.shields.io/npm/dt/s20-wifi-setup?logo=npm&color=3c7ef6&labelColor=333)](https://www.npmjs.com/package/s20-wifi-setup)
[![CI](https://img.shields.io/github/actions/workflow/status/kachkaev/s20-wifi-setup/ci.yaml?branch=main&label=CI&logo=github&color=3c7ef6&labelColor=333)](https://github.com/kachkaev/s20-wifi-setup/actions/workflows/ci.yaml)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-3c7ef6?labelColor=333)](LICENSE.md)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-friendly-3c7ef6?logo=homeassistant&logoColor=white&labelColor=333)](https://www.home-assistant.io/integrations/orvibo)

The original WiWo app is no longer available, but the sockets still work.
This command-line tool recreates the pairing flow used by the app, so you can connect the socket to your Wi-Fi network from a computer.

If your socket looks like this, you're probably in the right place!

<img src="docs/images/orvibo-wiwo-s20-light-blue.png" width="170" height="282" alt="Orvibo WiWo S20 smart socket">

> ‼️ **Caution**  
> [Home Assistant's Orvibo integration page](https://www.home-assistant.io/integrations/orvibo) warns about the European ORVIBO Wi-Fi SMART SOCKET S20 (`LGS-20`) and links to the [RAPEX recall entry](https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/10002910).
> That warning is about electrical safety, not software support.
> Use this repo to pair hardware you already own.
> It is not a recommendation to buy, keep using, or power up a recalled device without making your own safety assessment.

## What you will need

- An Orvibo WiWo S20 socket
- A Mac or Linux computer with Wi-Fi and Terminal access  
  _Windows may also work, but the tool was not tested there_
- [Node.js](https://nodejs.org) 22 or newer installed
- The Wi-Fi name and password that the socket should use

You do not need to clone this repo or know JavaScript.
If `node --version` or `npm --version` fail, install Node.js first and then come back here.

## Step-by-step pairing instructions

1.  Install the tool while your computer is still connected to the internet:

    ```sh
    npm install --global s20-wifi-setup
    ```

    Using `npx` here will usually fail.
    Running `npx s20-wifi-setup` still checks the npm registry, which is unavailable once you switch to the socket's temporary Wi-Fi network.

    > 💡 **Tip**  
    > If a global install is inconvenient, you can install the tool into a throwaway local project instead:
    >
    > ```sh
    > cd /path/to/some/empty/directory
    > npm init --yes
    > npm install --save-dev s20-wifi-setup
    > ```
    >
    > If you install the tool locally, run `npm exec s20-wifi-setup -- [args]` from that directory instead of `s20-wifi-setup [args]`.
    > The rest of this README assumes a global install.

1.  While your computer is still connected to the internet, make sure the pairing tool starts correctly:

    ```sh
    s20-wifi-setup --help
    ```

    You should see the help output.

1.  Plug the S20 into a power socket.

1.  Put the socket into pairing mode by pressing and holding the button on it.
    The LED should start flashing blue.
    If it flashes red instead, press and hold the button again.

1.  On your computer, turn off any VPNs or other tools that change network routing until the socket is paired.

1.  Connect your computer to the socket's temporary Wi-Fi network, usually `WiWo-S20`.

1.  Run the pairing command and replace the Wi-Fi details with your own:

    ```sh
    s20-wifi-setup pair --ssid "MyWifi" --password "super-secret"
    ```

    > 💡 **Tip**  
    > The command above includes your Wi-Fi password, so it may end up in your shell history.
    > In Bash, adding a leading space can keep it out of history if `HISTCONTROL` is set to `ignorespace` or `ignoreboth`.

1.  Wait for the command to finish.
    You should see:

    ```text
    Done. The S20 should now reboot and join your Wi-Fi.
    ```

1.  Wait a few seconds for the socket to reconnect to your usual Wi-Fi.

1.  Reconnect your computer to your usual Wi-Fi network if needed.

1.  Enjoy your smart socket!

    🎉 🎉 🎉  
    🎉 🔌 🎉  
    🎉 🎉 🎉

    Consider integrating it with [Home Assistant](https://www.home-assistant.io/integrations/orvibo) or your preferred home automation system.

1.  Uninstall the tool if you no longer need it:

    ```sh
    npm uninstall --global s20-wifi-setup
    ```

## If pairing fails

Start with these checks:

- Make sure the LED is still quickly flashing blue.
- Confirm that your computer got a `10.10.100.x` address while joined to `WiWo-S20`.
- Turn off VPNs or other tools that change network routing.
- If the socket uses a non-default IP, try `--target-ip`.

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

Do not rely on `diagnose` as your next step on Windows.
The most useful diagnostics currently require macOS or Linux.

The `diagnose` command prints a full report to stdout.
It may prompt for `sudo` so it can clear stale ARP state and run `tcpdump`.

You can create an issue describing the details, but please be mindful about sharing private information such as MAC addresses or Wi-Fi names.
If you want a quicker first pass, paste the report into an LLM alongside a link to this repo instead of opening an issue right away.

## What the tool actually does

The S20 exposes a temporary Wi-Fi network while in pairing mode.
Once your computer is connected to that network, this tool talks to the socket over UDP and reproduces the same AP-mode commands used by the original WiWo app.

It also handles a macOS-specific failure mode where discovery works, but direct sends to `10.10.100.254` fail with `EHOSTUNREACH`.
When that happens, the CLI retries via subnet broadcast automatically.

On Windows, pairing may still work because the actual pairing flow is just UDP over the socket's temporary network.
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

This section is for contributing to the tool itself.
If you only want to pair a socket, you can ignore it.

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
- `pnpm lint` runs linters (cspell, eslint, knip, markdownlint, pnpm dedupe, prettier, and TypeScript).
- `pnpm fix` applies the available autofixes.
- `pnpm test` runs the hardware-free unit tests.

## Acknowledgements

This project was inspired by [darrensteele/s20](https://github.com/darrensteele/s20), a Python tool for pairing Orvibo S20 plugs.
That project helped confirm the basic UDP pairing flow, even though it did not work on my setup without further changes.
