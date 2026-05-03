# s20-wifi-setup

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

- Initial public release of the Effect-based CLI for pairing and diagnosing Orvibo Wiwo S20 smart plugs.
