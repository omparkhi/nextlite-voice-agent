import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin' && location.pathname === '/admin') return true;
    if (path !== '/admin' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const isAgentWorkspace = Boolean(
    location.pathname.match(/\/clients\/[^/]+\/agents\/[^/]+$/)
  );

  return (
    <div className={isAgentWorkspace ? "h-screen flex flex-col bg-white text-[#0c0a09] font-sans overflow-hidden" : "min-h-screen bg-[#f5f5f5] text-[#0c0a09] font-sans"}>
      {/* Editorial Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shrink-0">
        <div className={isAgentWorkspace ? "w-full px-6 h-[56px] flex items-center justify-between" : "max-w-[1200px] mx-auto px-6 h-[64px] flex items-center justify-between"}>
          <Link to="/admin" className="flex items-center gap-2.5 group">
            <img
              src="/vanifyai-logo.jpg"
              alt="VanifyAI"
              className="w-7 h-7 rounded-md object-contain bg-black p-1 shadow-2xs ring-1 ring-black/5"
            />
            <span className="font-semibold text-xl text-[#0c0a09]">
              VanifyAI
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 ml-1.5">
                Admin
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link
              to="/admin"
              className={`py-1 transition-colors ${isActive('/admin')
                ? 'text-[#0c0a09] font-semibold border-b-2 border-[#0c0a09]'
                : 'text-[#4e4e4e] hover:text-[#0c0a09]'
                }`}
            >
              Overview
            </Link>
            <Link
              to="/admin/clients"
              className={`py-1 transition-colors ${isActive('/admin/clients')
                ? 'text-[#0c0a09] font-semibold border-b-2 border-[#0c0a09]'
                : 'text-[#4e4e4e] hover:text-[#0c0a09]'
                }`}
            >
              Clients
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="el-badge">System Administrator</span>
          <button
            onClick={handleLogout}
            className="el-btn-outline h-8 px-4 text-xs"
          >
            Sign Out
          </button>
        </div>
        {/* </div> */}
      </header>

      {isAgentWorkspace ? (
        <main className="flex-1 w-full overflow-hidden p-0 m-0 bg-white">
          <Outlet />
        </main>
      ) : (
        <main className="max-w-[1200px] mx-auto px-6 py-10">
          <Outlet />
        </main>
      )}
    </div>
  );
}
