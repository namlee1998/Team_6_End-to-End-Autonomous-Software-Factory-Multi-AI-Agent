import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { NotFoundPage } from '../index';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderNotFound(initialEntries = ['/missing']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NotFoundPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as Mock).mockReturnValue({ session: null });
  });

  it('renders the 404 content', () => {
    renderNotFound();

    expect(screen.getByText('404 - Page not found')).toBeInTheDocument();
    expect(screen.getByText('This route is off the map')).toBeInTheDocument();
  });

  it('sends signed-out users to auth from the primary action', () => {
    renderNotFound();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/auth');
  });

  it('sends signed-in users to the app from the primary action', () => {
    (useAuthStore as unknown as Mock).mockReturnValue({ session: { access_token: 'token' } });
    renderNotFound();

    fireEvent.click(screen.getByRole('button', { name: /go to app/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/app');
  });

  it('offers a secondary route back to the public home page', () => {
    renderNotFound();

    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
