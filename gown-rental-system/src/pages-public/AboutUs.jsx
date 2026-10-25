import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Sparkles, Award, ShieldCheck, Search,
  CalendarCheck, Store, ArrowRight, Box
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/AboutUs.css';

const VALUES = [
  {
    icon: Award,
    title: 'Premium Quality',
    text: 'Every piece in our inventory undergoes rigorous quality checks and preservation care to guarantee perfection.',
  },
  {
    icon: Heart,
    title: 'Tailored for You',
    text: 'Our professional fitting services ensure that your chosen attire conforms beautifully to your unique frame.',
  },
  {
    icon: ShieldCheck,
    title: 'Trusted Service',
    text: 'We pride ourselves on seamless booking, punctual dry-cleaning turnarounds, and reliable reservations.',
  },
];

const STEPS = [
  {
    icon: Search,
    title: 'Browse & Try',
    text: 'Explore our collection and see how each gown looks on the 3D mannequin.',
  },
  {
    icon: CalendarCheck,
    title: 'Reserve Online',
    text: 'Send a reservation request in minutes. No login and no payment needed yet.',
  },
  {
    icon: Store,
    title: 'Confirm & Visit',
    text: 'Our team confirms your booking, then you visit the shop for your fitting and pickup.',
  },
];

const AboutUs = () => {
  const navigate = useNavigate();
  const [gownCount, setGownCount] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Live number of gowns in the collection
  useEffect(() => {
    const loadCount = async () => {
      const { count, error } = await supabase
        .from('gowns')
        .select('id', { count: 'exact', head: true })
        .eq('is_posted', true)
        .gt('price', 0);
      if (!error) setGownCount(count ?? 0);
    };
    loadCount();
  }, []);

  // Fade sections in as they scroll into view
  useEffect(() => {
    const els = document.querySelectorAll('.ab-page [data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('ab-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('ab-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="ab-page">

      {/* ── HERO ── */}
      <section className="ab-hero">
        <div className="ab-hero-inner">
          <span className="ab-badge"><Sparkles size={14} /> Our Story</span>
          <h1>About Mrs. G <span>Gown Rental</span></h1>
          <p>
            Bringing elegance, confidence, and premium fashion to your most memorable life celebrations.
          </p>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="ab-stats" aria-label="Highlights">
        <div className="ab-stat">
          <strong>{gownCount === null ? '—' : gownCount}</strong>
          <span>Gowns</span>
        </div>
        <div className="ab-stat-div" />
        <div className="ab-stat">
          <strong>Free</strong>
          <span>Online hold</span>
        </div>
        <div className="ab-stat-div" />
        <div className="ab-stat">
          <strong>No login</strong>
          <span>To reserve</span>
        </div>
      </section>

      {/* ── STORY ── */}
      <section className="ab-wrap ab-story">
        <div className="ab-story-text" data-reveal>
          <span className="ab-eyebrow">Who we are</span>
          <h2>Crafting Timeless Moments</h2>
          <p>
            Founded with a passion for exquisite design and unmatched tailoring, <strong>Mrs. G Gown Rental</strong> has
            been helping individuals look and feel their absolute best on their special days. We specialize in
            premium gown and suit rentals, custom adjustments, and style consultations that cater to your unique
            personality.
          </p>
          <p>
            We believe that luxury fashion should be accessible. Whether it's a grand wedding, a formal prom, or a
            high-profile corporate gala, our curated collection of gowns and suits ensures that you stand out with
            grace, sophistication, and confidence.
          </p>

          <div className="ab-actions">
            <button className="ab-btn ab-btn-gold" onClick={() => navigate('/gown-suit')}>
              Browse Gowns <ArrowRight size={16} />
            </button>
            <button className="ab-btn ab-btn-ghost" onClick={() => navigate('/3d-mannequin')}>
              <Box size={16} /> Try 3D Mannequin
            </button>
          </div>
        </div>

        <div className="ab-story-media" data-reveal style={{ '--d': '120ms' }}>
          <div className="ab-img-frame">
            {imgFailed ? (
              <div className="ab-img-fallback">👗</div>
            ) : (
              <img
               src="/images/image.png"
                alt="Mrs. G Gown Rental shop"
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
            )}

            <div className="ab-float-card">
              <span className="ab-float-icon"><Heart size={18} /></span>
              <div>
                <strong>Made for your big day</strong>
                <span>Weddings, debuts, proms and galas</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section className="ab-wrap ab-section">
        <div className="ab-section-head" data-reveal>
          <span className="ab-eyebrow">Our promise</span>
          <h2>Why Choose Mrs. G?</h2>
        </div>

        <div className="ab-values">
          {VALUES.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="ab-value" data-reveal style={{ '--d': `${i * 90}ms` }}>
              <span className="ab-value-icon"><Icon size={24} /></span>
              <div className="ab-value-body">
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="ab-wrap ab-section">
        <div className="ab-section-head" data-reveal>
          <span className="ab-eyebrow">Simple process</span>
          <h2>How It Works</h2>
        </div>

        <div className="ab-steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="ab-step" data-reveal style={{ '--d': `${i * 90}ms` }}>
              <span className="ab-step-num">{i + 1}</span>
              <span className="ab-step-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ab-wrap">
        <div className="ab-cta" data-reveal>
          <div className="ab-cta-text">
            <h2>Ready to find your gown?</h2>
            <p>Browse the collection and send a reservation request. Our team will take care of the rest.</p>
          </div>
          <button className="ab-btn ab-btn-gold ab-btn-lg" onClick={() => navigate('/gown-suit')}>
            Browse &amp; Reserve <ArrowRight size={18} />
          </button>
        </div>
      </section>

    </div>
  );
};

export default AboutUs;