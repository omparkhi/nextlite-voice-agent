export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] animate-pulse">
      <div className="h-11 bg-[#fafafa] border-b border-[#f0efed] flex items-center px-6 gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-[#e7e5e4] rounded flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[#f0efed]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-14 flex items-center px-6 gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="h-3.5 bg-[#f0efed] rounded"
                style={{ width: `${Math.max(40, (100 - (c * 15 + (r % 3) * 10)))}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="el-card p-6 bg-white space-y-4">
          <div className="h-3 bg-[#e7e5e4] rounded w-1/3" />
          <div className="h-8 bg-[#f0efed] rounded w-1/2" />
          <div className="h-3 bg-[#fafafa] rounded w-2/3 pt-2 border-t border-[#f0efed]" />
        </div>
      ))}
    </div>
  );
}
