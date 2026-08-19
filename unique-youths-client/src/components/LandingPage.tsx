import React, { useState, useEffect, useRef } from 'react';

export interface LandingPageProps {
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
  onGetStarted?: () => void;
  theme?: string;
  setTheme?: (t: string) => void;
}

const carouselSlides = [
  {
    title: "Dynamic Payouts That Scale With Your Circle",
    description:
      "The total pot grows with every member who pays. If 4 members contribute ₦10,000 each, the pot is ₦40,000 – two winners take ₦20,000 each. At 20 members, the pot is ₦200,000 – two winners take ₦100,000 each. Your payout always matches the real collected amount.",
  },
  {
    title: "Triple‑Layer Security You Can Trust",
    description: (
      <>
        <span className="block">1. Digital Guarantor Verification – no anonymous accounts.</span>
        <span className="block">2. Trust‑Ranked Payout Order – the most established members go first.</span>
        <span className="block">3. Emergency Reserve Vault – an independent backup fund covers unexpected defaults so your payout is never delayed.</span>
      </>
    ),
  },
  {
    title: "Quarterly Get‑Together – Fully Funded by the Community",
    description:
      "Your monthly ₦1,000 social contribution compounds into a dedicated ₦60,000 pool every quarter. That money is locked and earmarked to cover food, drinks, and entertainment for our quarterly networking parties – zero stress on your pocket.",
  },
  {
    title: "Strict Deadlines & Transparent Ledgers",
    description:
      "Contributions are due by the 5th of every month. Late payments incur a flat ₦4,000 fine – no exceptions. Every payment and payout is recorded in the official app, so the WhatsApp group is for proof‑sharing, not the source of truth.",
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateLogin,
  onNavigateRegister,
  onGetStarted,
  theme = 'system',
  setTheme,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showOverview, setShowOverview] = useState(false);
  const [showWhyJoin, setShowWhyJoin] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showServiceCharge, setShowServiceCharge] = useState(false);

  // ============================================================
  // SCROLL DIRECTION FOR HEADER HIDE/SHOW
  // ============================================================
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      if (current > lastScrollY.current && current > 50) {
        setIsHeaderVisible(false);
      } else if (current < lastScrollY.current) {
        setIsHeaderVisible(true);
      }
      lastScrollY.current = current;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const prevSlide = () => {
    setCurrentSlide(
      (prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length
    );
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % carouselSlides.length);
  };

  const handleGetStarted = () => {
    const cta = document.getElementById('join-circle-cta');
    if (cta) {
      cta.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }
    onGetStarted?.();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans">
      {/* Header - Responsive + scroll hide */}
      <header
        className={`w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-0 z-50 shadow-sm transition-transform duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center sm:justify-start">
          <img
            src="/brand/logo-badge.png"
            alt="Unique Youth Logo"
            className="h-8 sm:h-10 w-auto object-contain shrink-0"
          />
          <span className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight text-center sm:text-left break-words max-w-[180px] sm:max-w-none">
            Unique Youth Cooperative Thrift
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {setTheme && (
            <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-[10px] sm:text-xs shrink-0">
              {(['light', 'system', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`px-2 sm:px-2.5 py-1 sm:py-1.5 font-semibold transition ${
                    theme === t
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'Auto'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onNavigateLogin}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm shadow-sm transition whitespace-nowrap"
          >
            Member Login
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
        {/* Hero */}
        <section className="text-center bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white rounded-3xl p-6 sm:p-12 shadow-xl relative overflow-hidden flex flex-col items-center">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center gap-4 sm:gap-5">
            <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-white/10 border-2 border-white/20 p-2 shadow-2xl flex items-center justify-center backdrop-blur-md mb-1">
              <img
                src="/brand/logo-badge.png"
                alt="Unique Youth Logo"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Unique Youth Cooperative Thrift
            </h1>
            <p className="text-base sm:text-xl text-blue-100 max-w-2xl leading-relaxed font-semibold">
              A secure, digital rotating savings and social club built for our
              community. Transparent tracking, scaled payouts, and reliable
              peer backing.
            </p>
            <div className="flex justify-center mt-2">
              <button
                onClick={handleGetStarted}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl shadow-lg transition transform hover:-translate-y-0.5 text-sm sm:text-lg"
              >
                Get Started
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-center border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-700 last:border-0 pb-2 sm:pb-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Circle Size
            </p>
            <p className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">4 – 20+</p>
            <p className="text-[10px] sm:text-sm text-slate-700 dark:text-slate-300 font-semibold">members per circle</p>
          </div>
          <div className="text-center border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-700 last:border-0 pb-2 sm:pb-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Monthly Pot Range
            </p>
            <p className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white">₦40k – ₦250k+</p>
            <p className="text-[10px] sm:text-sm text-slate-700 dark:text-slate-300 font-semibold">scales with contributions</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Winner Take-Home (NET)
            </p>
            <p className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">₦18.5k – ₦118.5k+</p>
            <p className="text-[10px] sm:text-sm text-slate-700 dark:text-slate-300 font-semibold">after scaled service fee</p>
          </div>
        </section>

        {/* ============================================================
            OVERVIEW – EXPANDABLE
            ============================================================ */}
        <section className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
          <div className="text-center">
            <span className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 block mb-1">
              ℹ️ About Us
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              What We Do & How It Works
            </h2>
            <button
              onClick={() => setShowOverview(!showOverview)}
              className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md transition text-sm sm:text-lg"
            >
              {showOverview ? '✕ Close' : '▶ Click to expand'}
            </button>
          </div>

          {showOverview && (
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mt-3 sm:mt-4">
              <div className="flex flex-col items-center gap-2 sm:gap-3 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-3xl sm:text-4xl">
                  🏢
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  What the Cooperative Is
                </h3>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  An organized digital platform maintaining an always-current,
                  transparent record of member contributions, payout rotations, and
                  community growth—combining traditional Ajo discipline with modern
                  tracking.
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 sm:gap-3 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-3xl sm:text-4xl">
                  🔄
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  How the Circle Works
                </h3>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  Members contribute <strong>₦11,500</strong> monthly (<strong>₦10,000</strong> into
                  the pot, <strong>₦1,000</strong> into the party fund, plus a
                  <strong> smartly scaled service fee</strong>). The fee is ₦1,500
                  per winner for 4 members, rises to approximately ₦3,000–₦3,500 per winner by 8 members,
                  reaches ₦5,000 per winner by 10 members, stays flat at ₦5,000 until 20 members,
                  and then scales further for larger circles (e.g., ₦6,500 per winner at 25 members).
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Carousel */}
        <section className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 p-4 sm:p-8 rounded-2xl flex flex-col gap-3 sm:gap-4 text-center shadow-sm">
          <div>
            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-3 sm:px-4 py-1 sm:py-2 rounded-full">
              Interactive Guide
            </span>
            <h2 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2">
              Cooperative Highlights & System Mechanics
            </h2>
          </div>

          <div className="max-w-2xl mx-auto min-h-[100px] sm:min-h-[120px] flex flex-col justify-center items-center px-2 sm:px-4">
            <h3 className="text-lg sm:text-2xl font-bold text-blue-950 dark:text-blue-300 mb-2 sm:mb-3">
              {carouselSlides[currentSlide].title}
            </h3>
            <div className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
              {carouselSlides[currentSlide].description}
            </div>
          </div>

          <div className="flex items-center justify-between max-w-sm mx-auto w-full pt-2">
            <button
              onClick={prevSlide}
              className="text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl shadow-sm transition"
            >
              ← Previous
            </button>
            <div className="flex gap-1.5 sm:gap-2 items-center">
              {carouselSlides.map((_, index) => (
                <span
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`cursor-pointer transition-all ${
                    currentSlide === index
                      ? 'w-5 sm:w-6 h-1.5 sm:h-2 bg-blue-600 dark:bg-blue-500 rounded-full'
                      : 'w-1.5 sm:w-2 h-1.5 sm:h-2 bg-blue-200 dark:bg-blue-800 rounded-full'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={nextSlide}
              className="text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl shadow-sm transition"
            >
              Next →
            </button>
          </div>
        </section>

        {/* ============================================================
            WHY JOIN – EXPANDABLE
            ============================================================ */}
        <section className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
          <div className="text-center">
            <span className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 block mb-1">
              ✨ Why Join Us
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              Benefits of Being a Member
            </h2>
            <button
              onClick={() => setShowWhyJoin(!showWhyJoin)}
              className="mt-3 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md transition text-sm sm:text-lg"
            >
              {showWhyJoin ? '✕ Close' : '▶ Click to expand'}
            </button>
          </div>

          {showWhyJoin && (
            <div className="grid md:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4">
              <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center">
                <div className="text-4xl sm:text-5xl">🤝</div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-xl">
                  Community & Mutual Help
                </h3>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  Designed by youth, for youth—fostering financial discipline,
                  emergency backing, and reliable peer support.
                </p>
              </div>

              <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center">
                <div className="text-4xl sm:text-5xl">🎉</div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-xl">
                  Quarterly Get-Togethers
                </h3>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  The ₦1,000 monthly contribution builds a quarterly fund to cover
                  food, drinks, and networking meetups.
                </p>
              </div>

              <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center">
                <div className="text-4xl sm:text-5xl">🛡️</div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-xl">
                  Triple‑Layer Security
                </h3>
                <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  Guarantor verification, trust‑ranked payouts, and an emergency
                  vault keep your money safe.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================
            POLICY & STANDARDS – EXPANDABLE
            ============================================================ */}
        <section className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
          <div className="text-center">
            <span className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 block mb-1">
              Policy & Standards
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              Rules, Regulations & Governance
            </h2>
            <button
              onClick={() => setShowRules(!showRules)}
              className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md transition text-sm sm:text-lg"
            >
              {showRules ? '✕ Close' : '▶ Click to expand'}
            </button>
          </div>

          {showRules && (
            <>
              <div className="flex flex-col">
                {[
                  {
                    num: 1,
                    title: "Monthly Contribution",
                    desc: "₦11,000 every month – ₦10,000 into the shared pot, ₦1,000 into the party/Owambe fund. (Plus the scaled service fee for winners.)"
                  },
                  {
                    num: 2,
                    title: "Deadline",
                    desc: "The 5th of every month. Paying after the 5th automatically attracts a flat ₦4,000 late fee – no exceptions, no negotiation."
                  },
                  {
                    num: 3,
                    title: "How to Pay",
                    desc: "Send your contribution to the admin’s account (details shared privately), then post a clear screenshot of the transfer in the Payment Proofs WhatsApp group – make sure your name, amount, and date are visible. The admin confirms it in the app once verified; check your dashboard to see it reflected."
                  },
                  {
                    num: 4,
                    title: "Payouts",
                    desc: "Two members are selected at random each month to receive the lump sum (gross pot divided by two, minus the scaled service fee – same terms you accepted during registration) until everyone in your circle has been paid out once."
                  },
                  {
                    num: 5,
                    title: "Respect",
                    desc: "No insults, harassment, or disrespect toward any member or admin, here or in the app. This is a trust‑based financial community – treat it that way."
                  },
                  {
                    num: 6,
                    title: "No Spam",
                    desc: "No unrelated adverts, forwarded chain messages, links, or promotional content in any group. Repeated violations get you removed."
                  },
                  {
                    num: 7,
                    title: "Disputes",
                    desc: "Raise any disagreement about a payment or payout privately with an admin, not in the group. Admins have final say, consistent with what’s recorded in the app."
                  },
                  {
                    num: 8,
                    title: "Privacy",
                    desc: "Don’t screenshot or share another member’s personal details, phone number, or payment history outside this community."
                  },
                  {
                    num: 9,
                    title: "Missed Payments",
                    desc: "Persistent non‑payment is a breach of what you agreed to at registration and may result in removal from the circle and the community – your nominated guarantor may be contacted."
                  },
                  {
                    num: 10,
                    title: "Leaving Early",
                    desc: "If you must exit before your circle completes, speak to an admin directly – do not just stop paying or leave the group silently."
                  },
                  {
                    num: 11,
                    title: "Official Records",
                    desc: "This WhatsApp community is a companion to the official app. The app’s records are the official record of who has paid and who has been paid out – this group is for proof‑sharing and communication, not the source of truth."
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`py-1.5 sm:py-2 ${idx !== 10 ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}
                  >
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm sm:text-lg">
                      <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs sm:text-sm flex items-center justify-center font-bold shrink-0">
                        {item.num}
                      </span>
                      {item.title}
                    </h4>
                    <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-tight pl-8 sm:pl-9 font-semibold mt-0">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-200 dark:border-slate-700 text-center">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold italic">
                  By remaining in this community, you agree to these rules – the same ones you accepted when you registered.
                </p>
              </div>
            </>
          )}
        </section>

        {/* ============================================================
            HOW TO PAY & SUPPORT
            ============================================================ */}
        <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center gap-2 sm:gap-3 text-center">
            <div className="text-3xl sm:text-4xl">💳</div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg sm:text-2xl">How to Pay</h3>
            <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
              Send your contribution to the admin’s account (details shared directly), then post your receipt screenshot in the <strong>Payment Proofs</strong> WhatsApp group – make sure your name and amount are visible.
            </p>
            <p className="text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-semibold mt-1 sm:mt-2">
              Track everything: log in to the app to see your circle number, payment history, and progress.
            </p>
            <button
              onClick={onNavigateRegister}
              className="text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-800 dark:hover:text-blue-300 text-sm sm:text-base"
            >
              Register to join a circle →
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center gap-2 sm:gap-3 text-center">
            <div className="text-3xl sm:text-4xl">🛟</div>
            <h3 className="font-bold text-slate-900 dark:text-white text-lg sm:text-2xl">Need Help?</h3>
            <ul className="text-left text-slate-800 dark:text-slate-200 text-sm sm:text-base font-semibold list-disc list-inside space-y-0.5 sm:space-y-1">
              <li>Click <strong>Support</strong> in the app to send an email – team responds promptly.</li>
              <li>Contact the admin via the phone number in the app’s support section.</li>
              <li>Reach out in the WhatsApp community – admins are available.</li>
            </ul>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-semibold mt-1 sm:mt-2">
              We’re here to help every step of the way.
            </p>
          </div>
        </div>

        {/* ============================================================
            SERVICE CHARGE – EXPANDABLE
            ============================================================ */}
        <section className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
          <div className="text-center">
            <span className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 block mb-1">
              💰 Transparent Breakdown
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              Why Do We Have a Service Charge?
            </h2>
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed font-semibold mt-2 max-w-2xl mx-auto">
              Running a secure, reliable digital financial club requires continuous infrastructure maintenance. Your monthly ₦5,000 Platform Maintenance Fee / Service Charge directly covers the following technical costs:
            </p>
            <button
              onClick={() => setShowServiceCharge(!showServiceCharge)}
              className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md transition text-sm sm:text-lg"
            >
              {showServiceCharge ? '✕ Close' : '▶ Click to expand'}
            </button>
          </div>

          {showServiceCharge && (
            <div className="grid md:grid-cols-2 gap-2 sm:gap-3 mt-2">
              <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-3xl sm:text-4xl shrink-0">🌐</span>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-lg">Server & Cloud Hosting</h4>
                  <p className="text-xs sm:text-base text-slate-700 dark:text-slate-300 font-semibold">Keeps the app online 24/7 so you can access your profile anytime.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-3xl sm:text-4xl shrink-0">💾</span>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-lg">Data & Secure Storage</h4>
                  <p className="text-xs sm:text-base text-slate-700 dark:text-slate-300 font-semibold">Protects your bank details, transaction ledgers, and identity logs.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-3xl sm:text-4xl shrink-0">💬</span>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-lg">Bulk SMS & Gateways</h4>
                  <p className="text-xs sm:text-base text-slate-700 dark:text-slate-300 font-semibold">Finances automated messages sent to members and guarantors during registration and payouts.</p>
                </div>
              </div>

              <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-3xl sm:text-4xl shrink-0">🛠️</span>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-lg">System Engineering</h4>
                  <p className="text-xs sm:text-base text-slate-700 dark:text-slate-300 font-semibold">Pays for backend code upgrades to keep the platform smooth and bug‑free.</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================
            SECURITY – EXPANDABLE
            ============================================================ */}
        <section className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-800 p-4 sm:p-8 rounded-2xl shadow-sm flex flex-col gap-3 sm:gap-4">
          <div className="text-center">
            <span className="text-xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 block mb-1">
              🔒 100% Secure
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white">
              Why This System is 100% Secure for You
            </h2>
            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed font-semibold mt-2 max-w-2xl mx-auto">
              Our digital application features a triple‑layer security system to guarantee your money is completely safe and that the circle never breaks.
            </p>
            <button
              onClick={() => setShowSecurity(!showSecurity)}
              className="mt-3 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md transition text-sm sm:text-lg"
            >
              {showSecurity ? '✕ Close' : '▶ Click to expand'}
            </button>
          </div>

          {showSecurity && (
            <div className="flex flex-col gap-2 sm:gap-3">
              {[
                {
                  layer: 1,
                  title: "Built‑In Digital Guarantor Verification",
                  icon: "✅",
                  desc: "You cannot activate your app account anonymously. During registration, you must nominate a trusted community leader, market union head, or landlord. The app automatically texts them a secure verification link where they must digitally sign to confirm your character."
                },
                {
                  layer: 2,
                  title: "Trust‑Ranked Payout Order",
                  icon: "📊",
                  desc: "The app’s code restricts the first 3 months of payouts to the most established, long‑standing, and verified individuals in the community to prevent early defaults."
                },
                {
                  layer: 3,
                  title: "The Emergency Reserve Vault",
                  icon: "🏦",
                  desc: "The ₦500 monthly security levy builds an independent ₦10,000 emergency fund inside your circle every single month. If any member faces an unexpected crisis or defaults, the platform instantly pulls money from this independent backup vault to cover their share, ensuring your payouts are never delayed or shortened."
                }
              ].map((item) => (
                <div
                  key={item.layer}
                  className="bg-white dark:bg-slate-900/80 p-3 sm:p-4 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3"
                >
                  <div className="flex items-center gap-2 sm:block">
                    <span className="text-2xl sm:text-4xl">{item.icon}</span>
                    <span className="sm:hidden font-bold text-blue-600 dark:text-blue-400 text-[10px] sm:text-xs">Layer {item.layer}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm sm:text-lg">
                      <span className="hidden sm:inline text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-black">Layer {item.layer}:</span>
                      {item.title}
                    </h4>
                    <p className="text-xs sm:text-base text-slate-700 dark:text-slate-300 font-semibold mt-0.5 sm:mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Final CTA */}
        <section
          id="join-circle-cta"
          className="text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-3xl p-6 sm:p-8 shadow-lg flex flex-col items-center gap-2 sm:gap-3 scroll-mt-24"
        >
          <h2 className="text-2xl sm:text-4xl font-extrabold">
            Ready to join a circle?
          </h2>
          <p className="text-blue-100 max-w-xl text-sm sm:text-base font-semibold">
            Take control of your savings with peers who share your vision of
            financial independence and mutual growth.
          </p>
          <button
            onClick={onNavigateRegister}
            className="mt-1 bg-white text-blue-700 hover:bg-slate-100 font-bold px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl shadow-md transition transform hover:-translate-y-0.5 text-sm sm:text-lg"
          >
            Register to Join a Circle
          </button>
        </section>
      </main>

      {/* Footer - Fully Centered on all screen sizes */}
      <footer className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 py-3 sm:py-4 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col items-center justify-center gap-1 sm:gap-2">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold text-center">
            © 2026 Unique Youth Cooperative Thrift Club. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};