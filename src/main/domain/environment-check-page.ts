import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FingerprintPolicy, ProxyTestResult } from '../../shared/types';

export interface EnvironmentCheckPageResult {
  filePath: string;
  url: string;
}

export function writeEnvironmentCheckPage(options: {
  dataDir: string;
  fingerprintPolicy?: Pick<FingerprintPolicy, 'locale' | 'timezone'>;
  proxyDiagnostic?: ProxyTestResult | null;
}): EnvironmentCheckPageResult {
  const dir = path.join(options.dataDir, 'environment-check');
  const filePath = path.join(dir, 'environment-check.html');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, environmentCheckHtml(options.fingerprintPolicy, options.proxyDiagnostic), 'utf8');
  return {
    filePath,
    url: pathToFileURL(filePath).toString()
  };
}

function environmentCheckHtml(
  fingerprintPolicy?: Pick<FingerprintPolicy, 'locale' | 'timezone'>,
  proxyDiagnostic?: ProxyTestResult | null
): string {
  const expectedPolicyJson = jsonForScript({
    locale: fingerprintPolicy?.locale ?? null,
    timezone: fingerprintPolicy?.timezone ?? null
  });
  const proxyDiagnosticJson = jsonForScript(redactProxyDiagnostic(proxyDiagnostic));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>合规环境自检</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f2f2a;
      background: #f5f7f2;
    }
    body {
      margin: 0;
      padding: 28px;
    }
    main {
      max-width: 1040px;
      margin: 0 auto;
    }
    header {
      display: grid;
      gap: 6px;
      margin-bottom: 22px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #5d6962;
      line-height: 1.55;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }
    section {
      min-height: 150px;
      border: 1px solid #d7dfd5;
      border-radius: 8px;
      padding: 16px;
      background: #ffffff;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 16px;
      letter-spacing: 0;
    }
    dl {
      display: grid;
      gap: 9px;
      margin: 0;
    }
    .row {
      display: grid;
      grid-template-columns: 108px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      font-size: 13px;
    }
    dt {
      color: #68746d;
      font-weight: 700;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
      color: #26342f;
      font-weight: 650;
    }
    .note {
      margin-top: 18px;
      padding: 12px 14px;
      border: 1px solid #d7dfd5;
      border-radius: 8px;
      color: #596760;
      background: #eef3ed;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>合规环境自检</h1>
      <p>用于本地排查代理、语言、时区、窗口、WebRTC、权限和存储状态。页面只展示事实，不提供平台通过率、风控评分或规避建议。</p>
    </header>
    <div class="grid">
      <section>
        <h2>网络</h2>
        <dl>
          <div class="row"><dt>外网 IP</dt><dd id="public-ip">检测中</dd></div>
          <div class="row"><dt>IP 时区</dt><dd id="ip-timezone">检测中</dd></div>
          <div class="row"><dt>时区一致性</dt><dd id="timezone-consistency">等待检测</dd></div>
          <div class="row"><dt>检测状态</dt><dd id="ip-status">正在查询公开 IP 服务</dd></div>
        </dl>
      </section>
      <section>
        <h2>浏览器</h2>
        <dl>
          <div class="row"><dt>User-Agent</dt><dd id="user-agent"></dd></div>
          <div class="row"><dt>平台</dt><dd id="platform"></dd></div>
          <div class="row"><dt>Cookie</dt><dd id="cookie-enabled"></dd></div>
          <div class="row"><dt>localStorage</dt><dd id="local-storage"></dd></div>
        </dl>
      </section>
      <section>
        <h2>语言与时间</h2>
        <dl>
          <div class="row"><dt>语言</dt><dd id="language"></dd></div>
          <div class="row"><dt>语言列表</dt><dd id="languages"></dd></div>
          <div class="row"><dt>目标时区</dt><dd id="expected-timezone"></dd></div>
          <div class="row"><dt>时区</dt><dd id="timezone"></dd></div>
          <div class="row"><dt>本地时间</dt><dd id="local-time"></dd></div>
        </dl>
      </section>
      <section>
        <h2>窗口与屏幕</h2>
        <dl>
          <div class="row"><dt>Viewport</dt><dd id="viewport"></dd></div>
          <div class="row"><dt>屏幕</dt><dd id="screen-size"></dd></div>
          <div class="row"><dt>像素比</dt><dd id="pixel-ratio"></dd></div>
        </dl>
      </section>
      <section>
        <h2>WebRTC</h2>
        <dl>
          <div class="row"><dt>接口</dt><dd id="webrtc-support"></dd></div>
          <div class="row"><dt>候选信息</dt><dd id="webrtc-candidates">等待检测</dd></div>
        </dl>
      </section>
      <section>
        <h2>权限</h2>
        <dl>
          <div class="row"><dt>Notifications</dt><dd id="permission-notifications"></dd></div>
          <div class="row"><dt>Geolocation</dt><dd id="permission-geolocation"></dd></div>
        </dl>
      </section>
    </div>
    <p class="note">外网 IP 查询由当前浏览器环境直接访问公开 IP 服务；查询失败不影响其他本地检查。</p>
  </main>
  <script id="expected-policy" type="application/json">${expectedPolicyJson}</script>
  <script id="proxy-diagnostic" type="application/json">${proxyDiagnosticJson}</script>
  <script>
    const setText = (id, value) => {
      document.getElementById(id).textContent = value || '无法检测';
    };

    setText('user-agent', navigator.userAgent);
    setText('platform', navigator.platform || '不支持');
    setText('cookie-enabled', navigator.cookieEnabled ? '可用' : '不可用');
    setText('language', navigator.language);
    setText('languages', Array.isArray(navigator.languages) ? navigator.languages.join(', ') : '不支持');
    const expectedPolicy = JSON.parse(document.getElementById('expected-policy').textContent || '{}');
    setText('expected-timezone', expectedPolicy.timezone || '未设置');
    setText('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || '无法检测');
    setText('local-time', new Date().toLocaleString());
    setText('viewport', window.innerWidth + ' x ' + window.innerHeight);
    setText('screen-size', screen.width + ' x ' + screen.height);
    setText('pixel-ratio', String(window.devicePixelRatio || 1));

    try {
      const key = 'fingerbrowser_environment_check';
      localStorage.setItem(key, 'ok');
      localStorage.removeItem(key);
      setText('local-storage', '可用');
    } catch {
      setText('local-storage', '不可用');
    }

    async function queryPermission(name, targetId) {
      if (!navigator.permissions || !navigator.permissions.query) {
        setText(targetId, '不支持');
        return;
      }
      try {
        const result = await navigator.permissions.query({ name });
        setText(targetId, result.state);
      } catch {
        setText(targetId, '不支持');
      }
    }

    queryPermission('notifications', 'permission-notifications');
    queryPermission('geolocation', 'permission-geolocation');

    function currentJavascriptTimezone() {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    }

    function updateTimezoneConsistency(ipTimezone) {
      const jsTimezone = currentJavascriptTimezone();
      if (!ipTimezone || !jsTimezone) {
        setText('timezone-consistency', '无法检测');
        return;
      }
      setText('timezone-consistency', ipTimezone === jsTimezone ? '一致' : '不一致：IP=' + ipTimezone + ' / JS=' + jsTimezone);
    }

    function applyProxyDiagnostic() {
      const diagnostic = JSON.parse(document.getElementById('proxy-diagnostic').textContent || 'null');
      if (!diagnostic || diagnostic.status !== 'passed' || !diagnostic.ip) {
        return false;
      }
      setText('public-ip', diagnostic.ip);
      setText('ip-timezone', diagnostic.ipTimezone || '无法检测');
      if (typeof diagnostic.timezoneMatch === 'boolean') {
        setText('timezone-consistency', diagnostic.timezoneMatch ? '一致' : '不一致：IP=' + diagnostic.ipTimezone + ' / JS=' + currentJavascriptTimezone());
      } else {
        updateTimezoneConsistency(diagnostic.ipTimezone);
      }
      setText('ip-status', '主进程代理检测结果');
      return true;
    }

    async function detectPublicIp() {
      const endpoints = [
        {
          url: 'https://ipwho.is/',
          parse: (data) => ({
            ip: data.ip,
            timezone: data.timezone && data.timezone.id
          })
        },
        {
          url: 'https://ipapi.co/json/',
          parse: (data) => ({
            ip: data.ip,
            timezone: data.timezone
          })
        },
        {
          url: 'https://ifconfig.co/json',
          parse: (data) => ({
            ip: data.ip || data.ip_addr,
            timezone: data.time_zone
          })
        }
      ];
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, { cache: 'no-store' });
          if (!response.ok) {
            continue;
          }
          const data = await response.json();
          const result = endpoint.parse(data);
          const ip = result.ip;
          if (ip) {
            setText('public-ip', ip);
            setText('ip-timezone', result.timezone || '无法检测');
            updateTimezoneConsistency(result.timezone);
            setText('ip-status', '检测完成');
            return;
          }
        } catch {
          setText('ip-status', '正在尝试备用服务');
        }
      }
      setText('public-ip', '无法检测');
      setText('ip-timezone', '无法检测');
      setText('timezone-consistency', '无法检测');
      setText('ip-status', '公开 IP 服务不可用或网络不可达');
    }

    function detectWebRtc() {
      if (!window.RTCPeerConnection) {
        setText('webrtc-support', '不支持');
        setText('webrtc-candidates', '不支持');
        return;
      }
      setText('webrtc-support', '可用');
      const candidates = [];
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('check');
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidates.push(event.candidate.candidate);
          setText('webrtc-candidates', candidates.length + ' 条候选信息');
        } else if (candidates.length === 0) {
          setText('webrtc-candidates', '未收集到候选信息');
        }
      };
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => setText('webrtc-candidates', '无法检测'));
      setTimeout(() => {
        pc.close();
        if (candidates.length === 0) {
          setText('webrtc-candidates', '未收集到候选信息');
        }
      }, 2500);
    }

    if (!applyProxyDiagnostic()) {
      detectPublicIp();
    }
    detectWebRtc();
  </script>
</body>
</html>
`;
}

type EmbeddedProxyDiagnostic = Pick<ProxyTestResult, 'status' | 'testedAt'> &
  Partial<Pick<ProxyTestResult, 'ip' | 'ipTimezone' | 'timezoneMatch'>>;

function redactProxyDiagnostic(input?: ProxyTestResult | null): EmbeddedProxyDiagnostic | null {
  if (!input) {
    return null;
  }
  return {
    status: input.status,
    testedAt: input.testedAt,
    ...(input.ip ? { ip: input.ip } : {}),
    ...(input.ipTimezone ? { ipTimezone: input.ipTimezone } : {}),
    ...(input.timezoneMatch !== undefined ? { timezoneMatch: input.timezoneMatch } : {})
  };
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return character;
    }
  });
}
