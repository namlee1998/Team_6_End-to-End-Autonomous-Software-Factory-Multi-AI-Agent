import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProfilePage } from '@/pages/Profile';

const mockNavigate = vi.fn();

const existingProfile = {
  user_id: 'user-1',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  age: 36,
  job_title: 'QA Lead',
  address: 'Da Nang',
  phone: '0900000000',
  bio: 'Builds test systems',
  avatar_url: '',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-02T00:00:00.000Z',
};

vi.mock('@/services/api', () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  uploadProfileAvatar: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('ProfilePage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    const api = await import('@/services/api');
    vi.mocked(api.getProfile).mockResolvedValue(existingProfile);
    vi.mocked(api.updateProfile).mockResolvedValue({
      ...existingProfile,
      full_name: 'Grace Hopper',
    });
    vi.mocked(api.createProfile).mockResolvedValue(existingProfile);
    vi.mocked(api.deleteProfile).mockResolvedValue(undefined);
    vi.mocked(api.uploadProfileAvatar).mockResolvedValue({
      ...existingProfile,
      avatar_url: 'https://cdn.example.com/avatar.png',
    });
  });

  test('loads an existing profile and saves edits with PATCH', async () => {
    const api = await import('@/services/api');
    render(<ProfilePage />);

    const nameInput = await screen.findByLabelText('Họ và tên');
    expect(nameInput).toHaveValue('Ada Lovelace');

    fireEvent.change(nameInput, { target: { value: 'Grace Hopper' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu hồ sơ/i }));

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Grace Hopper', age: 36 }),
      );
    });
    expect(await screen.findByText('Đã lưu thông tin hồ sơ.')).toBeInTheDocument();
  });

  test('requires danger confirmation before resetting extended profile data', async () => {
    const api = await import('@/services/api');
    vi.mocked(api.getProfile)
      .mockResolvedValueOnce(existingProfile)
      .mockResolvedValueOnce({
        ...existingProfile,
        full_name: null,
        age: null,
        job_title: null,
        address: null,
        phone: null,
        bio: null,
        avatar_url: null,
        created_at: null,
        updated_at: null,
      });

    render(<ProfilePage />);
    await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /xóa hồ sơ/i }));
    expect(api.deleteProfile).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Xóa thông tin hồ sơ?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/không xóa tài khoản đăng nhập/i),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /xóa hồ sơ/i }));

    await waitFor(() => {
      expect(api.deleteProfile).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Đã xóa thông tin hồ sơ mở rộng.')).toBeInTheDocument();
  });

  test('uploads avatar files instead of saving avatar URLs manually', async () => {
    const api = await import('@/services/api');
    render(<ProfilePage />);
    await screen.findByDisplayValue('Ada Lovelace');

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/upload avatar/i), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(api.uploadProfileAvatar).toHaveBeenCalledWith(file);
    });
    expect(screen.queryByLabelText('Avatar URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload avatar/i })).not.toBeInTheDocument();
  });

  test('offers a clear route back to the main workflow', async () => {
    render(<ProfilePage />);
    await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /về trang chính/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/app');
  });
});
