import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileKey2,
  Fingerprint,
  KeyRound,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound
} from 'lucide-react';

export interface NavigationItem {
  title: string;
  href: string;
}

export interface SitePage {
  title: string;
  href: string;
  description: string;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface PricingPlan {
  name: string;
  seats: string;
  profiles: string;
  price: string;
  bestFor: string;
  features: string[];
}

export interface SolutionItem {
  title: string;
  description: string;
  points: string[];
}

export interface DocsItem {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { title: '首页', href: '/' },
  { title: '产品能力', href: '/product' },
  { title: '解决方案', href: '/solutions' },
  { title: '价格与试用', href: '/pricing' },
  { title: '文档与对接', href: '/docs' },
  { title: '联系销售', href: '/contact' }
];

export const sitePages: SitePage[] = [
  {
    title: '首页',
    href: '/',
    description: 'FingerBrowser 指纹浏览器，为合规运营团队管理本地浏览器环境、代理配置、审计和试用交付。'
  },
  {
    title: '产品能力',
    href: '/product',
    description: '本地加密、独立 Chromium profile、隐私归一化、代理健康检查、审计导出和内核运行通道。'
  },
  {
    title: '解决方案',
    href: '/solutions',
    description: '面向试卖交付、运营团队环境资产管理、客户支持排障和内核交付验收。'
  },
  {
    title: '价格与试用',
    href: '/pricing',
    description: '展示试用版、专业版、团队版的席位和环境数边界，价格由销售根据交付配置确认。'
  },
  {
    title: '文档与对接',
    href: '/docs',
    description: '集中说明 Local API、MCP、本地支持日志、反馈包、试卖包和版本发布流程。'
  },
  {
    title: '联系销售',
    href: '/contact',
    description: '预约演示，评估团队规模、环境数量、支持方式和试卖交付节奏。'
  }
];

export const productFeatures: FeatureItem[] = [
  {
    title: '本地优先的数据边界',
    description: '浏览器 profile、Cookie、缓存和代理密码留在客户设备，敏感字段通过 macOS Keychain 能力加密保存。',
    icon: LockKeyhole
  },
  {
    title: '独立环境资产管理',
    description: '每个环境拥有独立 userDataDir，保留登录态、缓存和运行状态，适合团队统一管理运营环境。',
    icon: Layers3
  },
  {
    title: '稳定隐私归一化',
    description: '语言、时区、窗口尺寸、权限默认值和 WebRTC 策略保持可解释、可审计的一致性配置。',
    icon: Fingerprint
  },
  {
    title: '代理配置与健康检查',
    description: '支持基础代理配置、批量检测、出口信息记录和本地代理运行状态观察。',
    icon: Network
  },
  {
    title: '审计与支持闭环',
    description: '记录启动、关闭、代理测试、授权、导出等关键操作，支持反馈包和支持日志打包。',
    icon: ClipboardCheck
  },
  {
    title: 'Local API 与 MCP',
    description: '为受控内部工具提供 localhost-only 集成面，外部 MCP 客户端可调用脱敏后的合规能力。',
    icon: FileKey2
  }
];

export const solutionItems: SolutionItem[] = [
  {
    title: '试卖与 POC 交付',
    description: '销售团队可通过激活码、套餐限制和反馈包完成 7 到 30 天试卖闭环。',
    points: ['激活码交付', '试卖清单', '反馈包导出']
  },
  {
    title: '运营环境资产管理',
    description: '团队统一管理浏览器环境、代理状态、环境归属、标签和审计记录。',
    points: ['环境列表', '代理健康', '审计导出']
  },
  {
    title: '客户支持排障',
    description: '支持日志和脱敏反馈包帮助定位本地安装、代理、授权和内核交付问题。',
    points: ['支持日志打包', '敏感字段脱敏', '版本检查']
  }
];

export const pricingPlans: PricingPlan[] = [
  {
    name: '试用版',
    seats: '1 席',
    profiles: '5 个环境',
    price: '联系销售',
    bestFor: '7 天试用、演示和 POC',
    features: ['本地环境管理', '基础代理配置', '审计导出', '反馈包']
  },
  {
    name: '专业版',
    seats: '1 席',
    profiles: '50 个环境',
    price: '联系销售',
    bestFor: '单人运营或小规模合规环境管理',
    features: ['更高环境上限', '批量代理检测', '密码库工作台', '版本检查']
  },
  {
    name: '团队版',
    seats: '3 席',
    profiles: '200 个环境',
    price: '联系销售',
    bestFor: '小团队资产管理、审计和支持协作',
    features: ['团队席位', '支持日志打包', 'MCP/Local API 对接', '试卖交付支持']
  }
];

export const docsItems: DocsItem[] = [
  {
    title: 'Local API',
    description: 'localhost-only 的受控集成面，提供状态、环境、启动、停止、代理状态和脱敏审计。',
    href: '/docs#local-api',
    icon: Database
  },
  {
    title: 'MCP 对接',
    description: 'stdio MCP 服务将外部客户端连接到已鉴权的 Local API，不暴露敏感字段。',
    href: '/docs#mcp',
    icon: BookOpen
  },
  {
    title: '支持日志',
    description: '客户可本地打包支持日志和反馈包，导出内容屏蔽 token、密码和密钥字段。',
    href: '/docs#support',
    icon: LifeBuoy
  },
  {
    title: '试卖发布',
    description: 'macOS 试卖包、checksums、release notes 和手动版本检查组成交付流程。',
    href: '/docs#release',
    icon: Archive
  }
];

export const trustStats = [
  { value: '127.0.0.1', label: 'Local API 默认绑定' },
  { value: '3/200', label: '团队版席位与环境上限' },
  { value: 'macOS', label: '首发桌面平台' },
  { value: '0', label: '自动上传客户数据' }
];

export const compliancePrinciples = [
  {
    title: '合规边界写进产品',
    description: 'FingerBrowser 聚焦环境管理、隐私归一化和审计，不提供违反平台规则的自动化或凭证滥用能力。',
    icon: ShieldCheck
  },
  {
    title: '交付规模可控',
    description: '试用版、专业版、团队版通过席位和环境数限制控制试卖规模，便于销售和客户共同验收。',
    icon: UsersRound
  },
  {
    title: '操作过程可追踪',
    description: '环境启动、关闭、代理检测、授权变更和导出动作进入本地审计记录。',
    icon: Activity
  },
  {
    title: '策略可解释',
    description: '语言、时区、窗口、权限和 WebRTC 策略使用稳定配置，方便客户理解和审查。',
    icon: SlidersHorizontal
  },
  {
    title: '敏感字段脱敏',
    description: '导出、反馈包和支持日志会屏蔽 token、密码、密钥和 Cookie/cache 相关内容。',
    icon: KeyRound
  },
  {
    title: '上线前可验收',
    description: '通过演示、激活码、试卖清单和反馈包，帮助客户在正式采购前完成本地验证。',
    icon: CheckCircle2
  }
];
