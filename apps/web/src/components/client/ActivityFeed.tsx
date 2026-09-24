import { useNavigate } from 'react-router-dom';
import { parseUtcDate } from '@/utils/dateFormatters';

export interface ActivityItem {
  id: string;
  type: 'CALL' | 'LEAD' | 'APPOINTMENT' | 'FOLLOW_UP';
  title: string;
  subtitle: string;
  timestamp: string;
  badge?: string;
  badgeColor?: 'green' | 'blue' | 'amber' | 'purple' | 'red';
  targetPath: string;
}

export function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
  const navigate = useNavigate();

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'CALL':
        return (
          <div className="w-8 h-8 rounded-full bg-[#dcfce7] text-[#15803d] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        );
      case 'LEAD':
        return (
          <div className="w-8 h-8 rounded-full bg-[#dbeafe] text-[#1e40af] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        );
      case 'APPOINTMENT':
        return (
          <div className="w-8 h-8 rounded-full bg-[#fef3c7] text-[#b45309] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        );
      case 'FOLLOW_UP':
        return (
          <div className="w-8 h-8 rounded-full bg-[#ede9fe] text-[#6d28d9] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        );
    }
  };

  const getRelativeTime = (timeStr: string) => {
    try {
      const parsed = parseUtcDate(timeStr);
      if (!parsed) return timeStr;
      const diffMs = Math.max(0, Date.now() - parsed.getTime());
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="el-card p-6 bg-white space-y-4">
      <div className="flex items-center justify-between border-b border-[#f0efed] pb-3">
        <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">Live Operational Activity</h3>
        <span className="text-[11px] text-[#777169]">Real-time events</span>
      </div>

      {activities.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#777169]">
          No operational activity logged yet. Call events and leads will appear here in real time.
        </div>
      ) : (
        <div className="divide-y divide-[#f0efed]">
          {activities.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(item.targetPath)}
              className="py-3 flex items-center justify-between gap-4 hover:bg-[#fafafa] -mx-2 px-2 rounded-lg cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                {getIcon(item.type)}
                <div>
                  <p className="text-xs font-medium text-[#0c0a09]">{item.title}</p>
                  <p className="text-[11px] text-[#777169] mt-0.5">{item.subtitle}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] text-[#777169] font-medium block">
                  {getRelativeTime(item.timestamp)}
                </span>
                {item.badge && (
                  <span className="inline-block text-[9px] font-semibold uppercase tracking-wider text-[#16a34a] bg-[#dcfce7] px-1.5 py-0.5 rounded-full mt-1">
                    {item.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
