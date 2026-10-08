import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

export function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleDashboardClick = () => {
    if (user) {
      if (user.role === 'ADMIN') {
        navigate('/admin');
      } else if (user.role === 'CLIENT_RECEPTIONIST') {
        const slug = user.tenantSlug || '';
        navigate(slug ? `/${slug}/receptionist` : '/receptionist');
      } else {
        navigate('/dashboard');
      }
    } else {
      navigate('/login');
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md transition-all bg-white/70 border-b border-black/[0.04]">
      <div className="max-w-full px-6 sm:px-12 md:px-20 mx-auto h-[70px] flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="inline-flex items-center gap-2.5 group">
            <img
              src="/vanifyai-logo.jpg"
              alt="VanifyAI"
              className="w-7 h-7 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5"
            />
            <span className="text-xl font-medium tracking-tight text-[#0c0a09]">
              VanifyAI
            </span>
          </Link>

          {/* <nav className="hidden md:flex items-center gap-6 text-[15px] font-medium text-[#4e4e4e]">
            <a href="#features" className="hover:text-[#0c0a09] transition-colors">Products</a>
            <a href="#voices" className="hover:text-[#0c0a09] transition-colors">Voice Library</a>
            <a href="#agents" className="hover:text-[#0c0a09] transition-colors">AI Agents</a>
            <a href="#pricing" className="hover:text-[#0c0a09] transition-colors">Pricing</a>
          </nav> */}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDashboardClick}
            className="inline-flex items-center justify-center h-[40px] px-5 text-[15px] font-medium text-white bg-[#0c0a09] hover:bg-[#292524] rounded-full transition-all duration-200 cursor-pointer shadow-xs hover:shadow-sm"
          >
            {user ? 'Go to Dashboard' : 'Sign In'}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
