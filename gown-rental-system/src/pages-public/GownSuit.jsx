import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Heart, X, Calendar, ChevronDown,
  Layers, Crown, Ruler, Check, Sparkles
} from 'lucide-react';
import '../styles-public/GownSuit.css';
import { supabase } from '../supabaseClient';

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

const GownSuit = () => {
  const navigate = useNavigate();

  const [items, setItems]               = useState([]);
  const [petticoats, setPetticoats]     = useState([]);
  const [accessories, setAccessories]   = useState([]);
  const [selectedGown, setSelectedGown] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery]   = useState('');
  const [sortBy, setSortBy]             = useState('default');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loading, setLoading]           = useState(true);

  // Wishlist is stored in localStorage only, no login needed
  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mrs_g_wishlist') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('mrs_g_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  // ── Fetch posted gowns, plus the petticoats and accessories used by their packages ──
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [gRes, pRes, aRes] = await Promise.all([
        supabase
          .from('gowns')
          .select('id, name, price, stock, category, desc, size, image, status, petticoat_layer, included_accessories')
          .eq('is_posted', true) // only posted gowns are visible to customers
          .gt('price', 0)
          .order('created_at', { ascending: false }),
        supabase.from('petticoats').select('layer, price'),
        supabase.from('accessories').select('id, name, price, category'),
      ]);

      if (gRes.error) console.error(gRes.error);
      if (pRes.error) console.error(pRes.error);
      if (aRes.error) console.error(aRes.error);

      setItems(gRes.data || []);
      setPetticoats(pRes.data || []);
      setAccessories(aRes.data || []);
      setLoading(false);
    };

    fetchData();
  }, []);

  // ── Close the modal with Esc and lock the page scroll while it is open ──
  useEffect(() => {
    if (!selectedGown) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedGown(null); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selectedGown]);

  // ── Package helpers (petticoat + accessories included with a gown) ──
  const packageOf = (gown) => {
    const petti = gown.petticoat_layer
      ? petticoats.find(p => Number(p.layer) === Number(gown.petticoat_layer))
        || { layer: gown.petticoat_layer, price: 0 }
      : null;
    const accs = accessories.filter(a => (gown.included_accessories || []).includes(a.id));
    return { petti, accs };
  };

  const packageLabel = ({ petti, accs }) => {
    const parts = [];
    if (petti) parts.push(`Petticoat L${petti.layer}`);
    if (accs.length) parts.push(`${accs.length} ${accs.length === 1 ? 'accessory' : 'accessories'}`);
    return parts.join(' + ');
  };

  // ── Wishlist toggle ──
  const toggleWishlist = (e, itemId) => {
    e.stopPropagation();
    setWishlist(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // ── Reserve: no login, go straight to /reserve ──
  const handleReserveNow = (gown) => {
    navigate('/reserve', {
      state: {
        gown: {
          id: gown.id,
          name: gown.name,
          price: gown.price,
          image: gown.image,
          category: gown.category,
          size: gown.size,
        },
      },
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActiveCategory('All');
    setAvailableOnly(false);
  };

  // Unique categories from fetched data
  const categories = ['All', ...new Set(items.map(i => i.category).filter(Boolean))];

  const filteredItems = items
    .filter(item => {
      const matchCat = activeCategory === 'All'
        ? true
        : activeCategory === 'Wishlist'
          ? wishlist.includes(item.id)
          : item.category === activeCategory;
      const matchSearch = item.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStock = !availableOnly || item.stock > 0;
      return matchCat && matchSearch && matchStock;
    })
    .sort((a, b) => {
      if (sortBy === 'low-high') return a.price - b.price;
      if (sortBy === 'high-low') return b.price - a.price;
      return 0;
    });

  const hasFilters = searchQuery || activeCategory !== 'All' || availableOnly;
  const modalPkg = selectedGown ? packageOf(selectedGown) : null;
  const modalHasPkg = modalPkg && (modalPkg.petti || modalPkg.accs.length > 0);

  return (
    <div className="gs-page">

      {/* ── PAGE HEADER ── */}
      <header className="gs-header">
        <span className="gs-eyebrow">Collection</span>
        <h1>Gowns <span>&amp; Suits</span></h1>
        <p>Browse our collection and reserve your favorite. No login needed.</p>
      </header>

      {/* ── SEARCH + SORT ── */}
      <div className="gs-topbar">
        <div className="gs-search">
          <Search size={16} className="gs-search-icon" />
          <input
            type="text"
            placeholder="Search for your dream gown..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="gs-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`gs-toggle ${availableOnly ? 'gs-toggle-on' : ''}`}
          onClick={() => setAvailableOnly(v => !v)}
          aria-pressed={availableOnly}
        >
          <span className="gs-toggle-box">{availableOnly && <Check size={11} />}</span>
          Available only
        </button>

        <div className="gs-sort">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="default">Sort by</option>
            <option value="low-high">Price: Low → High</option>
            <option value="high-low">Price: High → Low</option>
          </select>
          <ChevronDown size={14} className="gs-sort-icon" />
        </div>
      </div>

      {/* ── CATEGORY TABS ── */}
      <div className="gs-cats">
        {[...categories, 'Wishlist'].map(cat => (
          <button
            key={cat}
            className={`gs-cat ${activeCategory === cat ? 'gs-cat-active' : ''} ${cat === 'Wishlist' ? 'gs-cat-wish' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === 'Wishlist' && (
              <Heart
                size={12}
                fill={activeCategory === 'Wishlist' ? '#fff' : '#ef4444'}
                color={activeCategory === 'Wishlist' ? '#fff' : '#ef4444'}
              />
            )}
            {cat}
            {cat === 'Wishlist' && wishlist.length > 0 && (
              <span className="gs-wish-badge">{wishlist.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── RESULTS COUNT ── */}
      {!loading && (
        <p className="gs-count">
          {filteredItems.length} gown{filteredItems.length !== 1 ? 's' : ''} found
        </p>
      )}

      {/* ── GRID ── */}
      {loading ? (
        <div className="gs-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="gs-card gs-skel-card">
              <div className="gs-skel gs-skel-img" />
              <div className="gs-card-body">
                <div className="gs-skel gs-skel-line sm" />
                <div className="gs-skel gs-skel-line md" />
                <div className="gs-skel gs-skel-line sm" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="gs-empty">
          <span className="gs-empty-icon">{activeCategory === 'Wishlist' ? '💛' : '👗'}</span>
          <p>
            {activeCategory === 'Wishlist' && wishlist.length === 0
              ? 'Your wishlist is empty. Tap the heart on a gown to save it.'
              : 'No gowns found.'}
          </p>
          {hasFilters && <button onClick={clearFilters}>Clear filters</button>}
        </div>
      ) : (
        <div className="gs-grid">
          {filteredItems.map(item => {
            const pkg = packageOf(item);
            const label = packageLabel(pkg);
            return (
              <div key={item.id} className="gs-card" onClick={() => setSelectedGown(item)}>
                <div className="gs-card-img">
                  {item.image
                    ? <img src={item.image} alt={item.name} loading="lazy" />
                    : <div className="gs-no-img">👗</div>
                  }
                  <button
                    className={`gs-like ${wishlist.includes(item.id) ? 'gs-liked' : ''}`}
                    onClick={e => toggleWishlist(e, item.id)}
                    aria-label="Save to wishlist"
                  >
                    <Heart
                      size={16}
                      fill={wishlist.includes(item.id) ? '#ef4444' : 'none'}
                      color={wishlist.includes(item.id) ? '#ef4444' : '#64748b'}
                    />
                  </button>
                  <span className={`gs-avail-tag ${item.stock > 0 ? 'gs-avail' : 'gs-out'}`}>
                    {item.stock > 0 ? 'Available' : 'Rented Out'}
                  </span>
                </div>

                <div className="gs-card-body">
                  <span className="gs-brand">Mrs. G Rental</span>
                  <h3 className="gs-name">{item.name}</h3>
                  {label && (
                    <span className="gs-card-inc">
                      <Sparkles size={11} /> Includes {label}
                    </span>
                  )}
                  <div className="gs-card-foot">
                    <span className="gs-price">{peso(item.price)}</span>
                    {item.size && <span className="gs-size">{item.size}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FLOATING WISHLIST BUTTON ── */}
      {wishlist.length > 0 && (
        <button
          className={`gs-float-wish ${activeCategory === 'Wishlist' ? 'gs-float-active' : ''}`}
          onClick={() => setActiveCategory(prev => prev === 'Wishlist' ? 'All' : 'Wishlist')}
          title="View wishlist"
        >
          <Heart size={20} fill="#fff" color="#fff" />
          <span>{wishlist.length}</span>
        </button>
      )}

      {/* ── DETAIL MODAL ── */}
      {selectedGown && (
        <div className="gs-overlay" onClick={() => setSelectedGown(null)}>
          <div className="gs-modal" onClick={e => e.stopPropagation()}>

            <button className="gs-modal-close" onClick={() => setSelectedGown(null)} aria-label="Close">
              <X size={16} />
            </button>

            <div className="gs-modal-body">
              {/* Image */}
              <div className="gs-modal-img">
                {selectedGown.image
                  ? <img src={selectedGown.image} alt={selectedGown.name} />
                  : <div className="gs-no-img gs-no-img-lg">👗</div>
                }
              </div>

              {/* Info */}
              <div className="gs-modal-info">
                <div className="gs-modal-head">
                  <span className="gs-modal-cat">{selectedGown.category}</span>
                  <button
                    className={`gs-modal-wish-btn ${wishlist.includes(selectedGown.id) ? 'gs-liked' : ''}`}
                    onClick={e => toggleWishlist(e, selectedGown.id)}
                    aria-label="Save to wishlist"
                  >
                    <Heart
                      size={18}
                      fill={wishlist.includes(selectedGown.id) ? '#ef4444' : 'none'}
                      color={wishlist.includes(selectedGown.id) ? '#ef4444' : '#94a3b8'}
                    />
                  </button>
                </div>

                <h2 className="gs-modal-name">{selectedGown.name}</h2>

                <div className="gs-modal-price">
                  {peso(selectedGown.price)}
                  <span className="gs-modal-per"> / rental period</span>
                </div>

                <div className="gs-modal-tags">
                  {selectedGown.size && (
                    <span className="gs-tag"><Ruler size={13} /> Size {selectedGown.size}</span>
                  )}
                  <span className={`gs-tag ${selectedGown.stock > 0 ? 'gs-tag-green' : 'gs-tag-red'}`}>
                    {selectedGown.stock > 0
                      ? <><Check size={13} /> {selectedGown.stock} available</>
                      : <><X size={13} /> Rented Out</>
                    }
                  </span>
                </div>

                {/* Included package */}
                {modalHasPkg && (
                  <div className="gs-included-section">
                    <p className="gs-included-label"><Sparkles size={13} /> Included in this package</p>
                    <div className="gs-included-chips">
                      {modalPkg.petti && (
                        <span className="gs-included-chip gs-chip-petti">
                          <Layers size={13} /> Petticoat Layer {modalPkg.petti.layer}
                        </span>
                      )}
                      {modalPkg.accs.map(a => (
                        <span key={a.id} className="gs-included-chip">
                          <Crown size={13} /> {a.name}
                        </span>
                      ))}
                    </div>
                    <p className="gs-included-note">No extra charge. These are part of the rental price.</p>
                  </div>
                )}

                {selectedGown.desc && (
                  <p className="gs-modal-desc">{selectedGown.desc}</p>
                )}

                <div className="gs-modal-actions">
                  <div className="gs-reserve-note">
                    <Calendar size={14} />
                    <span>
                      Your reservation will be reviewed and confirmed by our admin.
                      No payment needed to reserve.
                    </span>
                  </div>

                  <button
                    className="gs-reserve-btn"
                    disabled={selectedGown.stock <= 0}
                    onClick={() => handleReserveNow(selectedGown)}
                  >
                    <Calendar size={18} />
                    {selectedGown.stock <= 0
                      ? 'Currently Unavailable'
                      : 'Reserve This Gown'
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GownSuit;