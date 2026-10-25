import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, ArrowRight, Tag, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [topGowns, setTopGowns]         = useState([]);
  const [allGowns, setAllGowns]         = useState([]);
  const [current, setCurrent]           = useState(0);
  const [loading, setLoading]           = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    const fetchGowns = async () => {
      const { data: top } = await supabase
        .from('gowns')
        .select('id, name, price, category, desc, size, image, stock')
        .eq('is_posted', true).gt('price', 0)
        .order('price', { ascending: false }).limit(3);

      const { data: all } = await supabase
        .from('gowns')
        .select('id, name, price, category, image, stock, size')
        .eq('is_posted', true).gt('price', 0)
        .order('created_at', { ascending: false }).limit(8);

      if (top) setTopGowns(top);
      if (all) setAllGowns(all);
      setLoading(false);
    };
    fetchGowns();
  }, []);

  useEffect(() => {
    if (topGowns.length <= 1) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % topGowns.length), 5000);
    return () => clearInterval(t);
  }, [topGowns]);

  const prev = useCallback(() => setCurrent(c => (c - 1 + topGowns.length) % topGowns.length), [topGowns]);
  const next = useCallback(() => setCurrent(c => (c + 1) % topGowns.length), [topGowns]);

  const g = topGowns[current];
  const categories = ['All', ...new Set(allGowns.map(item => item.category).filter(Boolean))];
  const filtered = activeFilter === 'All' ? allGowns : allGowns.filter(item => item.category === activeFilter);

  return (
    <div className="hp-page">

      {/* ── HERO ── */}
      <section className="hp-hero">

        {/* Greeting */}
        <div className="hp-greeting">
          <h1>Find Your <span>Dream Gown</span></h1>
          <p>Premium gown rentals for your special day</p>
        </div>

        {/* Featured Carousel */}
        <div className="hp-carousel-wrap">
          {loading ? (
            <div className="hp-card-shell hp-card-loading"><div className="hp-spin" /></div>
          ) : g ? (
            <div className="hp-card-shell" key={g.id}>

              {/* Photo (full background on mobile, right side on desktop) */}
              <div className="hp-card-media">
                {g.image
                  ? <img src={g.image} alt={g.name} className="hp-card-img" />
                  : <div className="hp-card-noimg">👗</div>
                }
                <div className="hp-card-gradient" />
              </div>

              {/* Badges */}
              <div className="hp-card-badges">
                <span className="hp-badge-feat"><Sparkles size={11} /> Featured</span>
                <span className="hp-badge-amt">₱{Number(g.price).toLocaleString()}</span>
              </div>

              {/* Info + button */}
              <div className="hp-card-foot">
                <div className="hp-card-text">
                  <span className="hp-card-cat">{g.category}</span>
                  <h2 className="hp-card-name">{g.name}</h2>
                  {g.desc && <p className="hp-card-desc">{g.desc}</p>}
                </div>
                <button className="hp-card-btn" onClick={() => navigate('/gown-suit')}>
                  <Calendar size={14} /> Reserve
                </button>
              </div>

              {/* Arrows */}
              {topGowns.length > 1 && (
                <>
                  <button className="hp-arrow hp-arrow-l" onClick={prev} aria-label="Previous gown"><ChevronLeft size={18} /></button>
                  <button className="hp-arrow hp-arrow-r" onClick={next} aria-label="Next gown"><ChevronRight size={18} /></button>
                </>
              )}
            </div>
          ) : (
            <div className="hp-card-shell hp-card-empty">No featured gowns yet.</div>
          )}

          {topGowns.length > 1 && (
            <div className="hp-dots">
              {topGowns.map((_, i) => (
                <button key={i} className={`hp-dot ${i === current ? 'active' : ''}`} onClick={() => setCurrent(i)} aria-label={`Show gown ${i + 1}`} />
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="hp-stats">
          <div className="hp-stat"><strong>{allGowns.length}+</strong><span>Gowns</span></div>
          <div className="hp-stat-div" />
          <div className="hp-stat"><strong>Free</strong><span>Hold</span></div>
          <div className="hp-stat-div" />
          <div className="hp-stat"><strong>Fast</strong><span>Confirm</span></div>
        </div>
      </section>

      {/* ── EXPLORE ── */}
      <section className="hp-explore">
        <div className="hp-row">
          <div>
            <span className="hp-eyebrow"><Tag size={11} /> Collection</span>
            <h2 className="hp-sec-title">Explore More <span>✨</span></h2>
          </div>
          <button className="hp-see-all" onClick={() => navigate('/gown-suit')}>
            See All <ArrowRight size={13} />
          </button>
        </div>

        {/* Filter pills */}
        <div className="hp-pills">
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

        {/* Grid */}
        {loading ? (
          <div className="hp-grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="hp-gown-card">
                <div className="hp-skel hp-skel-img" />
                <div className="hp-card-body">
                  <div className="hp-skel hp-skel-sm" />
                  <div className="hp-skel hp-skel-md" />
                  <div className="hp-skel hp-skel-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="hp-empty">No gowns in this category yet.</div>
        ) : (
          <div className="hp-grid">
            {filtered.map(gown => (
              <div key={gown.id} className="hp-gown-card" onClick={() => navigate('/gown-suit')}>
                <div className="hp-gown-img">
                  {gown.image
                    ? <img src={gown.image} alt={gown.name} />
                    : <div className="hp-gown-noimg">👗</div>
                  }
                  <span className={`hp-avail ${gown.stock > 0 ? 'in' : 'out'}`}>
                    {gown.stock > 0 ? 'Available' : 'Rented'}
                  </span>
                </div>
                <div className="hp-card-body">
                  <span className="hp-gcat">{gown.category}</span>
                  <h3 className="hp-gname">{gown.name}</h3>
                  <div className="hp-gfoot">
                    <span className="hp-gprice">₱{Number(gown.price).toLocaleString()}</span>
                    {gown.size && <span className="hp-gsize">{gown.size}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── CTA ── */}
      <section className="hp-cta">
        <div className="hp-cta-body">
          <h2>Ready to Reserve?</h2>
          <p>No login needed — just fill in your details and our admin will confirm your booking.</p>
          <button onClick={() => navigate('/gown-suit')}>
            <Calendar size={15} /> Browse & Reserve Now
          </button>
        </div>
      </section>

    </div>
  );
};

export default Home;