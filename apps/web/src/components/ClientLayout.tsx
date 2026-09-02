import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ClientLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#0c0a09] font-sans">
      <header className="sticky top-0 z-40 bg-[#f5f5f5]/90 backdrop-blur-md border-b border-[#e7e5e4]">
        <div className="max-w-[1200px] mx-auto px-6 h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2 group">
              <div className="w-5 h-5 bg-[#0c0a09] rounded-sm flex items-center justify-center text-white text-[10px] font-bold">
                NL
              </div>
              <span className="font-display-serif text-xl tracking-tight text-[#0c0a09]">
                NextLite <span className="font-sans text-xs uppercase tracking-widest text-[#777169] ml-1">Workspace</span>
              </span>
            </Link>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link
                to="/dashboard"
                className="text-[#0c0a09] font-semibold border-b-2 border-[#0c0a09] py-1"
              >
                Dashboard
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="el-badge">Client Owner</span>
            <button
              onClick={handleLogout}
              className="el-btn-outline h-8 px-4 text-xs"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
