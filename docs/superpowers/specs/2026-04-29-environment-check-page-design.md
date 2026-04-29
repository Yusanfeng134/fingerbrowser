# Environment Check Page Design

## Summary

Add a built-in local environment check page that opens by default when any browser environment launches. The page helps users verify local operating conditions such as IP visibility, language, timezone, viewport, WebRTC basics, permissions, cookies, and local storage. It is a compliance-oriented diagnostic page, not a risk-control bypass or anti-detection scoring tool.

## Goals

- Open a local check page as the first tab for both official Chromium and custom-kernel profiles.
- Generate the page locally from the desktop app before launch.
- Show factual browser/runtime information useful for local troubleshooting.
- Keep all checks explainable, stable, and auditable.
- Avoid uploading diagnostic data or storing sensitive values.

## Non-Goals

- No anti-fraud, anti-ban, or platform pass/fail score.
- No platform-specific risk-control advice.
- No CAPTCHA, account, or behavior automation.
- No Canvas/WebGL/font noise, spoofing, or randomization.
- No external fingerprint-checking website as the default start page.
- No remote collection of check results.

## Default Behavior

When the user clicks `启动 Chromium`, the launch plan includes a local `file://` URL for `environment-check.html`. Chromium opens this page in the first tab.

The page is generated under the app data directory, not inside profile cookies/cache directories. The generated file is static HTML/CSS/JS and can be overwritten safely on each launch.

Official and custom-kernel channels use the same page. Custom-kernel launch behavior remains unchanged: missing or invalid custom runtime still blocks launch and does not fall back to official Chromium.

## Page Content

The page title is `合规环境自检`.

Show these sections:

- `网络`: public IP lookup result and lookup status.
- `浏览器`: User-Agent, platform, cookie support, localStorage support.
- `语言与时间`: `navigator.language`, `navigator.languages`, resolved timezone, local time.
- `窗口与屏幕`: viewport size, screen size, device pixel ratio.
- `WebRTC`: whether `RTCPeerConnection` is available and whether ICE candidates can be collected.
- `权限`: queryable permission states such as notifications and geolocation when the browser supports the Permissions API.

All values are displayed as facts. The page does not classify results as safe/unsafe for any third-party platform.

## Public IP Lookup

Use a small list of public IP JSON endpoints from the local page script. If all endpoints fail, display `无法检测`.

The IP request is optional diagnostic traffic initiated by the launched browser session. It is not sent to FingerBrowser servers. The page must continue to render when offline.

## Data Contract

Add a launch-plan field:

```ts
interface ChromiumLaunchPlan {
  executablePath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  startUrl?: string;
}
```

Add a generator:

```ts
interface EnvironmentCheckPageResult {
  filePath: string;
  url: string;
}

function writeEnvironmentCheckPage(options: { dataDir: string }): EnvironmentCheckPageResult
```

`url` is a `file://` URL suitable for Chromium launch args.

## Launch Integration

- Main browser runtime writes the page before building the launch plan.
- `buildChromiumLaunchPlan` appends the page URL as the final positional arg.
- Existing launch args for privacy normalization, proxy, and custom-kernel policy stay unchanged.
- Tests should assert official and custom-kernel plans include the local check page URL when provided.

## Security And Privacy

The generated page must not include:

- proxy passwords
- password-vault values
- license tokens
- encrypted secrets
- profile cookies/cache paths or content
- userDataDir paths

The page should not persist results to disk. Browser-local storage checks may create a temporary key in the launched profile and delete it immediately.

## Error Handling

- If IP lookup fails, show `无法检测` and keep all local checks visible.
- If a browser API is unavailable, show `不支持`.
- If page generation fails, abort launch with a readable error rather than launching without the diagnostic page silently.

## Tests

Unit:

- Generated HTML contains expected headings and local diagnostic script.
- Generated HTML excludes sensitive keywords and paths.
- Launch plan includes environment check page URL when provided.
- Launch plan preserves custom-kernel policy args and proxy args.

Integration/E2E:

- Launching an environment generates `environment-check.html`.
- The launch request includes the local check page URL.
- Existing create/profile/proxy/password/audit flows keep passing.

Verification:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run e2e`
- `npm run package:mac`
