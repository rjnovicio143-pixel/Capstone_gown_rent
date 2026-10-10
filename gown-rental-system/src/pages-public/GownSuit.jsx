import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Heart, X, Calendar, ChevronDown } from 'lucide-react';
import '../styles-public/GownSuit.css';
import { supabase } from '../supabaseClient';

const GownSuit = () => {
  const navigate = useNavigate();

  const [items, setItems]               = useState([]);
  const [selectedGown, setSelectedGown] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery]   = useState('');
  const [sortBy, setSortBy]             = useState('default');
  const [loading, setLoading]           = useState(true);

  // Wishlist — localStorage only, no login needed
  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mrs_g_wishlist') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('mrs_g_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  // ── Fetch published gowns from Supabase ──
  useEffect(() => {
    const fetchGowns = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('gowns')
        .select('id, name, price, stock, category, desc, size, image, status')
        .gt('price', 0)
        .order('created_at', { ascending: false });

      if (error) { console.error(error); setLoading(false); return; }
      setItems(data || []);
      setLoading(false);
    };

    fetchGowns();
  }, []);

  // ── Wishlist toggle ──
  const toggleWishlist = (e, itemId) => {
    e.stopPropagation();
    setWishlist(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // ── Reserve — no login, go straight to /reserve ──
  const handleReserveNow = (gown) => {
    navigate('/reserve', { state: { gown } });
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
      return matchCat && matchSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'low-high') return a.price - b.price;
      if (sortBy === 'high-low') return b.price - a.price;
      return 0;
    });

  return (
    <div className="gs-page">

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
            <button className="gs-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

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
        <div className="gs-loading">
          <div className="gs-spinner" />
          <span>Loading collection...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="gs-empty">
          <span className="gs-empty-icon">👗</span>
          <p>No gowns found.</p>
          <button onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="gs-grid">
          {filteredItems.map(item => (
            <div key={item.id} className="gs-card" onClick={() => setSelectedGown(item)}>
              <div className="gs-card-img">
                {item.image
                  ? <img src={item.image} alt={item.name} />
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
                <div className="gs-card-foot">
                  <span className="gs-price">₱{Number(item.price).toLocaleString()}</span>
                  {item.size && <span className="gs-size">{item.size}</span>}
                </div>
              </div>
            </div>
          ))}
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

            <button className="gs-modal-close" onClick={() => setSelectedGown(null)}>
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
                  ₱{Number(selectedGown.price).toLocaleString()}
                  <span className="gs-modal-per"> / rental period</span>
                </div>

                <div className="gs-modal-tags">
                  {selectedGown.size && (
                    <span className="gs-tag">📐 Size {selectedGown.size}</span>
                  )}
                  <span className={`gs-tag ${selectedGown.stock > 0 ? 'gs-tag-green' : 'gs-tag-red'}`}>
                    {selectedGown.stock > 0
                      ? `✓ ${selectedGown.stock} available`
                      : '✗ Rented Out'
                    }
                  </span>
                </div>

                {selectedGown.desc && (
                  <p className="gs-modal-desc">{selectedGown.desc}</p>
                )}

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
      )}
    </div>
  );
};

export default GownSuit;