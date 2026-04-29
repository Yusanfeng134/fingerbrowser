# Environment Check Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a built-in local `合规环境自检` page by default whenever a browser environment launches.

**Architecture:** Add a focused page generator in `src/main/domain/environment-check-page.ts`, pass its `file://` URL through `buildChromiumLaunchPlan`, and have browser controllers generate it immediately before launch. The page is static local HTML/JS, performs factual browser diagnostics, and never stores or uploads results to FingerBrowser services.

**Tech Stack:** Electron main process, TypeScript, Node `fs/path/url`, Vitest, Playwright E2E.

---

### Task 1: Environment Check Page Generator

**Files:**
- Create: `src/main/domain/environment-check-page.ts`
- Test: `tests/environment-check-page.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/environment-check-page.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeEnvironmentCheckPage } from '../src/main/domain/environment-check-page';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerbrowser-check-page-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('environment check page', () => {
  it('writes a local diagnostic page and returns a file URL', () => {
    const dataDir = createTempDir();

    const result = writeEnvironmentCheckPage({ dataDir });
    const html = readFileSync(result.filePath, 'utf8');

    expect(existsSync(result.filePath)).toBe(true);
    expect(fileURLToPath(result.url)).toBe(result.filePath);
    expect(result.filePath).toBe(path.join(dataDir, 'environment-check', 'environment-check.html'));
    expect(html).toContain('合规环境自检');
    expect(html).toContain('网络');
    expect(html).toContain('WebRTC');
    expect(html).toContain('navigator.userAgent');
    expect(html).toContain('api.ipify.org');
  });

  it('does not embed local paths or sensitive values in the generated page', () => {
    const dataDir = path.join(createTempDir(), 'profile-secret-token-cache');

    const result = writeEnvironmentCheckPage({ dataDir });
    const html = readFileSync(result.filePath, 'utf8');

    expect(html).not.toContain(dataDir);
    expect(html).not.toMatch(/password|token|secret|encrypted|profile-secret-token-cache/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/environment-check-page.test.ts
```

Expected: fail because `src/main/domain/environment-check-page.ts` does not exist.

- [ ] **Step 3: Implement the generator**

Create `src/main/domain/environment-check-page.ts` with:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface EnvironmentCheckPageResult {
  filePath: string;
  url: string;
}

export function writeEnvironmentCheckPage(options: { dataDir: string }): EnvironmentCheckPageResult {
  const dir = path.join(options.dataDir, 'environment-check');
  const filePath = path.join(dir, 'environment-check.html');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, environmentCheckHtml(), 'utf8');
  return {
    filePath,
    url: pathToFileURL(filePath).toString()
  };
}

function environmentCheckHtml(): string {
  return `...complete static HTML...`;
}
```

The HTML must include sections for network, browser, language/time, window/screen, WebRTC, permissions, and storage support.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/environment-check-page.test.ts
```

Expected: pass.

### Task 2: Launch Plan Start URL

**Files:**
- Modify: `src/main/domain/chromium.ts`
- Test: `tests/chromium.test.ts`

- [ ] **Step 1: Write the failing launch-plan test**

Add to `tests/chromium.test.ts`:

```ts
it('opens the local environment check page as the first tab when provided', () => {
  const profile = createTestProfile('custom-kernel');
  const plan = buildChromiumLaunchPlan({
    executablePath: '/Applications/FingerBrowser Kernel.app/Contents/MacOS/Chromium',
    profile,
    proxy: null,
    kernelPolicyPath: '/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json',
    startUrl: 'file:///tmp/fingerbrowser/environment-check/environment-check.html'
  });

  expect(plan.startUrl).toBe('file:///tmp/fingerbrowser/environment-check/environment-check.html');
  expect(plan.args.at(-1)).toBe('file:///tmp/fingerbrowser/environment-check/environment-check.html');
  expect(plan.args).toContain('--fingerbrowser-policy=/tmp/fingerbrowser/profile-1/fingerbrowser_policy.json');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/chromium.test.ts
```

