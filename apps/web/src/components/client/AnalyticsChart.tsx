import { useState } from 'react';

// ==========================================
// 1. Daily Trend Bar Chart
// ==========================================
export function TrendBarChart({
  data,
  title = 'Call Volume Trend',
  subtitle = 'Last 7 days call activity',
}: {
  data: Array<{ date: string; total: number; completed: number; missed: number; failed: number }>;
  title?: string;
  subtitle?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxTotal = Math.max(...data.map((d) => d.total), 5);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="el-card p-6 bg-white flex flex-col justify-between">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">{title}</h3>
          <p className="text-xs text-[#777169] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#777169]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#16a34a]" /> Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#d97706]" /> Missed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#dc2626]" /> Failed
          </span>
        </div>
      </div>

      {data.length === 0 || data.every((d) => d.total === 0) ? (
        <div className="h-48 flex items-center justify-center text-xs text-[#777169] bg-[#fafafa] rounded-xl border border-dashed border-[#e7e5e4]">
          No call traffic recorded in this period yet.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-[#f0efed] relative">
            {data.map((d, index) => {
              const heightPct = Math.max((d.total / maxTotal) * 100, d.total > 0 ? 8 : 2);
              const completedPct = d.total > 0 ? (d.completed / d.total) * 100 : 0;
              const missedPct = d.total > 0 ? (d.missed / d.total) * 100 : 0;
              const failedPct = d.total > 0 ? (d.failed / d.total) * 100 : 0;

              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  {hoveredIndex === index && (
                    <div className="absolute -top-14 z-20 bg-[#0c0a09] text-white text-[11px] rounded-lg py-1.5 px-3 whitespace-nowrap shadow-xl">
                      <p className="font-semibold">{formatDate(d.date)}</p>
                      <p className="text-white/80">
                        Total: {d.total} (✓ {d.completed} · ⚠ {d.missed} · ✗ {d.failed})
                      </p>
                    </div>
                  )}

                  <div
                    className="w-full max-w-[36px] rounded-t-md overflow-hidden flex flex-col-reverse transition-all group-hover:opacity-90 bg-[#f0efed]"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div style={{ height: `${completedPct}%` }} className="bg-[#16a34a] w-full" />
                    <div style={{ height: `${missedPct}%` }} className="bg-[#d97706] w-full" />
                    <div style={{ height: `${failedPct}%` }} className="bg-[#dc2626] w-full" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between px-2 text-[10px] font-medium text-[#777169]">
            {data.map((d) => (
              <span key={d.date} className="truncate text-center flex-1">
                {d.date.substring(5)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. Donut Breakdown Chart
// ==========================================
export function DonutBreakdown({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; count: number; color: string }>;
}) {
  const total = items.reduce((acc, item) => acc + item.count, 0);

  // SVG parameters
  const size = 130;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className="el-card p-6 bg-white flex flex-col justify-between">
      <div>
        <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">{title}</h3>
        {subtitle && <p className="text-xs text-[#777169] mt-0.5">{subtitle}</p>}
      </div>

      {total === 0 ? (
        <div className="my-6 py-10 flex items-center justify-center text-xs text-[#777169] bg-[#fafafa] rounded-xl border border-dashed border-[#e7e5e4]">
          No data logged yet
        </div>
      ) : (
        <div className="my-4 flex flex-col sm:flex-row items-center justify-around gap-6">
          <div className="relative w-[130px] h-[130px] flex items-center justify-center shrink-0">
            <svg width={size} height={size} className="transform -rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="#f0efed"
                strokeWidth={strokeWidth}
              />
              {items.map((item) => {
                const strokeDasharray = (item.count / total) * circumference;
                const strokeDashoffset = -currentOffset;
                currentOffset += strokeDasharray;

                if (item.count === 0) return null;

                return (
                  <circle
                    key={item.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${strokeDasharray} ${circumference - strokeDasharray}`}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 ease-out"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display-serif text-2xl font-light text-[#0c0a09]">{total}</span>
              <span className="text-[10px] text-[#777169] uppercase font-semibold">Total</span>
            </div>
          </div>

          <div className="space-y-2 flex-1 w-full text-xs">
            {items.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.label} className="flex items-center justify-between py-1 border-b border-[#f0efed] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[#4e4e4e]">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0c0a09]">{item.count}</span>
                    <span className="text-[10px] text-[#777169]">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. Lead Funnel Progress
// ==========================================
export function LeadFunnelProgress({
  funnel,
}: {
  funnel: { new: number; contacted: number; qualified: number; closed: number };
}) {
  const total = funnel.new + funnel.contacted + funnel.qualified + funnel.closed;

  const stages = [
    { label: 'New Leads', count: funnel.new, color: 'bg-[#60a5fa]', textColor: 'text-[#2563eb]' },
    { label: 'Contacted', count: funnel.contacted, color: 'bg-[#fbbf24]', textColor: 'text-[#d97706]' },
    { label: 'Qualified', count: funnel.qualified, color: 'bg-[#34d399]', textColor: 'text-[#059669]' },
    { label: 'Closed / Won', count: funnel.closed, color: 'bg-[#818cf8]', textColor: 'text-[#4f46e5]' },
  ];

  return (
    <div className="el-card p-6 bg-white flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">Lead Qualification Funnel</h3>
          <p className="text-xs text-[#777169] mt-0.5">Pipeline stage conversion breakdown</p>
        </div>
        <span className="el-badge text-[10px]">{total} Leads Total</span>
      </div>

      {total === 0 ? (
        <div className="my-6 py-10 flex items-center justify-center text-xs text-[#777169] bg-[#fafafa] rounded-xl border border-dashed border-[#e7e5e4]">
          No leads generated yet. Leads will appear automatically after voice calls.
        </div>
      ) : (
        <div className="space-y-4 my-2">
          {stages.map((stage) => {
            const pct = total > 0 ? Math.round((stage.count / total) * 100) : 0;
            return (
              <div key={stage.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#4e4e4e]">{stage.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${stage.textColor}`}>{stage.count}</span>
                    <span className="text-[10px] text-[#777169]">({pct}%)</span>
                  </div>
                </div>
                <div className="w-full bg-[#f0efed] h-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${stage.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. Tool Usage Breakdown
// ==========================================
export function ToolUsageList({
  tools,
}: {
  tools: Array<{ toolName: string; count: number }>;
}) {
  const total = tools.reduce((acc, t) => acc + t.count, 0);

  return (
    <div className="el-card p-6 bg-white flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">AI Tool Executions</h3>
          <p className="text-xs text-[#777169] mt-0.5">Autonomous actions triggered during voice calls</p>
        </div>
        <span className="el-badge text-[10px]">{total} Executions</span>
      </div>

      {tools.length === 0 ? (
        <div className="my-6 py-10 flex items-center justify-center text-xs text-[#777169] bg-[#fafafa] rounded-xl border border-dashed border-[#e7e5e4]">
          No tools executed yet.
        </div>
      ) : (
        <div className="space-y-3 my-2">
          {tools.map((tool) => {
            const pct = total > 0 ? Math.round((tool.count / total) * 100) : 0;
            return (
              <div key={tool.toolName} className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] font-medium text-[#0c0a09]">{tool.toolName}</span>
                  <span className="font-semibold text-[#16a34a]">{tool.count} times</span>
                </div>
                <div className="w-full bg-[#e7e5e4] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#0c0a09] h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
