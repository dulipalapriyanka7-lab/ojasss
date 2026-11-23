import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, StatusBadge } from '@/components/ui/Feedback';
import { ApiError } from '@/api/client';
import { Inbox } from 'lucide-react';

describe('UI primitives', () => {
  it('icon buttons always have an accessible name', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Mute" onClick={onClick}><span aria-hidden>x</span></IconButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('error states explain the problem and offer recovery', async () => {
    const retry = vi.fn();
    render(<MemoryRouter><ErrorState error={new ApiError('network', 'NETWORK', 'You appear to be offline.')} onRetry={retry} /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it('session-expired errors lead to sign in', () => {
    render(<MemoryRouter><ErrorState error={new ApiError('session_expired', 'X', 'Your session has expired.')} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('empty states render title, description and actions', () => {
    render(<EmptyState icon={Inbox} title="No messages yet" description="Start a conversation" action={<button type="button">Find creators</button>} />);
    expect(screen.getByRole('heading', { name: 'No messages yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find creators' })).toBeInTheDocument();
  });

  it('status badges use readable labels', () => {
    render(<StatusBadge status="pending_review" />);
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });
});