Expected: fail because `startUrl` is not part of the launch-plan input/result.

- [ ] **Step 3: Implement `startUrl`**

Modify `src/main/domain/chromium.ts`:

```ts
export interface ChromiumLaunchPlanInput {
  executablePath: string;
  profile: BrowserProfile;
  proxy: ProxyConfig | null;
  proxyAuthExtensionDir?: string;
  kernelPolicyPath?: string;
  startUrl?: string;
}

export interface ChromiumLaunchPlan {
  executablePath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  startUrl?: string;
}
```

In `buildChromiumLaunchPlan`, append `input.startUrl` after proxy/custom-kernel args:

```ts
if (input.startUrl) {
  args.push(input.startUrl);
}
```

Return `startUrl: input.startUrl`.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm test -- tests/chromium.test.ts
```

Expected: pass.

### Task 3: Browser Runtime Integration

**Files:**
- Modify: `src/main/infrastructure/browser-runtime.ts`
- Modify: `src/main/domain/chromium.ts`
- Modify: `e2e/app.spec.ts`

- [ ] **Step 1: Write E2E assertion**

In `e2e/app.spec.ts`, after launching the first official environment, assert:

```ts
const checkPagePath = path.join(dataDir, 'environment-check', 'environment-check.html');
expect(existsSync(checkPagePath)).toBe(true);
expect(readFileSync(checkPagePath, 'utf8')).toContain('合规环境自检');
```

Import `existsSync` and `readFileSync` from `node:fs`.

- [ ] **Step 2: Run E2E to verify failure**

Run:

```bash
npm run e2e
```

Expected: fail because E2E mock launch does not generate the page.

- [ ] **Step 3: Wire page generation into controllers**

Modify `src/main/infrastructure/browser-runtime.ts`:

- Import `writeEnvironmentCheckPage`.
- Before `buildChromiumLaunchPlan`, call `writeEnvironmentCheckPage({ dataDir: this.dataDir })`.
- Pass `startUrl: environmentCheckPage.url`.

Modify `src/main/domain/chromium.ts`:

- Let `MockBrowserController` accept an optional `dataDir`.
- In mock `launch`, if `dataDir` exists, call `writeEnvironmentCheckPage({ dataDir })`.

Modify `createBrowserController` so E2E uses `new MockBrowserController(options.dataDir)`.

- [ ] **Step 4: Run E2E to verify pass**

Run:

```bash
npm run e2e
```

Expected: pass.

### Task 4: Full Verification And Package

**Files:**
- No source changes unless checks fail.

- [ ] **Step 1: Run quick automated checks**

Run:

```bash
/Users/test/.codex/skills/auto-testing/scripts/auto_test.sh --quick /Users/test/Desktop/fingerbrowser
```

Expected: typecheck, lint, and unit tests pass.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm run build
npm run e2e
npm run package:mac
```

Expected: all pass. `package:mac` remains unsigned because `identity` is intentionally `null`.

- [ ] **Step 3: Refresh debug zip**

Run:

```bash
rm -rf release/指纹浏览器.app
ditto release/mac-arm64/指纹浏览器.app release/指纹浏览器.app
ditto -c -k --sequesterRsrc --keepParent release/mac-arm64/指纹浏览器.app release/fingerbrowser-mac-arm64-debug.zip
shasum -a 256 release/fingerbrowser-mac-arm64-debug.zip
```

Expected: prints the new debug zip checksum.

- [ ] **Step 4: Commit and push**

Run:

```bash
git status -sb
git add src/main/domain/environment-check-page.ts src/main/domain/chromium.ts src/main/infrastructure/browser-runtime.ts tests/environment-check-page.test.ts tests/chromium.test.ts e2e/app.spec.ts
git commit -m "Open local environment check page on launch"
git push origin feature/kernel-runtime
```

Expected: branch pushes successfully.
