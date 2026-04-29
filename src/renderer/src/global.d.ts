import type { AppApi } from '../../shared/types';

declare global {
  interface Window {
    fingerBrowser: AppApi;
  }
}

export {};
