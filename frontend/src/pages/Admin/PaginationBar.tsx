interface PaginationBarProps {
  count: number;
  limit: number;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function PaginationBar({ count, limit, offset, onPrev, onNext, className = '' }: PaginationBarProps) {
  const start = count === 0 ? 0 : offset + 1;
  const end = count === 0 ? 0 : Math.min(offset + limit, count);
  const label = count === 0 ? '0 of 0' : `${start}-${end} of ${count}`;

  return (
    <div className={`flex items-center justify-between text-xs text-slate-500 ${className}`}>
      <span>{label}</span>
      <div className="flex gap-2">
        <button
          disabled={offset === 0}
          onClick={onPrev}
          className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          Prev
        </button>
        <button
          disabled={offset + limit >= count}
          onClick={onNext}
          className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
