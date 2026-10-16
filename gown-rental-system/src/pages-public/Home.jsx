import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Calendar, ArrowRight, Sparkles, Tag } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [topGowns, setTopGowns]   = useState([]);
  const [allGowns, setAllGowns]   = useState([]);
  const [current, setCurrent]     = useState(0);
  const [loading, setLoading]     = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    const fetchGowns = async () => {
      const { data: top } = await supabase
        .from('gowns')
        .select('id, name, price, category, desc, size, image, stock')
        .eq('is_posted', true)
        .gt('price', 0)
        .order('price', { ascending: false })
        .limit(3);

      const { data: all } = await supabase
        .from('gowns')
        .select('id, name, price, category, image, stock, size')
        .eq('is_posted', true)
        .gt('price', 0)
        .order('created_at', { ascending: false })
        .limit(8);

      if (top) setTopGowns(top);
      if (all) setAllGowns(all);
      setLoading(false);
    };
    fetchGowns();
  }, []);

  // Auto-advance
  useEffect(() => {
    if (topGowns.length <= 1) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % topGowns.length), 5000);
    return () => clearInterval(t);
  }, [topGowns]);

  const prev = useCallback(() => setCurrent(c => (c - 1 + topGowns.length) % topGowns.length), [topGowns]);
  const next = useCallback(() => setCurrent(c => (c + 1) % topGowns.length), [topGowns]);

  const g = topGowns[current];

  const categories = ['All', ...new Set(allGowns.map(g => g.category).filter(Boolean))];
  const filtered = activeFilter === 'All'
    ? allGowns
    : allGowns.filter(g => g.category === activeFilter);

  return (
    <div className="hp-page">

      {/* ── HERO ── */}
      <section className="hp-hero">
        <div className="hp-hero-top">
          <div className="hp-greeting">
            <h1>Find Your <span>Dream Gown</span></h1>
            <p>Premium gown rentals for your special day</p>
          </div>
          <button className="hp-search-btn" onClick={() => navigate('/gown-suit')}>
            <Search size={16} /> Search gowns...
          </button>
        </div>

        {/* Featured Carousel Card */}
        <div className="hp-featured-card-wrap">
          {loading ? (
            <div className="hp-hero-card hp-hero-card-loading">
              <div className="hp-spinner" />
            </div>
          ) : g ? (
            <div className="hp-hero-card" key={g.id}>
              {/* BG Image */}
              {g.image
                ? <img src={g.image} alt={g.name} className="hp-hero-card-img" />
                : <div className="hp-hero-card-noimg">👗</div>
              }
              <div className="hp-hero-card-overlay" />

              {/* Top badges */}
              <div className="hp-hero-card-top">
                <span className="hp-badge-featured"><Sparkles size={11} /> Featured</span>
                <span className="hp-badge-price">₱{Number(g.price).toLocaleString()}</span>
              </div>

              {/* Bottom info */}
              <div className="hp-hero-card-bottom">
                <div className="hp-hero-card-info">
                  <span className="hp-hero-card-cat">{g.category}</span>
                  <h2 className="hp-hero-card-name">{g.name}</h2>
                  {g.desc && <p className="hp-hero-card-desc">{g.desc}</p>}
                </div>
                <button className="hp-hero-reserve-btn" onClick={() => navigate('/gown-suit')}>
                  <Calendar size={15} /> Reserve
                </button>
              </div>

              {/* Arrows */}
              {topGowns.length > 1 && (
                <>
                  <button className="hp-card-arrow hp-card-arrow-l" onClick={prev}><ChevronLeft size={18} /></button>
                  <button className="hp-card-arrow hp-card-arrow-r" onClick={next}><ChevronRight size={18} /></button>
                </>
              )}
            </div>
          ) : (
            <div className="hp-hero-card hp-hero-card-empty">
              <p>No featured gowns yet.</p>
            </div>
          )}

          {/* Dots */}
          {topGowns.length > 1 && (
            <div className="hp-hero-dots">
              {topGowns.map((_, i) => (
                <button key={i} className={`hp-dot ${i === current ? 'active' : ''}`} onClick={() => setCurrent(i)} />
              ))}
            </div>
          )}
        </div>

        {/* Quick stats row */}
        <div className="hp-quick-stats">
          <div className="hp-qstat">
            <strong>{allGowns.length}+</strong>
            <span>Gowns</span>
          </div>
          <div className="hp-qstat-sep" />
          <div className="hp-qstat">
            <strong>Free</strong>
            <span>Hold</span>
          </div>
          <div className="hp-qstat-sep" />
          <div className="hp-qstat">
            <strong>Fast</strong>
            <span>Confirm</span>
          </div>
        </div>
      </section>

      {/* ── EXPLORE MORE ── */}
      <section className="hp-explore">
        <div className="hp-section-row">
          <div>
            <span className="hp-eyebrow"><Tag size={12} /> Collection</span>
            <h2 className="hp-section-title">Explore More <span>✨</span></h2>
          </div>
          <button className="hp-see-all" onClick={() => navigate('/gown-suit')}>
            See All <ArrowRight size={14} />
          </button>
        </div>

        {/* Category filter pills */}
        <div className="hp-filter-pills">
          {categories.map(cat => (
            <button
              key={cat}
              className={`hp-pill ${activeFilter === cat ? 'active' : ''}`}
              onClick={() => setActiveFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Gown grid */}
        {loading ? (
          <div className="hp-grid-skeleton">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="hp-skel-card">
                <div className="hp-skel hp-skel-img" />
                <div className="hp-skel hp-skel-text" />
                <div className="hp-skel hp-skel-price" />
              </div>
            ))}
          </div>
        ) : (
          <div className="hp-gown-grid">
            {filtered.map(gown => (
              <div key={gown.id} className="hp-gown-card" onClick={() => navigate('/gown-suit')}>
                <div className="hp-gown-img-wrap">
                  {gown.image
                    ? <img src={gown.image} alt={gown.name} />
                    : <div className="hp-gown-noimg">👗</div>
                  }
                  <span className={`hp-gown-avail ${gown.stock > 0 ? 'in' : 'out'}`}>
                    {gown.stock > 0 ? 'Available' : 'Rented'}
                  </span>
                </div>
                <div className="hp-gown-info">
                  <span className="hp-gown-cat">{gown.category}</span>
                  <h3 className="hp-gown-name">{gown.name}</h3>
                  <div className="hp-gown-foot">
                    <span className="hp-gown-price">₱{Number(gown.price).toLocaleString()}</span>
                    {gown.size && <span className="hp-gown-size">{gown.size}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="hp-no-results">No gowns in this category yet.</div>
        )}
      </section>

      {/* ── CTA BANNER ── */}
      <section className="hp-cta-banner">
        <div className="hp-cta-content">
          <h2>Ready to Reserve?</h2>
          <p>No login needed — just fill in your details and our admin will confirm your booking.</p>
          <button onClick={() => navigate('/gown-suit')}>
            <Calendar size={16} /> Browse & Reserve Now
          </button>
        </div>
        <div className="hp-cta-deco">👗</div>
      </section>

    </div>
  );
};

export default Home;