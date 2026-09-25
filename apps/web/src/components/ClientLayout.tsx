import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { CrmSidebar } from './client/CrmSidebar';
import { CrmTopbar } from './client/CrmTopbar';

export function ClientLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('crm_sidebar_collapsed') === 'true';
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('crm_sidebar_collapsed', String(next));
      return next;
    });
  };

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (err) {
      console.error('Failed to load client profile:', err);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    // Dispatch a custom window event so child pages can refresh their internal state
    window.dispatchEvent(new CustomEvent('crm-refresh'));
    await loadProfile();
    setLastUpdated(new Date());
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // 12-second background sync while active tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new CustomEvent('crm-refresh-silent'));
      }
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  const getPageTitle = (pathname: string) => {
    if (pathname === '/dashboard') return 'Operations Overview';
    if (pathname.startsWith('/dashboard/calls')) return 'Voice Conversations CRM';
    if (pathname.startsWith('/dashboard/leads')) return 'Lead Pipeline Management';
    if (pathname.startsWith('/dashboard/appointments')) return 'Appointments & Bookings';
    if (pathname.startsWith('/dashboard/follow-ups')) return 'WhatsApp & Follow-up Center';
    if (pathname.startsWith('/dashboard/analytics')) return 'Operational & AI Analytics';
    if (pathname.startsWith('/dashboard/phone-agents')) return 'Phone Numbers & AI Agents';
    if (pathname.startsWith('/dashboard/receptionists')) return 'Receptionist Staff & Desk Credentials';
    if (pathname.startsWith('/dashboard/plan')) return 'My Plan & Voice Usage';
    return 'Client CRM Workspace';
  };

  return (
    <div className="min-h-screen bg-[#ffffff] text-[#0c0a09] font-sans flex w-full overflow-x-hidden">
      {/* Sidebar */}
      <CrmSidebar
        businessName={profile?.tenant?.name}
        doctorName={profile?.doctorName || profile?.user?.name}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 w-full transition-[padding] duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <CrmTopbar
          title={getPageTitle(location.pathname)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onToggleCollapse={toggleCollapsed}
          isCollapsed={isCollapsed}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
        />

        <main className="flex-1 p-3.5 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-5 sm:space-y-6 md:space-y-8 min-w-0">
          <Outlet context={{ profile, onRefresh: handleManualRefresh, isViewer: user?.role === 'CLIENT_VIEWER' }} />
        </main>
      </div>
    </div>
  );
}
