import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-black/[0.06] text-[#4e4e4e] transition-colors relative z-10">
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8 mb-16">
          {/* Brand & Mission */}
          <div className="lg:col-span-2 flex flex-col justify-between pr-4">
            <div>
              <Link to="/" className="inline-flex items-center gap-2.5 mb-4 group">
                <img
                  src="/vanifyai-logo.jpg"
                  alt="VanifyAI"
                  className="w-7 h-7 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5"
                />
                <span className="text-xl font-medium tracking-tight text-[#0c0a09]">
                  VanifyAI
                </span>
              </Link>
              <p className="text-sm text-[#777169] leading-relaxed max-w-sm mb-6">
                Autonomous voice employees for businesses that talk to customers, handle calls, schedule appointments, and never miss an opportunity.
              </p>
            </div>

            {/* System Status Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50/80 border border-emerald-200/60 w-max text-xs font-medium text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational</span>
            </div>
          </div>

          {/* Column 1: Products */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09] mb-4">
              Products
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#agents" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  AI Voice Agents
                </a>
              </li>
              <li>
                <a href="#receptionist" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Clinic Receptionist
                </a>
              </li>
              <li>
                <a href="#dialing" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Smart Inbound / Outbound
                </a>
              </li>
              <li>
                <a href="#schedules" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Dynamic Schedules
                </a>
              </li>
              <li>
                <a href="#voices" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Multilingual Voices
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Solutions */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09] mb-4">
              Industries
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#healthcare" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Healthcare & Hospitals
                </a>
              </li>
              <li>
                <a href="#automobile" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Automotive Dealerships
                </a>
              </li>
              <li>
                <a href="#finance" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Banking & Financial
                </a>
              </li>
              <li>
                <a href="#realestate" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Real Estate & Leasing
                </a>
              </li>
              <li>
                <a href="#hospitality" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Hospitality & Bookings
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources & Company */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09] mb-4">
              Company
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/login" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Sign In / Dashboard
                </Link>
              </li>
              <li>
                <a href="#pricing" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Pricing Plans
                </a>
              </li>
              <li>
                <a href="#contact" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Contact Support
                </a>
              </li>
              <li>
                <a href="#privacy" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Privacy & Security
                </a>
              </li>
              <li>
                <a href="#terms" className="text-[#666] hover:text-[#0c0a09] transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8c857b]">
          <div>
            © {currentYear} VanifyAI Technologies Inc. All rights reserved.
          </div>

          <div className="flex items-center gap-6">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0c0a09] transition-colors">
              Twitter / X
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0c0a09] transition-colors">
              LinkedIn
            </a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0c0a09] transition-colors">
              GitHub
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#0c0a09] transition-colors">
              Discord
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
