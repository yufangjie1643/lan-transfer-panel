import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBar } from './StatusBar';
import { messages } from '../../i18n/messages';

const labels = messages['zh-CN'].explorer.statusBar;

describe('StatusBar', () => {
  it('shows item and selection counts', () => {
    render(<StatusBar labels={labels} itemCount={10} selectedCount={2} />);
    expect(screen.getByText('10 个项目')).toBeInTheDocument();
    expect(screen.getByText('已选择 2 个')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<StatusBar labels={labels} itemCount={0} selectedCount={0} isLoading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('shows error', () => {
    render(<StatusBar labels={labels} itemCount={0} selectedCount={0} error="失败" />);
    expect(screen.getByText('失败')).toBeInTheDocument();
  });
});
