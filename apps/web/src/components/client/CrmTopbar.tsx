interface CrmTopbarProps {
  title?: string;
  onOpenMobileNav: () => void;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | null;
}

export function CrmTopbar({
  title,
  onOpenMobileNav,
  onToggleCollapse,
  isCollapsed = false,
  onRefresh,
  isRefreshing,
  lastUpdated,
}: CrmTopbarProps) {
  const formatLastSync = (d: Date | null | undefined) => {
    if (!d) return 'Just now';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="sticky top-0 z-30 bg-[#ffffff] backdrop-blur-md border-b border-[#e7e5e4] h-16 px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Mobile Nav Toggle */}
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden p-1.5 rounded-lg border border-[#e7e5e4] bg-white text-[#777169] hover:text-[#0c0a09]"
          aria-label="Toggle navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>



        {title && (
          <h2 className="font-display-serif text-lg font-light text-[#0c0a09] truncate hidden sm:block">
            {title}
          </h2>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Live sync pulse indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white border border-[#e7e5e4] rounded-full text-[11px] text-[#777169]">
          <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
          <span>Synced: {formatLastSync(lastUpdated)}</span>
        </div>

        {/* Refresh Action */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="el-btn-outline h-8 px-3 text-xs flex items-center gap-1.5 bg-white hover:bg-[#fafafa]"
            title="Refresh CRM Data"
          >
            <svg
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#0c0a09]' : 'text-[#777169]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
