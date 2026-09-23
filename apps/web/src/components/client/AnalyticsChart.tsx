import { useState } from 'react';

// ==========================================
// 1. Sleek Natural Line / Area Trend Chart (Sarvam / Modern Minimalist Aesthetic)
// ==========================================
export function TrendBarChart({
  data,
  title = 'Daily Call Volume & Outcomes',
  subtitle = '7-day aggregated volume across all AI voice channels',
}: {
  data: Array<{ date: string; total: number; completed: number; missed: number; failed: number }>;
  title?: string;
  subtitle?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const hasData = data && data.length > 0 && data.some((d) => d.total > 0);

  // Layout parameters for SVG
  const width = 680;
  const height = 210;
  const paddingLeft = 32;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 32;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const baselineY = height - paddingBottom;

  const rawMax = Math.max(...(data?.map((d) => d.total) || [0]), 1);
  const maxY = Math.max(Math.ceil(rawMax * 1.2), 4);

  const formatDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // Compute points
  const points = (data || []).map((d, i) => {
    const x = paddingLeft + (i / Math.max((data?.length || 1) - 1, 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.total / maxY) * chartHeight;
    return { x, y, d, index: i };
  });

  // Catmull-Rom to Cubic Bezier curve path generator
  const generateSplinePath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      const tension = 0.2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const linePath = generateSplinePath(points);
  const areaPath = points.length > 0 ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z` : '';

  // Grid tick values (4 steps)
  const yTicks = [0, Math.round(maxY / 2), maxY];

  return (
    <div className="bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-2xs flex flex-col justify-between transition-all relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base md:text-lg font-medium text-[#0c0a09] tracking-tight">{title}</h3>
          <p className="text-xs text-[#777169] mt-0.5">{subtitle}</p>
        </div>

        {/* Minimal pill indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-[#777169]">
            <span className="flex items-center gap-1.5 font-medium text-[#4e4e4e]">
              <span className="w-2 h-2 rounded-full bg-[#9ca3af]" /> Total Calls
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#16a34a]" /> Completed
            </span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#e7e5e4] bg-[#fafafa] text-[11px] font-medium text-[#4e4e4e]">
            <span>Day</span>
            <svg className="w-3 h-3 text-[#777169]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Graph Area */}
      <div className="relative w-full overflow-visible select-none pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="callVolumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5f5f5" stopOpacity="0.08" />
              <stop offset="60%" stopColor="#f5f5f5" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#f5f5f5" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines */}
          {yTicks.map((val) => {
            const y = paddingTop + chartHeight - (val / maxY) * chartHeight;
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#f0efed"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-[#a8a29e] font-sans font-medium"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {!hasData ? (
            /* Sleek subtle ambient empty-state wave */
            <g>
              <path
                d={`M ${paddingLeft},${baselineY - 20} Q 150,${baselineY - 60} 250,${baselineY - 25} T 450,${baselineY - 50} T ${width - paddingRight},${baselineY - 15}`}
                fill="none"
                stroke="#e7e5e4"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <text
                x={width / 2}
                y={height / 2 + 10}
                textAnchor="middle"
                className="text-xs fill-[#a8a29e] font-sans font-medium"
              >
                No call traffic recorded yet
              </text>
            </g>
          ) : (
            <g>
              {/* Area fill */}
              <path d={areaPath} fill="url(#callVolumeGradient)" className="transition-all duration-300" />

              {/* Main curved line */}
              <path
                d={linePath}
                fill="none"
                stroke="#dcdcdcff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-300"
              />

              {/* Hover vertical tracking line */}
              {hoveredIndex !== null && points[hoveredIndex] && (
                <line
                  x1={points[hoveredIndex].x}
                  y1={paddingTop}
                  x2={points[hoveredIndex].x}
                  y2={baselineY}
                  stroke="#a8a29e"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                />
              )}

              {/* Data points */}
              {points.map((pt, i) => {
                const isHovered = hoveredIndex === i;
                return (
                  <g key={pt.d.date}>
                    {/* Interaction hit zone */}
                    <rect
                      x={pt.x - chartWidth / (points.length * 2)}
                      y={paddingTop}
                      width={chartWidth / points.length}
                      height={chartHeight + paddingBottom}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />

                    {/* Outer node glow/ring on hover */}
                    {isHovered && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={7.5}
                        fill="#9ca3af"
                        opacity="0.25"
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 4.5 : 3}
                      fill="#ffffff"
                      stroke="#9ca3af"
                      strokeWidth={isHovered ? 2.5 : 2}
                      className="transition-all duration-150 pointer-events-none"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* X Axis dates */}
          {points.map((pt) => (
            <text
              key={pt.d.date}
              x={pt.x}
              y={baselineY + 18}
              textAnchor="middle"
              className={`text-[10px] font-sans transition-colors ${hoveredIndex === pt.index ? 'fill-[#0c0a09] font-semibold' : 'fill-[#777169]'
                }`}
            >
              {formatDate(pt.d.date)}
            </text>
          ))}
        </svg>

        {/* Floating Tooltip with high z-index and gray theme */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div
            className="absolute z-50 pointer-events-none bg-[#f0efed] border border-[#f0efed] text-black text-[11px] rounded-xl py-2 px-3 shadow-xl transform -translate-x-1/2 -translate-y-full transition-all duration-75"
            style={{
              left: `${(points[hoveredIndex].x / width) * 100}%`,
              top: `${Math.max((points[hoveredIndex].y / height) * 100 - 6, 0)}%`,
            }}
          >
            <div className="font-semibold text-black/95 pb-1 border-b border-black/15 mb-1">
              {formatDate(points[hoveredIndex].d.date)}
            </div>
            <div className="flex items-center gap-2 text-black/90">
              <span>Total Calls:</span>
              <span className="font-bold text-black">{points[hoveredIndex].d.total}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-black/70 mt-0.5">
              <span className="text-[#4ade80]">✓ {points[hoveredIndex].d.completed} completed</span>
              {points[hoveredIndex].d.missed > 0 && <span className="text-[#fbbf24]">⚠ {points[hoveredIndex].d.missed} missed</span>}
              {points[hoveredIndex].d.failed > 0 && <span className="text-[#f87171]">✗ {points[hoveredIndex].d.failed} failed</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 2. Donut Breakdown Chart (Polished Minimalist)
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

  const size = 130;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let currentOffset = 0;

  return (
    <div className="bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-2xs flex flex-col justify-between transition-all">
      <div>
        <h3 className="text-base md:text-lg font-medium text-[#0c0a09] tracking-tight">{title}</h3>
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
              <span className="text-2xl font-light text-[#0c0a09]">{total}</span>
              <span className="text-[10px] text-[#777169] uppercase font-semibold tracking-wider">Total</span>
            </div>
          </div>

          <div className="space-y-2 flex-1 w-full text-xs">
            {items.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-[#f0efed] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
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
    { label: 'New Leads', count: funnel.new, color: 'bg-[#0c0a09]', textColor: 'text-[#0c0a09]' },
    { label: 'Contacted', count: funnel.contacted, color: 'bg-[#777169]', textColor: 'text-[#777169]' },
    { label: 'Qualified', count: funnel.qualified, color: 'bg-[#16a34a]', textColor: 'text-[#16a34a]' },
    { label: 'Closed / Won', count: funnel.closed, color: 'bg-[#2563eb]', textColor: 'text-[#2563eb]' },
  ];

  return (
    <div className="bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-2xs flex flex-col justify-between transition-all">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base md:text-lg font-medium text-[#0c0a09] tracking-tight">Lead Qualification Funnel</h3>
          <p className="text-xs text-[#777169] mt-0.5">Pipeline stage conversion breakdown</p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-[#f0efed] text-[#0c0a09]">
          {total} Leads Total
        </span>
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
    <div className="bg-white border border-[#e7e5e4] rounded-2xl p-6 shadow-2xs flex flex-col justify-between transition-all">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base md:text-lg font-medium text-[#0c0a09] tracking-tight">AI Tool Executions</h3>
          <p className="text-xs text-[#777169] mt-0.5">Autonomous actions triggered during voice calls</p>
        </div>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-[#f0efed] text-[#0c0a09]">
          {total} Executions
        </span>
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
                  <span className="font-semibold text-[#0c0a09]">{tool.count} times</span>
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
