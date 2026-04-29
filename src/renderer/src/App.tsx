import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Clock3,
  Download,
  FolderPlus,
  Globe2,
  History,
  KeyRound,
  Mail,
  PackageCheck,
  Play,
  Power,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Wifi
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FINGERPRINT_POLICY } from '../../shared/defaults';
import type {
  AuditEvent,
  BrowserProfile,
  CreateProfileInput,
  FingerprintPolicy,
  ProfileDetails,
  ProxyScheme,
  RedactedLicenseState,
  UpdateProfileInput,
  UsageSummary
} from '../../shared/types';

interface DraftState {
  id: string | null;
  name: string;
  tags: string;
  proxyEnabled: boolean;
  proxyScheme: ProxyScheme;
  proxyHost: string;
  proxyPort: string;
  proxyUsername: string;
  proxyPassword: string;
  proxyBypassList: string;
  fingerprintPolicy: FingerprintPolicy;
}

type ActiveTab = 'config' | 'audit' | 'license';

const emptyDraft: DraftState = {
  id: null,
  name: '',
  tags: '',
  proxyEnabled: true,
  proxyScheme: 'http',
  proxyHost: '',
  proxyPort: '',
  proxyUsername: '',
  proxyPassword: '',
  proxyBypassList: 'localhost,127.0.0.1',
  fingerprintPolicy: DEFAULT_FINGERPRINT_POLICY
};

const statusText: Record<BrowserProfile['status'], string> = {
  running: '运行中',
  closed: '已关闭',
  error: '异常'
};

const statusTone: Record<BrowserProfile['status'], string> = {
  running: 'good',
  closed: 'muted',
  error: 'bad'
};

const actionLabel: Record<string, string> = {
  PROFILE_CREATED: '创建环境',
  PROFILE_UPDATED: '更新环境',
  PROFILE_LAUNCHED: '启动 Chromium',
  PROFILE_STOPPED: '关闭环境',
  PROXY_CREATED: '创建代理',
  PROXY_UPDATED: '更新代理',
  PROXY_TESTED: '测试代理',
  CHROMIUM_INSTALLED: '安装 Chromium',
  LICENSE_ACTIVATED: '激活许可证',
  LICENSE_REFRESHED: '刷新许可证',
  LICENSE_DEACTIVATED: '停用许可证',
  AUDIT_EXPORTED: '导出审计',
  PROFILES_EXPORTED: '导出配置',
  SUPPORT_LOGS_PACKAGED: '打包支持日志',
  ERROR_RECORDED: '记录错误'
};

const licenseStatusText: Record<RedactedLicenseState['status'], string> = {
  inactive: '未激活',
  active: '有效',
  grace: '宽限期',
  expired: '已过期'
};

function profileToDraft(profile: ProfileDetails): DraftState {
  return {
    id: profile.id,
    name: profile.name,
    tags: profile.tags.join(','),
    proxyEnabled: Boolean(profile.proxy),
    proxyScheme: profile.proxy?.scheme ?? 'http',
    proxyHost: profile.proxy?.host ?? '',
    proxyPort: profile.proxy?.port ? String(profile.proxy.port) : '',
    proxyUsername: profile.proxy?.username ?? '',
    proxyPassword: '',
    proxyBypassList: profile.proxy?.bypassList.join(',') ?? 'localhost,127.0.0.1',
    fingerprintPolicy: profile.fingerprintPolicy
  };
}

function draftToCreateInput(draft: DraftState): CreateProfileInput {
  return {
    name: draft.name,
    tags: splitCsv(draft.tags),
    fingerprintPolicy: draft.fingerprintPolicy,
    proxy:
      draft.proxyEnabled && draft.proxyHost
        ? {
            scheme: draft.proxyScheme,
            host: draft.proxyHost,
            port: Number(draft.proxyPort),
            username: draft.proxyUsername,
            password: draft.proxyPassword,
            bypassList: splitCsv(draft.proxyBypassList)
          }
        : undefined
  };
}

