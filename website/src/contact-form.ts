export interface ContactFormState {
  name: string;
  company: string;
  contact: string;
  scenario: string;
}

export type ContactFormErrors = Partial<Record<keyof ContactFormState, string>>;

export interface ContactFormValidationResult {
  valid: boolean;
  errors: ContactFormErrors;
}

export function contactFormDefaults(): ContactFormState {
  return {
    name: '',
    company: '',
    contact: '',
    scenario: ''
  };
}

export function validateContactForm(input: ContactFormState): ContactFormValidationResult {
  const errors: ContactFormErrors = {};

  if (!input.name.trim()) {
    errors.name = '请填写联系人';
  }
  if (!input.company.trim()) {
    errors.company = '请填写公司名称';
  }
  if (!input.contact.trim()) {
    errors.contact = '请填写手机号或邮箱';
  }
  if (!input.scenario.trim()) {
    errors.scenario = '请填写希望管理的浏览器环境规模或试用场景';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
