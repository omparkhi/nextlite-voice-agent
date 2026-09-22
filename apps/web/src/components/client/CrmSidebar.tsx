import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface CrmSidebarProps {
  businessName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CrmSidebar({ businessName, isOpen, onClose }: CrmSidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();

  const isViewer = user?.role === 'CLIENT_VIEWER';

  const navItems = [
    {
      name: 'Overview',
      path: '/dashboard',
      exact: true,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Calls CRM',
      path: '/dashboard/calls',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
    },
    {
      name: 'Leads CRM',
      path: '/dashboard/leads',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      name: 'Appointments',
      path: '/dashboard/appointments',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'WhatsApp CRM',
      path: '/dashboard/follow-ups',
      badge: 'WhatsApp',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      name: 'Analytics',
      path: '/dashboard/analytics',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      name: 'Phone & Agents',
      path: '/dashboard/phone-agents',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
      ),
    },
    {
      name: 'Staff Receptionists',
      path: '/dashboard/receptionists',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      name: 'My Plan & Usage',
      path: '/dashboard/plan',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  const isActive = (itemPath: string, exact?: boolean) => {
    if (exact) return location.pathname === itemPath;
    return location.pathname.startsWith(itemPath);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-[#e7e5e4] flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div>
          {/* Brand Header */}
          <div className="h-16 px-5 border-b border-[#f0efed] flex items-center justify-between">
            <Link to="/dashboard" onClick={onClose} className="flex items-center gap-2.5 group">
              <img
                src="/vanifyai-logo.jpg"
                alt="VanifyAI"
                className="w-8 h-8 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5"
              />
              <div className="flex flex-col">
                <span className="font-semibold text-xl text-[#0c0a09] leading-tight flex items-center gap-1">
                  VanifyAI
                  {/* <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 ml-0.5">
                    CRM
                  </span> */}
                </span>
                {businessName && (
                  <span className="text-[10px] font-medium text-[#777169] block truncate max-w-[135px]">
                    {businessName}
                  </span>
                )}
              </div>
            </Link>

            <button
              onClick={onClose}
              className="lg:hidden p-1 text-[#777169] hover:text-[#0c0a09] rounded-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${active
                    ? 'bg-[#0c0a09] text-white shadow-sm'
                    : 'text-[#4e4e4e] hover:text-[#0c0a09] hover:bg-[#fafafa]'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={active ? 'text-white' : 'text-[#777169]'}>{item.icon}</span>
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20 text-white' : 'bg-[#dcfce7] text-[#15803d]'
                        }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User & Role Footer */}
        <div className="p-4 border-t border-[#f0efed] bg-[#fafafa]">
          <div className="flex items-center justify-between mb-3">
            <div className="truncate">
              <p className="text-xs font-medium text-[#0c0a09] truncate">{user?.email || 'Authenticated User'}</p>
              <span className={`inline-block text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mt-0.5 ${isViewer ? 'bg-[#f0efed] text-[#777169]' : 'bg-[#dcfce7] text-[#15803d]'
                }`}>
                {isViewer ? 'Client Viewer (Read Only)' : 'Client Owner'}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full el-btn-outline h-8 text-xs justify-center hover:bg-white"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
