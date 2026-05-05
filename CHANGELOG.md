# s20-wifi-setup

## 1.0.2

### Patch Changes

- Align the acknowledgements wording with the rest of the docs by referring
  to the Orvibo S20 as a socket there too.

## 1.0.1

### Patch Changes

- Prefer the official "smart socket" wording across the CLI, package
  metadata, and README, while keeping `smart-plug` in package keywords for
  searchability.

## 1.0.0

### Minor Changes

- Refresh the README with clearer setup guidance, onboarding notes, and
  troubleshooting advice for pairing legacy Orvibo Wiwo S20 sockets.
- Improve pairing output by referring to the target network as "your Wi-Fi"
  and surfacing the discovered device MAC address in a clearer, colon-separated
  format.

## 0.5.0

### Minor Changes

- Refine the CLI, package, and README one-liner to make it clearer that the
  tool connects legacy Orvibo Wiwo S20 smart sockets to Wi-Fi from the terminal.
- Refactor command execution helpers to use Effect child processes internally
  while keeping the diagnostics and probe coverage passing.

## 0.4.0

### Minor Changes

- Improve onboarding docs for first-time S20 owners and clarify the current
  Windows support story across the README and CLI output.

## 0.3.0

### Minor Changes

- Improve pairing reliability by failing fast on missing device acknowledgements and keeping the unicast-to-broadcast fallback path covered by tests.
- Improve diagnostics by serializing UDP probes, printing the full report to stdout instead of writing `/tmp` files, and rendering UDP probe send failures as report lines instead of raw Effect runtime errors.
- Render user-facing CLI failures without Effect runtime noise or stack-heavy output for expected errors such as discovery timeouts.
- Lower the runtime requirement to Node 22+, expand CI coverage to Linux and macOS, and verify build, lint, tests, and bundled CLI help in the release workflow before publish.

## 0.2.0

### Minor Changes

- Publish a single bundled `dist/cli.js` artifact so `npx s20-wifi-setup@latest ...` works without TypeScript runtime handling inside `node_modules`.

## 0.1.0

### Minor Changes

- Initial public release of the Effect-based CLI for pairing and diagnosing Orvibo Wiwo S20 smart sockets.
