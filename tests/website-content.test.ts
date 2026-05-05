import { describe, expect, it } from 'vitest';
import { contactFormDefaults, validateContactForm } from '../website/src/contact-form';
import { navigationItems, pricingPlans, sitePages } from '../website/src/site-content';

const forbiddenMarketingTerms = ['自动养号', '风控绕过', '验证码绕过', '批量行为同步'];

describe('website content model', () => {
  it('defines the planned six-page Chinese enterprise site navigation', () => {
    expect(navigationItems.map((item) => item.href)).toEqual([
      '/',
      '/product',
      '/solutions',
      '/pricing',
      '/docs',
      '/contact'
    ]);
    expect(sitePages.map((page) => page.title)).toEqual([
      '首页',
      '产品能力',
      '解决方案',
      '价格与试用',
      '文档与对接',
      '联系销售'
    ]);
  });

  it('keeps pricing plan boundaries public without publishing prices', () => {
    expect(pricingPlans).toEqual([
      expect.objectContaining({ name: '试用版', seats: '1 席', profiles: '5 个环境', price: '联系销售' }),
      expect.objectContaining({ name: '专业版', seats: '1 席', profiles: '50 个环境', price: '联系销售' }),
      expect.objectContaining({ name: '团队版', seats: '3 席', profiles: '200 个环境', price: '联系销售' })
    ]);
  });

  it('does not ship prohibited circumvention claims in website copy', () => {
    const allCopy = JSON.stringify({ sitePages, pricingPlans });

    for (const term of forbiddenMarketingTerms) {
      expect(allCopy).not.toContain(term);
    }
  });

  it('validates required demo booking fields without sending data externally', () => {
    expect(validateContactForm(contactFormDefaults())).toEqual({
      valid: false,
      errors: {
        name: '请填写联系人',
        company: '请填写公司名称',
        contact: '请填写手机号或邮箱',
        scenario: '请填写希望管理的浏览器环境规模或试用场景'
      }
    });

    expect(
      validateContactForm({
        name: '陈经理',
        company: '华东运营团队',
        contact: 'chen@example.test',
        scenario: '希望评估 50 个合规运营环境和审计导出'
      })
    ).toEqual({ valid: true, errors: {} });
  });
});
