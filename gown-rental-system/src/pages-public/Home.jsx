import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Star, Shield, Clock, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [topGowns, setTopGowns]   = useState([]);
  const [allGowns, setAllGowns]   = useState([]);
  const [current, setCurrent]     = useState(0);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const fetchGowns = async () => {
      // Top 3 pinaka-mahal for hero
      const { data: top } = await supabase
        .from('gowns')
        .select('id, name, price, category, desc, size, image, petticoat_layer, included_accessories')
        .eq('is_posted', true)
        .gt('price', 0)
        .order('price', { ascending: false })
        .limit(3);

      // All posted for the featured strip
      const { data: all } = await supabase
        .from('gowns')
        .select('id, name, price, category, image, stock')
        .eq('is_posted', true)
        .gt('price', 0)
        .order('created_at', { ascending: false })
        .limit(6);

      if (top) setTopGowns(top);
      if (all) setAllGowns(all);
      setLoading(false);
    };
    fetchGowns();
  }, []);

  // Auto-advance hero
  useEffect(() => {
    if (topGowns.length <= 1) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % topGowns.length), 5000);
    return () => clearInterval(t);
  }, [topGowns]);

  const prev = useCallback(() => setCurrent(c => (c - 1 + topGowns.length) % topGowns.length), [topGowns]);
  const next = useCallback(() => setCurrent(c => (c + 1) % topGowns.length), [topGowns]);

  const g = topGowns[current];

  return (
    <div className="hp-page">

      {/* ════════════════════════════════
          HERO
      ════════════════════════════════ */}
      <section className="hp-hero">
        <div className="hp-hero-inner">

          {/* LEFT */}
          <div className="hp-hero-left">
            <span className="hp-hero-eyebrow">
              <Sparkles size={13} /> Premium Gown Rental
            </span>

            {loading ? (
              <div className="hp-hero-skeleton">
                <div className="hp-skel hp-skel-title" />
                <div className="hp-skel hp-skel-sub"  />
                <div className="hp-skel hp-skel-price" />
              </div>
            ) : g ? (
              <div className="hp-hero-text" key={g.id}>
                <span className="hp-hero-cat">{g.category}</span>
                <h1 className="hp-hero-title">{g.name}</h1>
                {g.desc && <p className="hp-hero-desc">{g.desc}</p>}
                <div className="hp-hero-chips">
                  {g.size && <span className="hp-chip">📐 {g.size}</span>}
                  {g.petticoat_layer && <span className="hp-chip">🩱 Layer {g.petticoat_layer}</span>}
                  {(g.included_accessories || []).slice(0, 2).map((a, i) => (
                    <span key={i} className="hp-chip">👑 {a}</span>
                  ))}
                </div>
                <p className="hp-hero-price">₱{Number(g.price).toLocaleString()}</p>
              </div>
            ) : (
              <h1 className="hp-hero-title">Your Dream Gown Awaits</h1>
            )}

            <div className="hp-hero-actions">
              <button className="hp-btn-primary" onClick={() => navigate('/gown-suit')}>
                <Calendar size={16} /> Reserve Now
              </button>
              <button className="hp-btn-outline" onClick={() => navigate('/gown-suit')}>
                Browse Collection
              </button>
            </div>

            {/* Dots nav */}
            {topGowns.length > 1 && (
              <div className="hp-hero-nav">
                <button className="hp-nav-arrow" onClick={prev}><ChevronLeft size={16} /></button>
                <div className="hp-hero-dots">
                  {topGowns.map((_, i) => (
                    <button
                      key={i}
                      className={`hp-dot ${i === current ? 'active' : ''}`}
                      onClick={() => setCurrent(i)}
                    />
                  ))}
                </div>
                <button className="hp-nav-arrow" onClick={next}><ChevronRight size={16} /></button>
                <span className="hp-nav-count">{current + 1}/{topGowns.length}</span>
              </div>
            )}
          </div>

          {/* RIGHT — Image card */}
          <div className="hp-hero-right">
            {loading ? (
              <div className="hp-img-card hp-img-loading"><div className="hp-spinner" /></div>
            ) : g?.image ? (
              <div className="hp-img-card" key={g.id}>
                <img src={g.image} alt={g.name} className="hp-img-main" />
                <div className="hp-img-bottom">
                  <span className="hp-img-name">{g.name}</span>
                  <span className="hp-img-price">₱{Number(g.price).toLocaleString()}</span>
                </div>
                {/* Decorative floating elements */}
                <div className="hp-float-tag hp-float-top">✨ Featured</div>
              </div>
            ) : (
              <div className="hp-img-card hp-img-empty">👗</div>
            )}
          </div>
        </div>

        {/* Decorative background shape */}
        <div className="hp-hero-shape" />
      </section>

      {/* ════════════════════════════════
          STATS BAR
      ════════════════════════════════ */}
      <div className="hp-stats-bar">
        <div className="hp-stat">
          <strong>{allGowns.length}+</strong>
          <span>Gowns Available</span>
        </div>
        <div className="hp-stat-divider" />
        <div className="hp-stat">
          <strong>100%</strong>
          <span>Admin Confirmed</span>
        </div>
        <div className="hp-stat-divider" />
        <div className="hp-stat">
          <strong>Free</strong>
          <span>Reservation Hold</span>
        </div>
        <div className="hp-stat-divider" />
        <div className="hp-stat">
          <strong>Fast</strong>
          <span>Easy Booking</span>
        </div>
      </div>

      {/* ════════════════════════════════
          FEATURED GOWNS STRIP
      ════════════════════════════════ */}
      {allGowns.length > 0 && (
        <section className="hp-featured">
          <div className="hp-section-header">
            <span className="hp-section-eyebrow">Our Collection</span>
            <h2>Featured Gowns</h2>
            <p>Hand-picked premium gowns for your special occasion</p>
          </div>

          <div className="hp-gown-grid">
            {allGowns.map(gown => (
              <div
                key={gown.id}
                className="hp-gown-card"
                onClick={() => navigate('/gown-suit')}
              >
                <div className="hp-gown-img">
                  {gown.image
                    ? <img src={gown.image} alt={gown.name} />
                    : <div className="hp-gown-noimg">👗</div>
                  }
                  <span className={`hp-gown-status ${gown.stock > 0 ? 'avail' : 'out'}`}>
                    {gown.stock > 0 ? 'Available' : 'Rented'}
                  </span>
                </div>
                <div className="hp-gown-info">
                  <span className="hp-gown-cat">{gown.category}</span>
                  <h3 className="hp-gown-name">{gown.name}</h3>
                  <p className="hp-gown-price">₱{Number(gown.price).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="hp-featured-cta">
            <button onClick={() => navigate('/gown-suit')}>
              View All Gowns →
            </button>
          </div>
        </section>
      )}

      {/* ════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════ */}
      <section className="hp-how">
        <div className="hp-section-header">
          <span className="hp-section-eyebrow">Simple Process</span>
          <h2>How It Works</h2>
          <p>Reserve your dream gown in just a few easy steps</p>
        </div>

        <div className="hp-steps">
          <div className="hp-step">
            <div className="hp-step-num">01</div>
            <div className="hp-step-icon"><Star size={22} /></div>
            <h3>Browse & Choose</h3>
            <p>Browse our collection and pick the gown that matches your dream look.</p>
          </div>
          <div className="hp-step-arrow">→</div>
          <div className="hp-step">
            <div className="hp-step-num">02</div>
            <div className="hp-step-icon"><Calendar size={22} /></div>
            <h3>Reserve Online</h3>
            <p>Fill in your details and submit your reservation request — no payment needed yet.</p>
          </div>
          <div className="hp-step-arrow">→</div>
          <div className="hp-step">
            <div className="hp-step-num">03</div>
            <div className="hp-step-icon"><Shield size={22} /></div>
            <h3>Admin Confirms</h3>
            <p>Our admin reviews and confirms your booking then reaches out to finalize.</p>
          </div>
          <div className="hp-step-arrow">→</div>
          <div className="hp-step">
            <div className="hp-step-num">04</div>
            <div className="hp-step-icon"><Clock size={22} /></div>
            <h3>Pick Up & Enjoy</h3>
            <p>Pick up your gown on your scheduled date and look stunning on your special day!</p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════
          FINAL CTA
      ════════════════════════════════ */}
      <section className="hp-cta">
        <div className="hp-cta-inner">
          <Sparkles size={28} color="#f59e0b" />
          <h2>Ready to Find Your Perfect Gown?</h2>
          <p>Browse our full collection and reserve your gown today — free of charge.</p>
          <button onClick={() => navigate('/gown-suit')}>
            <Calendar size={16} /> Reserve a Gown Now
          </button>
        </div>
      </section>

    </div>
  );
};

export default Home;