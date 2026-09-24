import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface CrmSidebarProps {
  businessName?: string;
  doctorName?: string;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function CrmSidebar({
  businessName,
  doctorName,
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: CrmSidebarProps) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  // Use the full Dr. / Client owner name from profile or user record, fallback to email
  const displayName =
    doctorName?.trim() ||
    user?.name?.trim() ||
    (user?.email
      ? user.email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Account');

  const initial = displayName.charAt(0).toUpperCase() || 'U';

  interface NavItem {
    name: string;
    path: string;
    exact?: boolean;
    badge?: string;
    icon: JSX.Element;
  }

  const navItems: NavItem[] = [
    {
      name: 'Overview',
      path: '/dashboard',
      exact: true,
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5L10.5 4.2a2.3 2.3 0 0 1 3 0l7.5 6.3a1.5 1.5 0 0 1 .5 1.15V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19v-7.35a1.5 1.5 0 0 1 .5-1.15z" />
          <path d="M9.5 21.5v-6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v6" />
        </svg>
      ),
    },
    {
      name: 'Calls CRM',
      path: '/dashboard/calls',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
    },
    {
      name: 'Leads CRM',
      path: '/dashboard/leads',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      name: 'Appointments',
      path: '/dashboard/appointments',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="4" ry="4" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <circle cx="8" cy="15" r="1" fill="currentColor" />
          <circle cx="12" cy="15" r="1" fill="currentColor" />
          <circle cx="16" cy="15" r="1" fill="currentColor" />
        </svg>
      ),
    },
    // {
    //   name: 'WhatsApp CRM',
    //   path: '/dashboard/follow-ups',
    //   // badge: 'WhatsApp',
    //   icon: (
    //     <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    //       <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    //     </svg>
    //   ),
    // },
    {
      name: 'Agent Analytics',
      path: '/dashboard/analytics',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
          <path d="M8 17v-4M12 17v-8M16 17v-6" />
        </svg>
      ),
    },
    {
      name: 'Phone & Agents',
      path: '/dashboard/phone-agents',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="6" width="16" height="14" rx="4" ry="4" />
          <path d="M12 2v4M2 13h2M20 13h2" />
          <circle cx="9" cy="12" r="1.2" fill="currentColor" />
          <circle cx="15" cy="12" r="1.2" fill="currentColor" />
          <path d="M9 16c.8.6 1.8 1 3 1s2.2-.4 3-1" />
        </svg>
      ),
    },
    {
      name: 'Staff Receptionists',
      path: '/dashboard/receptionists',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
          <circle cx="12" cy="10" r="3" />
          <path d="M7 18c0-2.2 2.2-4 5-4s5 1.8 5 4" />
        </svg>
      ),
    },
    {
      name: 'My Plan & Usage',
      path: '/dashboard/plan',
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="4" ry="4" />
          <path d="M2 10h20M7 15h3" />
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
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white border-r border-[#e7e5e4] flex flex-col justify-between transition-all duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } ${isCollapsed ? 'w-64 lg:w-20' : 'w-64'}`}
      >
        <div>
          {/* Brand Header */}
          <div className={`h-16  px-5 border-b border-[#f0efed] flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="w-full flex items-center justify-between overflow-hidden">
              {/* Desktop Hamburger Toggle Button on the Left */}


              {/* Logo & Brand Name */}
              <Link to="/dashboard" onClick={onClose} className={`flex items-center gap-2 group overflow-hidden ${isCollapsed ? 'hidden lg:hidden' : 'flex'}`}>
                <img
                  src="/vanifyai-logo.jpg"
                  alt="VanifyAI"
                  className="w-7 h-7 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5 shrink-0"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-lg text-[#0c0a09] leading-tight flex items-center gap-1">
                    VanifyAI
                  </span>
                  {businessName && (
                    <span className="text-[10px] font-medium text-[#777169] block truncate max-w-[120px]">
                      {businessName}
                    </span>
                  )}
                </div>
              </Link>

              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="hidden lg:flex items-center justify-center p-1.5 rounded-lg border border-[#e7e5e4] bg-white text-[#777169] hover:text-[#0c0a09] hover:bg-[#fafafa] transition-colors shadow-2xs cursor-pointer shrink-0"
                  title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
            </div>

            {/* Mobile Close Button */}
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
          <nav className={`space-y-1 ${isCollapsed ? 'p-3 lg:px-2.5' : 'p-3.5'}`}>
            {navItems.map((item) => {
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  title={isCollapsed ? item.name : undefined}
                  className={`group flex items-center ${isCollapsed ? 'justify-between lg:justify-center px-4 lg:px-0' : 'justify-between px-4'} py-2.5 rounded-2xl lg:rounded-full text-sm transition-all duration-150 ${active
                    ? 'bg-[#f0efed] text-[#0c0a09] font-medium shadow-2xs'
                    : 'text-[#4b5563] hover:text-[#0c0a09] hover:bg-[#fafafa] font-medium'
                    }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'gap-3 lg:gap-0' : 'gap-3'}`}>
                    <span className={`transition-colors shrink-0 ${active ? 'text-[#0c0a09]' : 'text-[#6b7280] group-hover:text-[#0c0a09]'}`}>
                      {item.icon}
                    </span>
                    <span className={`tracking-tight text-[#0c0a09] ${isCollapsed ? 'lg:hidden' : 'block'}`}>
                      {item.name}
                    </span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isCollapsed ? 'lg:hidden' : 'inline-block'} ${active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-emerald-50 text-emerald-700'
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

        {/* User Profile Pill & Dropdown Footer */}
        <div ref={userMenuRef} className={`border-t border-[#f0efed] relative ${isCollapsed ? 'p-2.5 lg:p-2' : 'p-3'}`}>
          {/* Floating Logout & Account Details Popup */}
          {isUserMenuOpen && (
            <div className={`absolute bottom-[68px] ${isCollapsed ? 'left-3 right-3 lg:left-2 lg:right-auto lg:w-56' : 'left-3 right-3'} bg-white border border-[#e7e5e4] rounded-2xl shadow-xl p-1.5 z-50 transition-all`}>
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[#dc2626] hover:bg-[#fef2f2] transition-colors text-left group"
              >
                <svg
                  className="w-4 h-4 text-[#dc2626] transition-transform group-hover:-translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Logout</span>
              </button>

              {/* Full Email Address */}
              {user?.email && (
                <div className="pt-2 pb-1.5 px-3 border-t border-[#f0efed] mt-1 flex items-center gap-2.5">
                  <svg
                    className="w-4 h-4 text-[#777169] shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 6a9 9 0 1 1 0 12" />
                    <polyline points="11 8 15 12 11 16" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  <p className="text-sm text-[#4e4e4e] font-medium truncate" title={user.email}>
                    {user.email}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* User Profile Pill */}
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            title={isCollapsed ? (doctorName || displayName) : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-between lg:justify-center' : 'justify-between'} p-2 rounded-2xl transition-all duration-150 text-left ${isUserMenuOpen ? 'bg-[#f0efed]' : 'hover:bg-[#f0efed]/70'
              }`}
          >
            <div className={`flex items-center ${isCollapsed ? 'gap-2.5 lg:gap-0' : 'gap-2.5'} truncate`}>
              {/* Custom SVG Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ea580c] to-[#f97316] text-white flex items-center justify-center font-semibold text-xs shadow-xs shrink-0 select-none">
                {initial}
              </div>

              <div className={`truncate ${isCollapsed ? 'lg:hidden' : 'block'}`}>
                <span className="text-sm font-medium text-[#0c0a09] block truncate leading-tight">
                  {doctorName}
                </span>
              </div>
            </div>

            {/* Chevron toggle */}
            <svg
              className={`w-4 h-4 text-[#777169] transition-transform duration-200 shrink-0 ${isUserMenuOpen ? 'rotate-180' : ''} ${isCollapsed ? 'lg:hidden' : 'block'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
