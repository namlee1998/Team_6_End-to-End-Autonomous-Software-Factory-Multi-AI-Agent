import { create } from 'zustand';
import { getQuotaSummary, type QuotaSummary } from '@/services/api';

interface QuotaState {
  summary: QuotaSummary | null;
  loading: boolean;
  // true when credits = 0 or status is quota_exceeded / suspended
  isBlocked: boolean;
  // true when ≥ 80% of credits used — show warning banner
  isNearLimit: boolean;
  fetch: () => Promise<void>;
  reset: () => void;
}

export const useQuotaStore = create<QuotaState>((set) => ({
  summary: null,
  loading: false,
  isBlocked: false,
  isNearLimit: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const data = await getQuotaSummary();
      const isBlocked =
        data.creditsRemaining <= 0 ||
        data.status === 'quota_exceeded' ||
        data.status === 'suspended';
      const usageRatio = data.creditsTotal > 0 ? data.creditsUsed / data.creditsTotal : 0;
      const isNearLimit = usageRatio >= 0.8;
      set({ summary: data, isBlocked, isNearLimit, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  reset: () => set({ summary: null, isBlocked: false, isNearLimit: false, loading: false }),
}));
