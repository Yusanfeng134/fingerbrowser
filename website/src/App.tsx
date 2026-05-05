import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Globe2,
  Mail,
  Menu,
  MonitorCheck,
  Server,
  ShieldCheck,
  X
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { contactFormDefaults, type ContactFormState, validateContactForm } from './contact-form';
import {
  compliancePrinciples,
  docsItems,
  navigationItems,
  pricingPlans,
  productFeatures,
  sitePages,
  solutionItems,
  trustStats
} from './site-content';

const pageDescriptions = new Map(sitePages.map((page) => [page.href, page.description]));

export function App(): JSX.Element {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handlePopState = (): void => setPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (href: string): void => {
    const nextPath = normalizePath(href);
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const page = useMemo(() => renderPage(path, navigate), [path]);

  return (
    <div className="site-shell">
      <Header currentPath={path} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((open) => !open)} onNavigate={navigate} />
      <main>{page}</main>
      <Footer onNavigate={navigate} />
    </div>
  );
}

interface HeaderProps {
  currentPath: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onNavigate: (href: string) => void;
}

function Header({ currentPath, menuOpen, onMenuToggle, onNavigate }: HeaderProps): JSX.Element {
  return (
    <header className="site-header">
      <button className="brand-link" type="button" onClick={() => onNavigate('/')} aria-label="返回首页">
        <span className="brand-mark">FB</span>
        <span>
          <strong>FingerBrowser</strong>
          <small>指纹浏览器</small>
        </span>
      </button>
      <nav className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="官网导航">
        {navigationItems.map((item) => (
          <button
            key={item.href}
            type="button"
            className={currentPath === item.href ? 'nav-link active' : 'nav-link'}
            onClick={() => onNavigate(item.href)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button className="ghost-button desktop-only" type="button" onClick={() => onNavigate('/docs')}>
          对接文档
        </button>
        <button className="primary-button compact" type="button" onClick={() => onNavigate('/contact')}>
          预约演示
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button className="menu-button" type="button" onClick={onMenuToggle} aria-label="打开导航菜单">
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

function HomePage({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <h1>FingerBrowser 指纹浏览器</h1>
          <p className="hero-lead">
            面向合规运营团队的本地桌面端，统一管理隔离 Chromium 环境、代理配置、隐私归一化策略和本地审计日志。
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate('/contact')}>
              预约演示
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate('/product')}>
              查看产品能力
            </button>
          </div>
          <div className="hero-proof">
            <span>本地加密</span>
            <span>独立 profile</span>
            <span>审计导出</span>
            <span>MCP 对接</span>
          </div>
        </div>
        <ConsolePreview />
      </section>
      <section className="trust-strip" aria-label="关键可信信息">
        {trustStats.map((stat) => (
          <div key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>
      <section className="section-band">
        <SectionIntro
          title="把浏览器环境变成可管理的企业资产"
          description="从环境创建、代理检测、密码库到审计导出，FingerBrowser 将桌面端工作流收束到可解释、可支持、可验收的本地系统。"
        />
        <FeatureGrid items={productFeatures.slice(0, 3)} />
      </section>
      <section className="section-band muted">
        <SectionIntro
          title="每一次试卖都有交付闭环"
          description="激活码、套餐上限、反馈包、支持日志和版本检查，让销售团队与客户在同一套本地事实上完成验收。"
        />
        <ProcessRail />
      </section>
      <CallToAction onNavigate={onNavigate} />
    </>
  );
}

function ProductPage({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <>
      <PageHero
        title="产品能力"
        description={pageDescriptions.get('/product') ?? ''}
        actionLabel="预约产品演示"
        onAction={() => onNavigate('/contact')}
      />
      <section className="section-band">
        <FeatureGrid items={productFeatures} />
      </section>
      <section className="split-section">
        <div>
          <h2>从桌面端到受控对接</h2>
          <p>
            主进程负责持久化、加密、浏览器启动和导出，Renderer 只通过白名单 IPC 访问能力。外部工具通过 Local API 和 MCP 获取脱敏结果。
          </p>
          <button className="secondary-button" type="button" onClick={() => onNavigate('/docs')}>
            查看对接方式
          </button>
        </div>
        <ArchitecturePanel />
      </section>
    </>
  );
}

function SolutionsPage({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <>
      <PageHero
        title="解决方案"
        description={pageDescriptions.get('/solutions') ?? ''}
        actionLabel="讨论团队场景"
        onAction={() => onNavigate('/contact')}
      />
      <section className="section-band">
        <div className="solution-list">
          {solutionItems.map((item) => (
            <article className="solution-item" key={item.title}>
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>
                    <Check size={16} aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="section-band muted">
        <SectionIntro title="合规边界默认清晰" description="官网和产品说明都只围绕环境资产管理、审计和受控集成，不夸大第三方平台结果。" />
        <FeatureGrid items={compliancePrinciples} compact />
      </section>
      <CallToAction onNavigate={onNavigate} />
    </>
  );
}

function PricingPage({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <>
      <PageHero
        title="价格与试用"
        description={pageDescriptions.get('/pricing') ?? ''}
        actionLabel="获取试卖方案"
        onAction={() => onNavigate('/contact')}
      />
      <section className="pricing-grid">
        {pricingPlans.map((plan, index) => (
          <article className={index === 2 ? 'pricing-card featured' : 'pricing-card'} key={plan.name}>
            <div>
              <h2>{plan.name}</h2>
              <p>{plan.bestFor}</p>
              <strong>{plan.price}</strong>
            </div>
            <dl>
              <div>
                <dt>席位</dt>
                <dd>{plan.seats}</dd>
              </div>
              <div>
                <dt>环境数</dt>
                <dd>{plan.profiles}</dd>
              </div>
            </dl>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <button className={index === 2 ? 'primary-button full' : 'secondary-button full'} type="button" onClick={() => onNavigate('/contact')}>
              联系销售
            </button>
          </article>
        ))}
      </section>
      <section className="section-band muted">
        <SectionIntro title="试卖交付方式" description="试卖阶段使用激活码交付。正式销售前由双方确认席位、环境数、支持周期和内核通道需求。" />
      </section>
    </>
  );
}

function DocsPage({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <>
      <PageHero
        title="文档与对接"
        description={pageDescriptions.get('/docs') ?? ''}
        actionLabel="预约技术对接"
        onAction={() => onNavigate('/contact')}
      />
      <section className="docs-grid">
        {docsItems.map((item) => {
          const Icon = item.icon;
          return (
            <article className="doc-card" id={item.href.split('#')[1]} key={item.title}>
              <Icon size={22} aria-hidden="true" />
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>
                查看说明
                <ChevronRight size={15} aria-hidden="true" />
              </span>
            </article>
          );
        })}
      </section>
      <section className="split-section muted">
        <div>
          <h2>受控外部调用</h2>
          <p>
            MCP stdio 服务复用 Local API Token，只暴露状态、脱敏环境摘要、启动/停止、代理状态和审计列表等合规能力。
          </p>
          <button className="secondary-button" type="button" onClick={() => onNavigate('/contact')}>
            申请对接评估
          </button>
        </div>
        <CodeBlock />
      </section>
    </>
  );
}

function ContactPage(): JSX.Element {
  return (
    <>
      <PageHero title="联系销售" description={pageDescriptions.get('/contact') ?? ''} />
      <section className="contact-layout">
        <div className="contact-copy">
          <h2>预约一次 30 分钟产品演示</h2>
          <p>我们会根据团队规模、环境数量、代理检测、审计导出和试卖周期，给出适合的本地交付建议。</p>
          <div className="contact-notes">
            <span>
              <Clock3 size={18} aria-hidden="true" />
              工作日响应
            </span>
            <span>
              <ShieldCheck size={18} aria-hidden="true" />
              不收集本地 profile 数据
            </span>
            <span>
              <Mail size={18} aria-hidden="true" />
              表单第一版为静态占位
            </span>
          </div>
        </div>
        <ContactForm />
      </section>
    </>
  );
}

function ContactForm(): JSX.Element {
  const [form, setForm] = useState<ContactFormState>(() => contactFormDefaults());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const update = (field: keyof ContactFormState, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = validateContactForm(form);
    setErrors(result.errors);
    if (result.valid) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="success-panel" role="status">
        <Check size={28} aria-hidden="true" />
        <h2>预约信息已记录</h2>
        <p>第一版官网会在前端展示成功状态，后续可接入 CRM、表单服务或销售工作流。</p>
        <button className="secondary-button" type="button" onClick={() => setSubmitted(false)}>
          继续编辑
        </button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <label>
        联系人
        <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="陈经理" />
        {errors.name ? <small>{errors.name}</small> : null}
      </label>
      <label>
        公司名称
        <input value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="华东运营团队" />
        {errors.company ? <small>{errors.company}</small> : null}
      </label>
      <label>
        手机号或邮箱
        <input value={form.contact} onChange={(event) => update('contact', event.target.value)} placeholder="chen@example.com" />
        {errors.contact ? <small>{errors.contact}</small> : null}
      </label>
      <label>
        试用场景
        <textarea
          value={form.scenario}
          onChange={(event) => update('scenario', event.target.value)}
          placeholder="希望评估 50 个合规运营环境和审计导出"
          rows={5}
        />
        {errors.scenario ? <small>{errors.scenario}</small> : null}
      </label>
      <button className="primary-button full" type="submit">
        提交预约
      </button>
    </form>
  );
}

function ConsolePreview(): JSX.Element {
  return (
    <div className="console-preview" aria-label="FingerBrowser 产品控制台预览">
      <div className="console-sidebar">
        <div className="sidebar-brand">
          <span>FB</span>
          <strong>控制台</strong>
        </div>
        <span className="sidebar-item active">环境资产</span>
        <span className="sidebar-item">代理健康</span>
        <span className="sidebar-item">审计日志</span>
        <span className="sidebar-item">试卖交付</span>
      </div>
      <div className="console-main">
        <div className="console-topbar">
          <div>
            <strong>环境工作台</strong>
            <span>本地数据留存 · 运行状态可审计</span>
          </div>
          <span className="status-pill">Local API 127.0.0.1</span>
        </div>
        <div className="metric-row">
          <MetricCard label="环境总数" value="128" tone="blue" />
          <MetricCard label="代理通过" value="92%" tone="green" />
          <MetricCard label="审计事件" value="1,840" tone="slate" />
        </div>
        <div className="profile-table">
          {[
            ['客户 A 演示环境', 'official', '已关闭', 'Asia/Shanghai'],
            ['团队试卖环境 07', 'custom-kernel', '运行中', 'Asia/Singapore'],
            ['支持排障环境', 'official', '需关注', 'Asia/Tokyo']
          ].map(([name, channel, status, timezone]) => (
            <div className="profile-row" key={name}>
              <span>{name}</span>
              <span>{channel}</span>
              <span>{status}</span>
              <span>{timezone}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'slate' }): JSX.Element {
  return (
    <div className={`metric-card ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SectionIntro({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="section-intro">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function FeatureGrid({ items, compact = false }: { items: typeof productFeatures; compact?: boolean }): JSX.Element {
  return (
    <div className={compact ? 'feature-grid compact' : 'feature-grid'}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article className="feature-card" key={item.title}>
            <Icon size={22} aria-hidden="true" />
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </article>
        );
      })}
    </div>
  );
}

function ProcessRail(): JSX.Element {
  const steps = ['签发激活码', '客户本地安装', '创建演示环境', '检测代理健康', '导出反馈包'];
  return (
    <ol className="process-rail">
      {steps.map((step, index) => (
        <li key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  );
}

function PageHero({
  title,
  description,
  actionLabel,
  onAction
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  return (
    <section className="page-hero">
      <h1>{title}</h1>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button className="primary-button" type="button" onClick={onAction}>
          {actionLabel}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}

function ArchitecturePanel(): JSX.Element {
  const nodes = [
    { title: 'React Renderer', detail: '中文管理台 UI', icon: MonitorCheck },
    { title: 'Electron Main', detail: '加密、数据库、浏览器启动', icon: Server },
    { title: 'Local API / MCP', detail: '受控外部调用', icon: Globe2 },
    { title: 'Exports', detail: '审计、反馈、支持包', icon: Download }
  ];

  return (
    <div className="architecture-panel">
      {nodes.map(({ title, detail, icon: ArchitectureIcon }) => {
        return (
          <div className="architecture-node" key={title}>
            <ArchitectureIcon size={20} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function CodeBlock(): JSX.Element {
  return (
    <pre className="code-block">
      <code>{`FINGERBROWSER_LOCAL_API_TOKEN_FILE=/path/local-api.key \\
node out/main/mcp.js

tools:
fingerbrowser_status
fingerbrowser_list_profiles
fingerbrowser_launch_profile`}</code>
    </pre>
  );
}

function CallToAction({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <section className="cta-band">
      <div>
        <h2>让试卖、交付和审计回到同一套本地事实</h2>
        <p>预约演示，看看 FingerBrowser 如何贴合你的团队规模、代理配置和支持流程。</p>
      </div>
      <button className="primary-button" type="button" onClick={() => onNavigate('/contact')}>
        预约演示
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

function Footer({ onNavigate }: { onNavigate: (href: string) => void }): JSX.Element {
  return (
    <footer className="site-footer">
      <div>
        <strong>FingerBrowser 指纹浏览器</strong>
        <p>企业浏览器环境资产管理，本地优先，合规可审计。</p>
      </div>
      <div className="footer-links">
        {navigationItems.map((item) => (
          <button key={item.href} type="button" onClick={() => onNavigate(item.href)}>
            {item.title}
          </button>
        ))}
      </div>
      <p className="footer-note">© 2026 FingerBrowser. 试卖阶段价格与交付由销售确认。</p>
    </footer>
  );
}

function renderPage(path: string, onNavigate: (href: string) => void): JSX.Element {
  switch (path) {
    case '/product':
      return <ProductPage onNavigate={onNavigate} />;
    case '/solutions':
      return <SolutionsPage onNavigate={onNavigate} />;
    case '/pricing':
      return <PricingPage onNavigate={onNavigate} />;
    case '/docs':
      return <DocsPage onNavigate={onNavigate} />;
    case '/contact':
      return <ContactPage />;
    default:
      return <HomePage onNavigate={onNavigate} />;
  }
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+$/, '') || '/';
  return navigationItems.some((item) => item.href === normalized) ? normalized : '/';
}