function draftToUpdateInput(draft: DraftState): UpdateProfileInput {
  if (!draft.id) {
    throw new Error('缺少环境 ID');
  }
  return {
    id: draft.id,
    name: draft.name,
    tags: splitCsv(draft.tags),
    fingerprintPolicy: draft.fingerprintPolicy,
    proxy:
      draft.proxyEnabled && draft.proxyHost
        ? {
            scheme: draft.proxyScheme,
            host: draft.proxyHost,
            port: Number(draft.proxyPort),
            username: draft.proxyUsername,
            password: draft.proxyPassword || undefined,
            bypassList: splitCsv(draft.proxyBypassList)
          }
        : null
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function App(): JSX.Element {
  const [profiles, setProfiles] = useState<ProfileDetails[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [license, setLicense] = useState<RedactedLicenseState | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('config');
  const [notice, setNotice] = useState('准备就绪');
  const [busy, setBusy] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  const filteredProfiles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return profiles;
    }
    return profiles.filter((profile) => {
      const haystack = [profile.name, profile.tags.join(','), profile.proxy?.host ?? '', profile.status].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [profiles, query]);

  const canCreateProfile = useMemo(() => {
    if (!license || !usage) {
      return false;
    }
    return (license.status === 'active' || license.status === 'grace') && usage.profilesUsed < usage.profileLimit;
  }, [license, usage]);

  const licenseUsagePercent = useMemo(() => {
    if (!usage || usage.profileLimit === 0) {
      return 0;
    }
    return Math.min(100, Math.round((usage.profilesUsed / usage.profileLimit) * 100));
  }, [usage]);

  const loadProfiles = useCallback(async () => {
    const nextProfiles = await window.fingerBrowser.profiles.list();
    setProfiles(nextProfiles);
    if (nextProfiles.length > 0) {
      setSelectedId((current) => current ?? nextProfiles[0].id);
    }
  }, []);

  const loadAudits = useCallback(async (profileId?: string) => {
    const nextAudits = await window.fingerBrowser.audit.list(profileId);
    setAudits(nextAudits);
  }, []);

  const loadCommercialState = useCallback(async () => {
    const [nextLicense, nextUsage] = await Promise.all([
      window.fingerBrowser.license.status(),
      window.fingerBrowser.license.usage()
    ]);
    setLicense(nextLicense);
    setUsage(nextUsage);
  }, []);

  useEffect(() => {
    void Promise.all([loadProfiles(), loadCommercialState()]).catch((error) =>
      setNotice(error instanceof Error ? error.message : '加载环境失败')
    );
  }, [loadCommercialState, loadProfiles]);

  useEffect(() => {
    if (selectedProfile) {
      setDraft(profileToDraft(selectedProfile));
      void loadAudits(selectedProfile.id);
    } else {
      setDraft(emptyDraft);
      void loadAudits();
    }
  }, [loadAudits, selectedProfile]);

  const run = useCallback(async (label: string, task: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(`${label}中...`);
    try {
      const message = await task();
      setNotice(message ?? `${label}完成`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleNewProfile = (): void => {
    if (!canCreateProfile) {
      setActiveTab('license');
      setNotice(license?.status === 'inactive' ? '请先激活许可证' : '当前套餐环境数已达上限');
      return;
    }
    setSelectedId(null);
    setDraft({
      ...emptyDraft,
      name: `运营环境 ${profiles.length + 1}`
    });
    setActiveTab('config');
    setNotice('正在创建新环境');
  };

  const handleSave = (): void => {
    void run('保存环境', async () => {
      const saved = draft.id
        ? await window.fingerBrowser.profiles.update(draftToUpdateInput(draft))
        : await window.fingerBrowser.profiles.create(draftToCreateInput(draft));
      await loadProfiles();
      await loadCommercialState();
      setSelectedId(saved.id);
      await loadAudits(saved.id);
    });
  };

  const handleProxyTest = (): void => {
    void run('测试代理', async () => {
      if (!draft.proxyHost || !draft.proxyPort) {
        throw new Error('请先填写代理主机和端口');
      }
      const result = await window.fingerBrowser.proxy.test({
        profileId: draft.id ?? undefined,
        scheme: draft.proxyScheme,
        host: draft.proxyHost,
        port: Number(draft.proxyPort),
        timeoutMs: 3000
      });
      await loadProfiles();
      await loadCommercialState();
      if (draft.id) {
        await loadAudits(draft.id);
      }
      return result.message;
    });
  };

  const handleLaunch = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('启动 Chromium', async () => {
      await window.fingerBrowser.profiles.launch(selectedProfile.id);
      await loadProfiles();
      await loadCommercialState();
      await loadAudits(selectedProfile.id);
    });
  };

  const handleStop = (): void => {
    if (!selectedProfile) {
      return;
    }
    void run('关闭环境', async () => {
      await window.fingerBrowser.profiles.stop(selectedProfile.id);
      await loadProfiles();
      await loadCommercialState();
      await loadAudits(selectedProfile.id);
    });
  };

  const handleEnsureChromium = (): void => {
    void run('检查 Chromium', async () => {
      const result = await window.fingerBrowser.chromium.ensureInstalled();
      setNotice(`Chromium ${result.version} ${result.alreadyInstalled ? '已就绪' : '已安装'}`);
      await loadAudits(selectedProfile?.id);
    });
  };

  const handleActivateLicense = (): void => {
    void run('激活许可证', async () => {
      const state = await window.fingerBrowser.license.activate({ activationCode });
      setLicense(state);
      await loadCommercialState();
      await loadAudits();
      setActivationCode('');
      return `${state.teamName} ${state.plan.name} 已激活`;
    });
  };

  const handleRefreshLicense = (): void => {
    void run('刷新许可证', async () => {
      const state = await window.fingerBrowser.license.refresh();
      setLicense(state);
      await loadCommercialState();
      await loadAudits();
      return `许可证状态：${licenseStatusText[state.status]}`;
    });
  };

  const handleDeactivateLicense = (): void => {
    void run('停用许可证', async () => {
      const state = await window.fingerBrowser.license.deactivate();
      setLicense(state);
      await loadCommercialState();
      await loadAudits();
    });
  };

  const handleAuditExport = (): void => {
    void run('导出审计', async () => {
      const result = await window.fingerBrowser.audit.export(selectedProfile?.id);
      await loadAudits(selectedProfile?.id);
      return `审计已导出：${result.filePath}`;
    });
  };

  const handleProfilesExport = (): void => {
    void run('导出配置', async () => {
      const result = await window.fingerBrowser.profiles.export();
      await loadAudits();
      return `配置已导出：${result.filePath}`;
    });
  };

  const handleBatchProxyTest = (): void => {
    void run('批量检测代理', async () => {
      const results = await window.fingerBrowser.proxy.testAll();
      await loadProfiles();
      await loadAudits(selectedProfile?.id);
      return `已检测 ${results.length} 个代理`;
    });
  };

  const handlePackageLogs = (): void => {
    void run('打包支持日志', async () => {
      const result = await window.fingerBrowser.support.packageLogs();
      await loadAudits();
      return `支持日志已打包：${result.filePath}`;
    });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1>指纹浏览器</h1>
            <p>企业环境管理</p>
          </div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          <a className="active" href="#profiles">
            <Globe2 size={17} />
            环境
          </a>
          <a href="#audit">
            <History size={17} />
            审计
          </a>
          <a href="#settings">
            <Settings size={17} />
            设置
          </a>
          <a
            href="#license"
            onClick={(event) => {
              event.preventDefault();
              setActiveTab('license');
            }}
          >
            <KeyRound size={17} />
            授权
          </a>
        </nav>
        <div className="policy-note">
          <ShieldCheck size={17} />
          <span>仅做可解释的隐私归一化与合规审计。</span>
        </div>
      </aside>

      <section className="profile-list" id="profiles">
        <header className="topbar">
          <div>
            <p className="section-kicker">本地工作台</p>
            <h2>浏览器环境</h2>
          </div>
          <button className="primary-button" type="button" onClick={handleNewProfile}>
            <FolderPlus size={17} />
            新建环境
          </button>
        </header>

        <section className={`license-banner ${license?.status ?? 'inactive'}`} id="license">
          <div>
            <div className="license-banner-title">
              <BadgeCheck size={16} />
              {license ? licenseStatusText[license.status] : '未激活'}
              {license?.teamName ? ` · ${license.teamName}` : ''}
            </div>
            <p>
              {license?.status === 'inactive'
                ? '输入人工销售发放的激活码后即可创建浏览器环境。'
                : `${license?.plan.name ?? '试卖套餐'} · 环境 ${usage?.profilesUsed ?? 0}/${usage?.profileLimit ?? 0} · 席位 ${
                    usage?.seatsUsed ?? 0
                  }/${usage?.seatLimit ?? 0} · 剩余 ${license?.daysRemaining ?? 0} 天`}
            </p>
          </div>
          <div className="usage-meter" aria-label="环境用量">
            <span style={{ width: `${licenseUsagePercent}%` }} />
          </div>
          {license?.status === 'inactive' || license?.status === 'expired' ? (
            <button type="button" className="secondary-button" onClick={() => setActiveTab('license')}>
              <KeyRound size={16} />
              激活许可证
            </button>
          ) : null}
        </section>

        <div className="search-row">
          <Search size={16} />
          <input
            aria-label="搜索环境"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、标签、代理或状态"
          />
        </div>

        <div className="table-header">
          <span>环境</span>
          <span>状态</span>
          <span>代理</span>
          <span>Chromium</span>
        </div>

        <div className="profile-rows" role="list" aria-label="环境列表">
          {filteredProfiles.map((profile) => (
            <button
              className={`profile-row ${profile.id === selectedId ? 'selected' : ''}`}
              key={profile.id}
              onClick={() => {
                setSelectedId(profile.id);
                setActiveTab('config');
              }}
              type="button"
            >
              <span className="profile-name-cell">
                <strong>{profile.name}</strong>
                <small>{profile.tags.length > 0 ? profile.tags.join(' / ') : '未设置标签'}</small>
              </span>
              <span className={`status-pill ${statusTone[profile.status]}`}>
                <Circle size={9} fill="currentColor" />
                {statusText[profile.status]}
              </span>
              <span>{profile.proxy ? `${profile.proxy.scheme}://${profile.proxy.host}:${profile.proxy.port}` : '未配置'}</span>
              <span>{profile.chromiumVersion}</span>
            </button>
          ))}
          {filteredProfiles.length === 0 ? (
            <div className="empty-state">
              <Activity size={18} />
              <span>暂无环境，点击“新建环境”开始。</span>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="details-drawer">
        <div className="drawer-header">
          <div>
            <p className="section-kicker">详情抽屉</p>
            <h2>{draft.id ? draft.name : '新建环境'}</h2>
          </div>
          <div className="drawer-actions">
            <button type="button" className="icon-button" onClick={handleEnsureChromium} title="检查 Chromium">
              <RefreshCw size={16} />
            </button>
            <button type="button" className="secondary-button" onClick={handleStop} disabled={!selectedProfile || busy}>
              <Power size={16} />
              关闭环境
            </button>
            <button type="button" className="primary-button" onClick={handleLaunch} disabled={!selectedProfile || busy}>
              <Play size={16} />
              启动 Chromium
            </button>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="详情切换">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => setActiveTab('config')}
          >
            配置
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audit'}
            className={activeTab === 'audit' ? 'active' : ''}
            onClick={() => setActiveTab('audit')}
          >
            审计
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'license'}
            className={activeTab === 'license' ? 'active' : ''}
            onClick={() => setActiveTab('license')}
          >
            授权
          </button>
        </div>

        {activeTab === 'config' ? (
          <form className="detail-form" onSubmit={(event) => event.preventDefault()}>
            <section className="form-section">
              <div className="form-title">
                <SlidersHorizontal size={17} />
                基础信息
              </div>
              <label>
                环境名称
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                标签
                <input
                  value={draft.tags}
                  onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  placeholder="合规,华东,测试"
                />
              </label>
            </section>

            <section className="form-section">
              <div className="form-title">
                <Wifi size={17} />
                代理配置
              </div>
              <div className="inline-grid">
                <label>
                  代理协议
                  <select
                    value={draft.proxyScheme}
                    onChange={(event) => setDraft({ ...draft, proxyScheme: event.target.value as ProxyScheme })}
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <label>
                  代理端口
                  <input
                    inputMode="numeric"
                    value={draft.proxyPort}
                    onChange={(event) => setDraft({ ...draft, proxyPort: event.target.value })}
                  />
                </label>
              </div>
              <label>
                代理主机
                <input value={draft.proxyHost} onChange={(event) => setDraft({ ...draft, proxyHost: event.target.value })} />
              </label>
              <div className="inline-grid">
                <label>
                  代理账号
                  <input
                    value={draft.proxyUsername}
                    onChange={(event) => setDraft({ ...draft, proxyUsername: event.target.value })}
                  />
                </label>
                <label>
                  代理密码
                  <input
                    type="password"
                    value={draft.proxyPassword}
                    onChange={(event) => setDraft({ ...draft, proxyPassword: event.target.value })}
                    placeholder={draft.id ? '留空则不修改' : ''}
                  />
                </label>
              </div>
              <label>
                代理绕过列表
                <input
                  value={draft.proxyBypassList}
                  onChange={(event) => setDraft({ ...draft, proxyBypassList: event.target.value })}
                />
              </label>
              <button className="secondary-button wide" type="button" onClick={handleProxyTest} disabled={busy}>
                <CheckCircle2 size={16} />
                测试代理
              </button>
            </section>

            <section className="form-section">
              <div className="form-title">
                <ShieldCheck size={17} />
                隐私归一化
              </div>
              <div className="inline-grid">
                <label>
                  语言
                  <input
                    value={draft.fingerprintPolicy.locale}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: { ...draft.fingerprintPolicy, locale: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  时区
                  <input
                    value={draft.fingerprintPolicy.timezone}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: { ...draft.fingerprintPolicy, timezone: event.target.value }
                      })
                    }
                  />
                </label>
              </div>
              <div className="inline-grid">
                <label>
                  窗口宽度
                  <input
                    inputMode="numeric"
                    value={draft.fingerprintPolicy.windowSize.width}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: {
                          ...draft.fingerprintPolicy,
                          windowSize: {
                            ...draft.fingerprintPolicy.windowSize,
                            width: Number(event.target.value)
                          }
                        }
                      })
                    }
                  />
                </label>
                <label>
                  窗口高度
                  <input
                    inputMode="numeric"
                    value={draft.fingerprintPolicy.windowSize.height}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        fingerprintPolicy: {
                          ...draft.fingerprintPolicy,
                          windowSize: {
                            ...draft.fingerprintPolicy.windowSize,
                            height: Number(event.target.value)
                          }
                        }
                      })
                    }
                  />
                </label>
              </div>
              <div className="policy-grid">
                <span>权限默认：拒绝提示</span>
                <span>WebRTC：禁用非代理 UDP</span>
                <span>Canvas/WebGL：不做随机噪声</span>
              </div>
            </section>

            <button className="primary-button wide save-button" type="button" onClick={handleSave} disabled={busy}>
              <Save size={16} />
              保存环境
            </button>
          </form>
        ) : activeTab === 'audit' ? (
          <section className="audit-list" id="audit">
            <div className="ops-row">
              <button className="secondary-button" type="button" onClick={handleAuditExport} disabled={busy}>
                <Download size={16} />
                导出审计
              </button>
              <button className="secondary-button" type="button" onClick={handleProfilesExport} disabled={busy}>
                <PackageCheck size={16} />
                导出配置
              </button>
            </div>
            {audits.map((event) => (
              <article className="audit-row" key={event.id}>
                <Clock3 size={15} />
                <div>
                  <strong>{event.action}</strong>
                  <p>{actionLabel[event.action] ?? event.action}</p>
                </div>
                <time>{formatDate(event.createdAt)}</time>
              </article>
            ))}
            {audits.length === 0 ? <div className="empty-state">暂无审计日志</div> : null}
          </section>
        ) : (
          <section className="audit-list license-panel">
            <div className="form-section">
              <div className="form-title">
                <KeyRound size={17} />
                授权中心
              </div>
              <div className={`license-status-card ${license?.status ?? 'inactive'}`}>
                <strong>{license ? licenseStatusText[license.status] : '未激活'}</strong>
                <span>{license?.teamName || '尚未绑定团队'}</span>
                <small>设备码：{license?.deviceId ?? '加载中'}</small>
              </div>
              <div className="inline-grid">
                <label>
                  套餐
                  <input value={license?.plan.name ?? '试用版'} readOnly />
                </label>
                <label>
                  到期时间
                  <input value={license?.expiresAt ? formatDate(license.expiresAt) : '未激活'} readOnly />
                </label>
              </div>
              <div className="usage-block">
                <span>环境用量 {usage?.profilesUsed ?? 0}/{usage?.profileLimit ?? 0}</span>
                <div className="usage-meter">
                  <span style={{ width: `${licenseUsagePercent}%` }} />
                </div>
                <span>席位用量 {usage?.seatsUsed ?? 0}/{usage?.seatLimit ?? 0}</span>
              </div>
              <label>
                激活码
                <input
                  aria-label="激活码"
                  value={activationCode}
                  onChange={(event) => setActivationCode(event.target.value)}
                  placeholder="粘贴人工销售发放的激活码"
                />
              </label>
              <div className="ops-row">
                <button className="primary-button" type="button" onClick={handleActivateLicense} disabled={busy || !activationCode}>
                  <BadgeCheck size={16} />
                  激活许可证
                </button>
                <button className="secondary-button" type="button" onClick={handleRefreshLicense} disabled={busy}>
                  <RefreshCw size={16} />
                  刷新状态
                </button>
                <button className="secondary-button" type="button" onClick={handleDeactivateLicense} disabled={busy}>
                  <Power size={16} />
                  解绑设备
                </button>
              </div>
            </div>

            <div className="form-section">
              <div className="form-title">
                <PackageCheck size={17} />
                运营工具
              </div>
              <button className="secondary-button wide" type="button" onClick={handleBatchProxyTest} disabled={busy}>
                <Wifi size={16} />
                批量检测代理
              </button>
              <button className="secondary-button wide" type="button" onClick={handlePackageLogs} disabled={busy}>
                <Download size={16} />
                打包支持日志
              </button>
              <a className="sales-link" href="mailto:sales@fingerbrowser.local?subject=指纹浏览器试卖咨询">
                <Mail size={16} />
                联系销售获取试卖激活码
              </a>
            </div>
          </section>
        )}

        <footer className="notice-bar" aria-live="polite">
          {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
          {notice}
        </footer>
      </aside>
    </main>
  );
}
