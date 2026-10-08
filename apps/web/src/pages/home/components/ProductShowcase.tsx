export function ProductShowcase() {
  return (
    <section id="features" className="py-20 px-6 relative z-10 bg-white">
      <div className="max-w-[1200px] mx-auto">
        {/* Section Header with exact Hero Typography */}
        <div className="text-center max-w-4xl mx-auto mb-14">
          <h2 className="w-full text-[40px] text-center leading-tight text-[#0c0a09] tracking-tight">
            One AI employee. <br /> Your entire customer conversation.
          </h2>

          <p className="w-full text-[18px] text-center text-[#4e4e4e] mt-4 font-normal max-w-2xl mx-auto leading-relaxed">
            From the first call to the final follow-up, VanifyAI handles customer conversations and keeps your team in the loop.
          </p>
        </div>

        {/* Pure Clean Video Container */}
        <div className="relative mx-auto max-w-7xl">
          {/* Subtle Ambient Glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 via-sky-400/15 to-indigo-500/10 rounded-[32px] blur-2xl opacity-60 pointer-events-none -z-10" />

          {/* Clean Rounded Video Showcase */}
          <div className="rounded-2xl sm:rounded-3xl border border-black/[0.08] bg-black shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden">
            <video
              src="/crm.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto object-cover block"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProductShowcase;
