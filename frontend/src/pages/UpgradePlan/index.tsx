import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuotaStore } from '@/store/useQuotaStore';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '0đ',
    credits: 50,
    tokens: '50,000',
    features: [
      '50 credits / tháng (~50,000 tokens)',
      'Tối đa 3 projects',
      'Tối đa 3 thành viên / project',
      'Lịch sử task 30 ngày gần nhất',
      'Đầy đủ Agent 1, 2, 3',
    ],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '199,000đ / tháng',
    credits: 1000,
    tokens: '1,000,000',
    features: [
      '1,000 credits / tháng (~1,000,000 tokens)',
      'Không giới hạn projects',
      'Tối đa 20 thành viên / project',
      'Lịch sử task không giới hạn',
      'Đầy đủ Agent 1, 2, 3',
      'Hỗ trợ ưu tiên qua email',
    ],
    highlight: true,
  },
];

export const UpgradePlanPage: React.FC = () => {
  const navigate = useNavigate();
  const { summary } = useQuotaStore();
  const [showPayment, setShowPayment] = React.useState(false);

  return (
    <div className="min-h-full bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-14 flex items-center px-6 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Quay lại
        </button>
        <span className="ml-4 text-sm font-bold font-headline text-on-surface">Nâng cấp plan</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
        {/* Current status */}
        {summary && (
          <div className="mb-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">toll</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-on-surface-variant font-label">Plan hiện tại</p>
              <p className="text-sm font-bold text-on-surface capitalize">{summary.planId}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-on-surface-variant font-label">Credits còn lại</p>
              <p className={`text-sm font-bold ${summary.creditsRemaining <= 0 ? 'text-error' : 'text-on-surface'}`}>
                {summary.creditsRemaining} / {summary.creditsTotal}
              </p>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {PLANS.map((plan) => {
            const isCurrent = summary?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-5 flex flex-col gap-3 ${
                  plan.highlight
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 bg-surface-container-low'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-on-primary uppercase tracking-wider">
                    Khuyến nghị
                  </span>
                )}
                <div>
                  <p className="text-base font-bold font-headline text-on-surface">{plan.name}</p>
                  <p className="text-lg font-bold text-primary mt-0.5">{plan.price}</p>
                </div>
                <div className="rounded-xl bg-surface-container px-3 py-2 text-xs">
                  <span className="font-bold text-on-surface">{plan.credits} credits</span>
                  <span className="text-on-surface-variant"> / tháng ({plan.tokens} tokens)</span>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] text-primary">check_circle</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <span className="mt-auto rounded-xl border border-outline-variant/30 py-2 text-center text-xs font-bold text-on-surface-variant">
                    Plan hiện tại
                  </span>
                ) : plan.id === 'pro' ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="mt-auto rounded-xl bg-primary py-2 text-xs font-bold text-on-primary hover:opacity-90 transition-opacity"
                  >
                    Nâng cấp lên Pro
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Payment instructions */}
        {showPayment && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">payment</span>
              <p className="text-sm font-bold text-on-surface">Hướng dẫn thanh toán</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* QR placeholder */}
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col items-center gap-2">
                <div className="w-32 h-32 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[48px] text-on-surface-variant/40">qr_code_2</span>
                </div>
                <p className="text-[11px] text-on-surface-variant text-center">QR MOMO — cập nhật sau</p>
              </div>
              {/* Instructions */}
              <div className="space-y-2 text-xs text-on-surface-variant">
                <p className="font-bold text-on-surface">Các bước thực hiện:</p>
                <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                  <li>Mở app MoMo và quét mã QR bên cạnh</li>
                  <li>Nhập số tiền <span className="font-bold text-on-surface">199,000đ</span></li>
                  <li>Ghi nội dung: <span className="font-bold text-on-surface">UPGRADE [email của bạn]</span></li>
                  <li>Xác nhận thanh toán</li>
                </ol>
                <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
                  <p className="font-bold text-on-surface mb-1">Sau khi thanh toán:</p>
                  <p className="leading-relaxed">Admin sẽ kích hoạt plan Pro trong vòng <span className="font-bold">24 giờ</span>. Bạn sẽ nhận được thông báo khi plan được kích hoạt.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
