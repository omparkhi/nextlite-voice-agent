import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  badge?: string;
  badgeColor?: 'green' | 'amber' | 'blue' | 'purple' | 'gray';
  icon?: ReactNode;
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  subtext,
  badge,
  badgeColor = 'green',
  icon,
  onClick,
}: MetricCardProps) {
  const badgeClasses = {
    green: 'bg-[#dcfce7] text-[#15803d]',
    amber: 'bg-[#fef3c7] text-[#b45309]',
    blue: 'bg-[#dbeafe] text-[#1e40af]',
    purple: 'bg-[#ede9fe] text-[#6d28d9]',
    gray: 'bg-[#f0efed] text-[#4e4e4e]',
  }[badgeColor];

  return (
    <div
      onClick={onClick}
      className={`el-card p-6 bg-white flex flex-col justify-between transition-all ${
        onClick ? 'cursor-pointer hover:border-[#0c0a09] hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#777169]">
            {label}
          </span>
          <p className="font-display-serif text-3xl md:text-4xl font-light text-[#0c0a09] mt-2">
            {value}
          </p>
        </div>
        {icon && (
          <div className="w-9 h-9 rounded-full bg-[#f0efed] text-[#0c0a09] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>

      {(subtext || badge) && (
        <div className="mt-4 pt-3 border-t border-[#f0efed] flex items-center justify-between text-xs text-[#777169]">
          <span>{subtext || ''}</span>
          {badge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${badgeClasses}`}>
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
