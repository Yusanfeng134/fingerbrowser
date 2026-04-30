export interface TimezoneOption {
  value: string;
  label: string;
  region: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'UTC', label: 'UTC', region: '通用' },
  { value: 'Asia/Shanghai', label: '上海 / 北京', region: '亚洲' },
  { value: 'Asia/Hong_Kong', label: '香港', region: '亚洲' },
  { value: 'Asia/Taipei', label: '台北', region: '亚洲' },
  { value: 'Asia/Tokyo', label: '东京', region: '亚洲' },
  { value: 'Asia/Seoul', label: '首尔', region: '亚洲' },
  { value: 'Asia/Singapore', label: '新加坡', region: '亚洲' },
  { value: 'Asia/Bangkok', label: '曼谷', region: '亚洲' },
  { value: 'Asia/Jakarta', label: '雅加达', region: '亚洲' },
  { value: 'Asia/Dubai', label: '迪拜', region: '亚洲' },
  { value: 'Europe/London', label: '伦敦', region: '欧洲' },
  { value: 'Europe/Paris', label: '巴黎', region: '欧洲' },
  { value: 'Europe/Berlin', label: '柏林', region: '欧洲' },
  { value: 'Europe/Moscow', label: '莫斯科', region: '欧洲' },
  { value: 'America/New_York', label: '纽约', region: '美洲' },
  { value: 'America/Chicago', label: '芝加哥', region: '美洲' },
  { value: 'America/Denver', label: '丹佛', region: '美洲' },
  { value: 'America/Los_Angeles', label: '洛杉矶', region: '美洲' },
  { value: 'America/Toronto', label: '多伦多', region: '美洲' },
  { value: 'America/Sao_Paulo', label: '圣保罗', region: '美洲' },
  { value: 'Australia/Sydney', label: '悉尼', region: '大洋洲' },
  { value: 'Pacific/Auckland', label: '奥克兰', region: '大洋洲' }
];

export const TIMEZONE_OPTION_GROUPS: Array<{ region: string; options: TimezoneOption[] }> = [
  '通用',
  '亚洲',
  '欧洲',
  '美洲',
  '大洋洲'
].map((region) => ({
  region,
  options: TIMEZONE_OPTIONS.filter((option) => option.region === region)
}));

export function normalizeTimezone(timezone: string): string {
  const candidate = timezone.trim();
  if (!candidate) {
    throw new Error('时区无效');
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`时区无效：${timezone}`);
  }
}
