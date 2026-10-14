import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [topGowns, setTopGowns]   = useState([]);
  const [current, setCurrent]     = useState(0);
  const [loading, setLoading]     = useState(true);
  const [animating, setAnimating] = useState(false);

  // ── Fetch top 3 pinaka-mahal nga posted gowns ──
  useEffect(() => {
    const fetchTopGowns = async () => {
      const { data, error } = await supabase
        .from('gowns')
        .select('id, name, price, category, desc, size, image, petticoat_layer, included_accessories')
        .eq('is_posted', true)
        .gt('price', 0)
        .order('price', { ascending: false })
        .limit(3);

      if (!error && data) setTopGowns(data);
      setLoading(false);
    };
    fetchTopGowns();
  }, []);

  // ── Auto-advance carousel every 5 seconds ──
  useEffect(() => {
    if (topGowns.length <= 1) return;
    const timer = setInterval(() => goNext(), 5000);
    return () => clearInterval(timer);
  }, [topGowns, current]);

  const slide = (next) => {
    if (animating || topGowns.length <= 1) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrent(next);
      setAnimating(false);
    }, 300);
  };

  const goPrev = useCallback(() => {
    slide((current - 1 + topGowns.length) % topGowns.length);
  }, [current, topGowns]);

  const goNext = useCallback(() => {
    slide((current + 1) % topGowns.length);
  }, [current, topGowns]);

  const goTo = (i) => slide(i);

  const active = topGowns[current];

  return (
    <div className="home-page">

      {/* ── HERO CAROUSEL ── */}
      <section className="hero-section">

        {loading ? (
          <div className="hero-loading">
            <div className="hero-spinner" />
          </div>
        ) : topGowns.length === 0 ? (
          <div className="hero-empty">
            <span>👗</span>
            <p>No featured gowns yet.</p>
          </div>
        ) : (
          <>
            {/* Background image */}
            <div
              className={`hero-bg ${animating ? 'hero-bg-fade' : ''}`}
              style={{ backgroundImage: active?.image ? `url(${active.image})` : 'none' }}
            />
            <div className="hero-overlay" />

            {/* Content */}
            <div className={`hero-content ${animating ? 'hero-content-fade' : ''}`}>
              <div className="hero-badge">
                <Sparkles size={14} />
                Featured Collection
              </div>
              <span className="hero-category">{active?.category}</span>
              <h1 className="hero-name">{active?.name}</h1>
              {active?.desc && (
                <p className="hero-desc">{active.desc}</p>
              )}
              <div className="hero-meta">
                {active?.size && (
                  <span className="hero-meta-tag">📐 Size {active.size}</span>
                )}
                {active?.petticoat_layer && (
                  <span className="hero-meta-tag">🩱 Petticoat Layer {active.petticoat_layer}</span>
                )}
                {(active?.included_accessories || []).slice(0, 2).map((acc, i) => (
                  <span key={i} className="hero-meta-tag">👑 {acc}</span>
                ))}
              </div>
              <p className="hero-price">₱{Number(active?.price).toLocaleString()}</p>

              <div className="hero-actions">
                <button
                  className="hero-btn-primary"
                  onClick={() => navigate('/gown-suit')}
                >
                  <Calendar size={18} /> Reserve This Gown
                </button>
                <button
                  className="hero-btn-secondary"
                  onClick={() => navigate('/gown-suit')}
                >
                  Browse All Gowns
                </button>
              </div>
            </div>

            {/* Prev / Next arrows */}
            {topGowns.length > 1 && (
              <>
                <button className="hero-arrow hero-arrow-left" onClick={goPrev} aria-label="Previous">
                  <ChevronLeft size={24} />
                </button>
                <button className="hero-arrow hero-arrow-right" onClick={goNext} aria-label="Next">
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            {/* Dots */}
            {topGowns.length > 1 && (
              <div className="hero-dots">
                {topGowns.map((_, i) => (
                  <button
                    key={i}
                    className={`hero-dot ${i === current ? 'hero-dot-active' : ''}`}
                    onClick={() => goTo(i)}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
              </div>
            )}

            {/* Slide counter */}
            <div className="hero-counter">
              {current + 1} / {topGowns.length}
            </div>
          </>
        )}
      </section>

      {/* ── THUMBNAIL STRIP (top 3 preview) ── */}
      {!loading && topGowns.length > 1 && (
        <section className="thumb-strip">
          <p className="thumb-strip-label">Top {topGowns.length} Featured Gowns</p>
          <div className="thumb-row">
            {topGowns.map((gown, i) => (
              <div
                key={gown.id}
                className={`thumb-card ${i === current ? 'thumb-active' : ''}`}
                onClick={() => goTo(i)}
              >
                <div className="thumb-img-wrap">
                  {gown.image
                    ? <img src={gown.image} alt={gown.name} />
                    : <div className="thumb-no-img">👗</div>
                  }
                </div>
                <div className="thumb-info">
                  <p className="thumb-name">{gown.name}</p>
                  <p className="thumb-price">₱{Number(gown.price).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA SECTION ── */}
      <section className="home-cta">
        <div className="home-cta-inner">
          <h2>Find Your Perfect Gown</h2>
          <p>Browse our full collection of premium rental gowns for weddings, debuts, and special events.</p>
          <button className="home-cta-btn" onClick={() => navigate('/gown-suit')}>
            View Full Collection →
          </button>
        </div>
      </section>

    </div>
  );
};

export default Home;