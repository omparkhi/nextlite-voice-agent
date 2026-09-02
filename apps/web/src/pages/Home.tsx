import { useState } from 'react';
import { Link } from 'react-router-dom';

const VOICE_SAMPLES = [
  { id: 'adam', name: 'Adam', role: 'Conversational Voice Agent', tag: 'Deep & Grounded', color: '#a7e5d3' },
  { id: 'rachel', name: 'Rachel', role: 'Editorial & Narrative', tag: 'Calm & Warm', color: '#f4c5a8' },
  { id: 'domi', name: 'Domi', role: 'Customer Success AI', tag: 'Clear & Energetic', color: '#c8b8e0' },
  { id: 'fin', name: 'Fin', role: 'Technical Support Agent', tag: 'Articulate & Precise', color: '#a8c8e8' },
];

export function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(VOICE_SAMPLES[0]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#0c0a09] font-sans selection:bg-[#292524] selection:text-white relative overflow-hidden">
      {/* Background Atmospheric Gradient Orbs */}
      <div className="absolute top-[-100px] left-[15%] w-[500px] h-[500px] rounded-full bg-radial from-[#a7e5d3]/40 via-[#f4c5a8]/20 to-transparent blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-[400px] right-[10%] w-[600px] h-[600px] rounded-full bg-radial from-[#c8b8e0]/30 via-[#a8c8e8]/20 to-transparent blur-3xl pointer-events-none" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-[#f5f5f5]/85 backdrop-blur-md border-b border-[#e7e5e4] transition-all">
        <div className="max-w-[1200px] mx-auto px-6 h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-5 h-5 bg-[#0c0a09] rounded-sm flex items-center justify-center text-white text-[10px] font-bold tracking-tighter">
                NL
              </div>
              <span className="font-display-serif text-xl tracking-tight font-light text-[#0c0a09] group-hover:opacity-80 transition-opacity">
                NextLite <span className="font-sans text-xs uppercase tracking-widest text-[#777169] ml-1">Voice</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-[15px] font-medium text-[#4e4e4e]">
              <a href="#features" className="hover:text-[#0c0a09] transition-colors">Products</a>
              <a href="#voices" className="hover:text-[#0c0a09] transition-colors">Voice Library</a>
              <a href="#agents" className="hover:text-[#0c0a09] transition-colors">AI Agents</a>
              <a href="#pricing" className="hover:text-[#0c0a09] transition-colors">Pricing</a>
              <Link to="/admin" className="hover:text-[#0c0a09] transition-colors text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-[#e7e5e4]/60">
                Admin Portal
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="el-btn-outline">
              Sign In
            </Link>
            <Link to="/login" className="el-btn-primary">
              Try Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-6 max-w-[1200px] mx-auto">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-[#f0efed] border border-[#e7e5e4]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-ping" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#0c0a09]">
              NextLite Voice Platform 2.0
            </span>
          </div>

          <h1 className="el-display-mega text-[#0c0a09] mb-8 font-light leading-[1.05] tracking-[-1.92px]">
            Generative Voice AI for the next era of audio.
          </h1>

          <p className="text-lg md:text-xl text-[#4e4e4e] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Convert text into lifelike speech with natural intonation, build autonomous conversational AI agents, and deploy ultra-low latency human voice experiences.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/login" className="el-btn-primary px-8 text-base">
              Get Started Free
            </Link>
            <a href="#demo" className="el-btn-outline px-8 text-base">
              Listen to Demo
            </a>
          </div>
        </div>

        {/* Audio Waveform Card Showcase */}
        <div id="demo" className="mt-16 max-w-3xl mx-auto el-card p-6 md:p-8 bg-white relative overflow-hidden">
          {/* Subtle gradient background glow */}
          <div 
            className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none transition-colors duration-700"
            style={{ backgroundColor: selectedVoice.color }}
          />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 border-b border-[#f0efed] pb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 rounded-full bg-[#292524] hover:bg-[#0c0a09] text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md"
                aria-label={isPlaying ? "Pause voice demo" : "Play voice demo"}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[#0c0a09] text-base">{selectedVoice.name}</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#f0efed] text-[#4e4e4e] font-medium">
                    {selectedVoice.tag}
                  </span>
                </div>
                <p className="text-xs text-[#777169] mt-0.5">{selectedVoice.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              {VOICE_SAMPLES.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedVoice.id === voice.id
                      ? 'bg-[#292524] text-white'
                      : 'bg-[#f0efed] text-[#4e4e4e] hover:bg-[#e7e5e4]'
                  }`}
                >
                  {voice.name}
                </button>
              ))}
            </div>
          </div>

          {/* Animated Waveform Visualizer */}
          <div className="bg-[#fafafa] rounded-xl p-4 border border-[#e7e5e4] flex items-center justify-between gap-1 h-20 px-6">
            {Array.from({ length: 48 }).map((_, i) => {
              const heightMultiplier = Math.sin(i * 0.4) * 0.4 + 0.6;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlaying ? 'bg-[#292524]' : 'bg-[#d6d3d1]'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(15, heightMultiplier * 56)}px` : `${Math.max(8, heightMultiplier * 24)}px`,
                    opacity: isPlaying ? 0.85 : 0.4,
                  }}
                />
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-[#777169]">
            <span>Latency: <strong className="text-[#0c0a09]">120ms</strong></span>
            <span>Sample Rate: <strong className="text-[#0c0a09]">44.1 kHz Studio</strong></span>
            <span>Language: <strong className="text-[#0c0a09]">English (US)</strong></span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-[#fafafa] border-t border-b border-[#e7e5e4]">
        <div className="max-w-[1200px] mx-auto">
          <div className="max-w-2xl mb-16">
            <span className="el-badge mb-4">Core Technology</span>
            <h2 className="el-display-xl text-[#0c0a09]">
              Engineered for natural emotion and voice authenticity.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="el-card p-8 bg-white flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-full bg-[#f4c5a8]/30 flex items-center justify-center text-[#292524] mb-6">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                </div>
                <h3 className="font-display-serif text-2xl text-[#0c0a09] mb-3">Conversational AI Agents</h3>
                <p className="text-sm text-[#4e4e4e] leading-relaxed">
                  Build full-duplex voice agents capable of conducting real-time inbound & outbound support calls with human cadence.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-[#f0efed] text-xs font-semibold text-[#292524] flex items-center gap-1">
                Explore Voice Agents →
              </div>
            </div>

            {/* Feature 2 */}
            <div className="el-card p-8 bg-white flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-full bg-[#a7e5d3]/30 flex items-center justify-center text-[#292524] mb-6">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="font-display-serif text-2xl text-[#0c0a09] mb-3">Text to Speech (TTS)</h3>
                <p className="text-sm text-[#4e4e4e] leading-relaxed">
                  Turn written content into rich audio books, podcasts, or game dialogues in over 29 languages with nuanced inflection.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-[#f0efed] text-xs font-semibold text-[#292524] flex items-center gap-1">
                Try Text to Speech →
              </div>
            </div>

            {/* Feature 3 */}
            <div className="el-card p-8 bg-white flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-full bg-[#c8b8e0]/30 flex items-center justify-center text-[#292524] mb-6">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-display-serif text-2xl text-[#0c0a09] mb-3">Instant Voice Cloning</h3>
                <p className="text-sm text-[#4e4e4e] leading-relaxed">
                  Clone your own voice or custom corporate voices from just 1 minute of clean audio recording.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-[#f0efed] text-xs font-semibold text-[#292524] flex items-center gap-1">
                Learn About Cloning →
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 max-w-[1200px] mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="el-badge mb-4">Transparent Pricing</span>
          <h2 className="el-display-xl text-[#0c0a09]">
            Simple plans for creators and enterprise scale.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <div className="el-card p-8 bg-white flex flex-col justify-between border border-[#e7e5e4]">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#777169]">Free</span>
              <div className="mt-4 mb-2 flex items-baseline gap-1">
                <span className="text-4xl font-light font-display-serif">$0</span>
                <span className="text-xs text-[#777169]">/ month</span>
              </div>
              <p className="text-xs text-[#777169] mb-6">Ideal for testing and individual experimentation.</p>
              
              <ul className="space-y-3 text-sm text-[#4e4e4e] border-t border-[#f0efed] pt-6">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  10,000 characters per month
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  3 Custom Voices
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  API Access (Standard Rate)
                </li>
              </ul>
            </div>
            <Link to="/login" className="el-btn-outline w-full text-center mt-8">
              Start Free
            </Link>
          </div>

          {/* Pro Tier (Featured Dark Inversion) */}
          <div className="el-card p-8 bg-[#0c0a09] text-white flex flex-col justify-between relative shadow-2xl scale-[1.02]">
            <div className="absolute top-4 right-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest bg-white/20 text-white px-2 py-0.5 rounded-full">
                Most Popular
              </span>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#a8a29e]">Pro</span>
              <div className="mt-4 mb-2 flex items-baseline gap-1">
                <span className="text-4xl font-light font-display-serif">$22</span>
                <span className="text-xs text-[#a8a29e]">/ month</span>
              </div>
              <p className="text-xs text-[#a8a29e] mb-6">For creators & teams building voice AI products.</p>
              
              <ul className="space-y-3 text-sm text-[#a8a29e] border-t border-white/10 pt-6">
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  100,000 characters per month
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  30 Custom Voices & Cloning
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Ultra-low Latency Agent API
                </li>
              </ul>
            </div>
            <Link to="/login" className="w-full h-[40px] rounded-full bg-white text-[#0c0a09] font-medium text-sm flex items-center justify-center hover:bg-[#f0efed] transition-colors mt-8">
              Upgrade to Pro
            </Link>
          </div>

          {/* Enterprise Tier */}
          <div className="el-card p-8 bg-white flex flex-col justify-between border border-[#e7e5e4]">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#777169]">Enterprise</span>
              <div className="mt-4 mb-2 flex items-baseline gap-1">
                <span className="text-4xl font-light font-display-serif">Custom</span>
              </div>
              <p className="text-xs text-[#777169] mb-6">Dedicated infrastructure & custom voice design.</p>
              
              <ul className="space-y-3 text-sm text-[#4e4e4e] border-t border-[#f0efed] pt-6">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Unlimited Volumes & SLA
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Custom Brand Voice Design
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  Dedicated Support & On-prem
                </li>
              </ul>
            </div>
            <Link to="/login" className="el-btn-outline w-full text-center mt-8">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Pre-footer CTA Band */}
      <section className="py-24 px-6 bg-[#f5f5f5] text-center border-t border-[#e7e5e4]">
        <div className="max-w-3xl mx-auto">
          <h2 className="el-display-lg text-[#0c0a09] mb-6">
            Create voice agents with unprecedented realism.
          </h2>
          <p className="text-[#4e4e4e] mb-8 font-normal">
            Join thousands of developers and brands crafting the next generation of conversational AI.
          </p>
          <Link to="/login" className="el-btn-primary px-8 text-base">
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#f5f5f5] border-t border-[#e7e5e4] py-16 px-6 text-[#777169] text-xs">
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div>
            <div className="font-display-serif text-lg text-[#0c0a09] mb-4">NextLite Voice</div>
            <p className="text-xs text-[#777169] leading-relaxed">
              Editorial audio AI and conversational voice infrastructure.
            </p>
          </div>
          <div>
            <div className="font-medium text-[#0c0a09] mb-3">Product</div>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-[#0c0a09]">Text to Speech</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Voice Library</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Conversational AI</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Dubbing & Translation</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-[#0c0a09] mb-3">Solutions</div>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-[#0c0a09]">Customer Care</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Publishers & Audiobooks</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Gaming & Entertainment</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-[#0c0a09] mb-3">Resources</div>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-[#0c0a09]">API Documentation</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Voice Safety</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Status</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-[#0c0a09] mb-3">Company</div>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-[#0c0a09]">About</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Careers</a></li>
              <li><a href="#" className="hover:text-[#0c0a09]">Privacy & Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto pt-6 border-t border-[#e7e5e4] flex flex-col md:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} NextLite Voice AI. All rights reserved.</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-[#0c0a09]">Twitter / X</a>
            <a href="#" className="hover:text-[#0c0a09]">GitHub</a>
            <a href="#" className="hover:text-[#0c0a09]">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Home;
