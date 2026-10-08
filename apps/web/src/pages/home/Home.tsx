import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Header } from './components/Header';
import { ProductShowcase } from './components/ProductShowcase';
import { Footer } from './components/Footer';

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignupClick = () => {
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
    <div className="min-h-screen bg-white text-[#0c0a09] relative overflow-x-hidden flex flex-col justify-between">
      {/* Reference-matching Vertical Blue Block Gradient Background */}
      <div className="absolute inset-x-0 top-0 h-[760px] pointer-events-none overflow-hidden select-none -z-0 bg-white">
        {/* Soft bottom-to-top ambient base gradient - 100% pure white above buttons */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #ffffff 40%, #f4f9ff 56%, #d8ecff 76%, #9ecaff 100%)'
          }}
        />

        {/* Ambient bottom glow radiating upward with pure white fade */}
        <div
          className="absolute inset-x-0 bottom-0 h-[380px]"
          style={{
            background: 'radial-gradient(ellipse 90% 75% at 50% 100%, #60a5fa 0%, #93c5fd 35%, rgba(255, 255, 255, 0) 75%)'
          }}
        />

        {/* Pure bright solid white upper mask to guarantee 100% brilliant white behind headline */}
        <div className="absolute inset-x-0 top-0 h-[340px] bg-white" />

        {/* Outer Framing Columns - Left and Right borders extend tall up to the text with smooth fade to top */}
        <div
          className="absolute inset-x-0 bottom-0 top-[110px] w-full grid grid-cols-5 pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0) 100%)',
          }}
        >
          {/* Box 1 (Outer left) */}
          <div />
          {/* Box 2 with tall Left Outer Border reaching up to text */}
          <div className="border-l border-blue-500/90" />
          {/* Box 3 (Center) */}
          <div />
          {/* Box 4 with tall Right Outer Border reaching up to text */}
          <div className="border-r border-blue-500/90" />
          {/* Box 5 (Outer right) */}
          <div />
        </div>

        {/* Shaded Columns & Internal Dividers - Strictly starts at buttons and goes down, fading towards top */}
        <div
          className="absolute inset-x-0 bottom-0 top-[350px] w-full grid grid-cols-5 border-b border-blue-300/40"
          style={{
            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 40%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 40%, rgba(0,0,0,0.4) 80%, rgba(0,0,0,0) 100%)',
          }}
        >
          {/* Box 1: Left Faded Outer Column */}
          <div className="bg-gradient-to-t from-blue-300/25 via-blue-200/10 to-transparent" />

          {/* Box 2: Center-Left Rich Blue Block */}
          <div className="border-r border-blue-500/90 bg-gradient-to-t from-blue-500/35 via-blue-400/18 to-transparent" />

          {/* Box 3: Center Rich Blue Block */}
          <div className="border-r border-blue-500/90 bg-gradient-to-t from-blue-500/35 via-blue-400/18 to-transparent" />

          {/* Box 4: Center-Right Rich Blue Block */}
          <div className="bg-gradient-to-t from-blue-500/35 via-blue-400/18 to-transparent" />

          {/* Box 5: Right Faded Outer Column */}
          <div className="bg-gradient-to-t from-blue-300/25 via-blue-200/10 to-transparent" />
        </div>
      </div>

      {/* Reusable Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-20 pb-16 px-6 max-w-[1200px] mx-auto z-10">
          <div className="w-full text-[50px] text-center leading-tight text-[#0c0a09] tracking-tight">
            AI Employees for Your Business. <br /> AI that never misses a call.
          </div>
          <div className="w-full text-[18px] text-center text-[#4e4e4e] mt-4 font-normal max-w-2xl mx-auto leading-relaxed">
            An AI employee that talks to your customers, handles calls, gets work done <br /> — 24/7.
          </div>
          <div className='w-full text-center mt-8 flex items-center justify-center gap-4'>
            <button
              onClick={handleSignupClick}
              className="inline-flex items-center justify-center h-[48px] px-8 text-[16px] font-medium text-white bg-[#0c0a09] hover:bg-[#292524] rounded-full transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              Signup
            </button>
            <button
              onClick={() => {
                const footer = document.querySelector('footer');
                footer?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center justify-center h-[48px] px-8 text-[16px] font-medium text-[#0c0a09] bg-white border border-[#d6d3d1] hover:border-[#0c0a09] hover:bg-[#fafafa] rounded-full transition-all duration-200 shadow-xs hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              Contact Us
            </button>
          </div>

          {/* Motion Graphics Video - Compact & Clean */}
          <div className="mt-10 mx-auto flex items-center justify-center">
            <div
              className="relative w-[160px] h-[160px] sm:w-[180px] sm:h-[180px] aspect-square rounded-full overflow-hidden flex items-center justify-center pointer-events-none select-none"
              style={{
                maskImage: 'radial-gradient(circle at center, black 40%, rgba(0,0,0,0.85) 60%, transparent 92%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 40%, rgba(0,0,0,0.85) 60%, transparent 92%)',
              }}
            >
              <video
                src="/motion-graphics.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover scale-[1.7] rounded-full pointer-events-none"
              />
            </div>
          </div>
        </section>

        {/* Product CRM Video Showcase Section */}
        <ProductShowcase />
      </main>

      {/* Clean Premium Footer */}
      <Footer />
    </div>
  );
}

export default Home;
