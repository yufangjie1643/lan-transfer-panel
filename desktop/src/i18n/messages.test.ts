import { describe, expect, it } from 'vitest';
import { defaultLocale, messages } from './messages';

describe('messages', () => {
  it('uses simplified Chinese as the default desktop locale', () => {
    expect(defaultLocale).toBe('zh-CN');
    expect(messages['zh-CN'].appTitle).toBe('局域网传输');
    expect(messages['zh-CN'].connection.connect).toBe('连接');
    expect(messages['zh-CN'].panes.local).toBe('本地文件');
    expect(messages['zh-CN'].queue.title).toBe('传输队列');
  });

  it('keeps English fallback strings available', () => {
    expect(messages['en-US'].connection.connect).toBe('Connect');
  });
});
