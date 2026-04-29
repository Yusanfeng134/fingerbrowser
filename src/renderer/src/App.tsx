import {
  Activity,
  CheckCircle2,
  Circle,
  Clock3,
  FolderPlus,
  Globe2,
  History,
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
  UpdateProfileInput
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

type ActiveTab = 'config' | 'audit';

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
  ERROR_RECORDED: '记录错误'
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

  useEffect(() => {
    void loadProfiles().catch((error) => setNotice(error instanceof Error ? error.message : '加载环境失败'));
  }, [loadProfiles]);

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
        ) : (
          <section className="audit-list" id="audit">
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
        )}

        <footer className="notice-bar" aria-live="polite">
          {busy ? <RefreshCw className="spin" size={15} /> : <CheckCircle2 size={15} />}
          {notice}
        </footer>
      </aside>
    </main>
  );
}
