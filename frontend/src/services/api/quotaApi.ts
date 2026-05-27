import api from './client';

export interface QuotaSummary {
  planId: string;
  status: 'active' | 'quota_exceeded' | 'expired' | 'suspended';
  creditsUsed: number;
  creditsTotal: number;
  creditsRemaining: number;
  periodStart: string;
  periodEnd: string | null;
  usage30d: {
    tokenTotal: number;
    creditsCharged: number;
  };
}

export async function getQuotaSummary(): Promise<QuotaSummary> {
  const { data } = await api.get<{ status: string; data: QuotaSummary }>('/quota');
  return data.data;
}
