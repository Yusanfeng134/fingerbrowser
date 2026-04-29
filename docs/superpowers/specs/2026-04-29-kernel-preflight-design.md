# Kernel Delivery Preflight Design

## Summary

Add a compact kernel delivery preflight panel to help trial users and sales engineers verify whether a custom-kernel environment is ready for local trial delivery. The feature stays within the compliance boundary: it reports manifest/runtime readiness and redacted diagnostics only. It does not add fingerprint randomization, platform bypass, account automation, CAPTCHA bypass, or any browser behavior changes.

## Goals

- Show custom-kernel readiness in the existing `配置 -> 内核通道` area.
- Make manifest, compatibility, installation, environment selection, feedback-package readiness, and distribution risk visible without reading logs.
- Add a structured IPC result that can also be included in feedback packages.
- Keep all output redacted: no proxy passwords, password-vault values, license tokens, profile cookies/cache, manifest local path, or runtime local path in exported feedback.

## Non-Goals

- No automatic kernel update.
- No cloud upload or telemetry.
- No Chromium patch implementation in the desktop app repository.
- No macOS signing or notarization automation in this feature.
- No relaxation of current custom-kernel launch blocking behavior.

## User Experience

In the environment detail drawer, under `内核通道`, add a `交付预检` section.

Each preflight item shows one of three states:

- `通过`: Ready.
- `待处理`: User action is needed, but it does not necessarily block official-channel use.
- `阻塞`: Custom-kernel launch or delivery is not ready.

Initial preflight items:

- `Manifest`: manifest is imported, provided by environment variable, or using the built-in default.
- `兼容性`: platform is `darwin`, arch is `arm64`, and policy schema is `1`.
- `安装状态`: runtime executable exists.
- `环境通道`: selected profile uses `custom-kernel`.
- `反馈包`: feedback package will include redacted kernel summary.
- `分发风险`: unsigned/unnotarized builds are internal debug artifacts only.

The panel should use the existing enterprise-tool visual style: dense, scannable, no marketing copy, no decorative cards inside cards.

## Data Contract

Add:

```ts
type KernelPreflightSeverity = 'pass' | 'pending' | 'blocker';

interface KernelPreflightItem {
  id: string;
  label: string;
  severity: KernelPreflightSeverity;
  message: string;
}

interface KernelPreflightResult {
  summary: KernelPreflightSeverity;
  items: KernelPreflightItem[];
  generatedAt: string;
}
```

Add IPC:

```ts
kernel.preflight(profileId?: string): Promise<KernelPreflightResult>
```

`profileId` is optional so global diagnostic surfaces can still request a preflight summary. When provided, the result includes the selected environment channel item.

## Domain Rules

- Built-in default manifest is valid but `pending` for trial delivery because it points to a manual artifact and is not an imported build-machine output.
- Imported manifest and environment-variable manifest are acceptable sources for trial delivery.
- Manifest compatibility mismatch is a `blocker`.
- Missing custom runtime executable is a `blocker` for custom-kernel profile launch.
- Official-channel profile with valid kernel settings is `pending`, not `blocker`, because the current profile is not configured to use custom kernel.
- Distribution risk is always `pending` until signing/notarization is implemented.
- Overall summary is the highest severity among all items: `blocker` > `pending` > `pass`.

## Feedback Package

Include a redacted preflight summary in feedback packages:

- summary
- item ids
- item severities
- item labels/messages

Exclude local manifest path, runtime path, user data directory, profile cookies/cache, proxy credentials, password-vault values, and license tokens.

## Error Handling

- If preflight cannot resolve the profile, return a readable error through IPC.
- If manifest state contains `lastError`, surface it as a `blocker` item.
- Kernel installation and launch behavior remains unchanged: no silent fallback to official runtime.

## Tests

Unit:

- Preflight summary severity aggregation.
- Built-in manifest produces pending delivery source.
- Imported manifest plus installed executable passes manifest/compat/install checks.
- Missing executable blocks custom-kernel readiness.
- Official selected profile produces pending environment channel.
- Feedback package includes redacted preflight summary and excludes sensitive paths.

E2E:

- Import manifest.
- Open config tab.
- See preflight section.
- Custom-kernel profile shows imported manifest, compatibility, feedback summary, and runtime readiness states.

Verification:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run e2e`
- `npm run package:mac`
