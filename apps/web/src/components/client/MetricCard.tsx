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
  onClick,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-6 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between transition-all duration-150 shadow-2xs ${
        onClick ? 'cursor-pointer hover:bg-[#f0efed]/80' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-medium text-[#777169]">
            {label}
          </span>
          <p className="text-2xl md:text-3xl font-light text-[#0c0a09] mt-2">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
