import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Search, Heart, Ruler, X, Calendar, ShoppingBag, Star } from 'lucide-react';
import '../styles-public/GownSuit.css'; 
import { db } from '../firebase'; 
import { collection, onSnapshot, query, orderBy, doc, setDoc, updateDoc } from "firebase/firestore";

const GownSuit = () => {
  const navigate = useNavigate(); 
  const [items, setItems] = useState([]);
  const [selectedGown, setSelectedGown] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [loading, setLoading] = useState(true);
  
  // Hover tracking for the star interaction selection layout panel
  const [hoverRating, setHoverRating] = useState(0);
  
  // Active User State Connection Tokens
  const [userId, setUserId] = useState(localStorage.getItem('userToken') || null);

  // FALLBACK WISHLIST LOGIC (For temporary device storage)
  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem('mrs_g_wishlist');
    return saved ? JSON.parse(saved) : [];
  });

  // REAL-TIME DATA FETCHING: GOWN COLLECTION DIRECTORY WITH RATINGS
  useEffect(() => {
    const q = query(collection(db, "gowns"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gownData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          // Fallback fields for analytical database records
          averageRating: data.averageRating || 0,
          ratingCount: data.ratingCount || 0,
          ratedBy: data.ratedBy || {} // Format: { "user_id_1": 5, "user_id_2": 4 }
        };
      });
      setItems(gownData);
      setLoading(false);

      // Keep the modal view details live if an item is selected
      if (selectedGown) {
        const liveGown = gownData.find(g => g.id === selectedGown.id);
        if (liveGown) setSelectedGown(liveGown);
      }
    });
    return () => unsubscribe();
  }, [selectedGown]);

  // REAL-TIME DATA FETCHING: CUSTOMER DISK WISHLIST SYNC
  useEffect(() => {
    if (!userId) return;

    const userWishlistRef = doc(db, "user_wishlists", userId);
    const unsubscribe = onSnapshot(userWishlistRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().savedIds) {
        setWishlist(docSnap.data().savedIds);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  // SAVE TEMPORARY BACKUP ON DEVICE FOR GUESTS
  useEffect(() => {
    if (!userId) {
      localStorage.setItem('mrs_g_wishlist', JSON.stringify(wishlist));
    }
  }, [wishlist, userId]);

  // ================= CLOUD FIRESTORE SUBMIT RATING LOGIC =================
  const handleRatingSubmit = async (item, starValue) => {
    if (!userId) {
      alert("Please sign in with your account before rating an item.");
      return;
    }

    const gownDocRef = doc(db, "gowns", item.id);
    const currentRatedBy = { ...(item.ratedBy || {}) };
    const oldRating = currentRatedBy[userId] || 0;

    // Map or update the star score directly underneath the user key mapping
    currentRatedBy[userId] = starValue;

    // Evaluate total number of individual reviewers
    let newRatingCount = item.ratingCount || 0;
    if (oldRating === 0) {
      newRatingCount += 1; 
    }

    // Dynamic weighted average score calculations
    const oldTotalStars = (item.averageRating || 0) * (item.ratingCount || 0);
    const newTotalStars = oldTotalStars - oldRating + starValue;
    const newAverageRating = Number((newTotalStars / newRatingCount).toFixed(1));

    try {
      await updateDoc(gownDocRef, {
        ratedBy: currentRatedBy,
        ratingCount: newRatingCount,
        averageRating: newAverageRating
      });
      alert(`Thank you for submitting a ${starValue}-star rating for ${item.name}!`);
    } catch (error) {
      console.error("Failed to commit star ratings to remote data storage:", error);
    }
  };

  // ================= TOGGLE LIKE SYSTEM LAYER =================
  const toggleWishlist = async (e, itemId) => {
    e.stopPropagation(); 

    if (!userId) {
      setWishlist(prev => 
        prev.includes(itemId) ? prev.filter(i => i !== itemId) : [...prev, itemId]
      );
      return;
    }

    const userWishlistRef = doc(db, "user_wishlists", userId);
    let updatedWishlist = [...wishlist];

    if (updatedWishlist.includes(itemId)) {
      updatedWishlist = updatedWishlist.filter(id => id !== itemId);
    } else {
      updatedWishlist.push(itemId);
    }

    try {
      await setDoc(userWishlistRef, { 
        savedIds: updatedWishlist, 
        updatedAt: new Date().toISOString() 
      }, { merge: true });
      
      setWishlist(updatedWishlist); 
    } catch (error) {
      console.error("Failed to sync structural like status:", error);
    }
  };

  const handleReserveNow = (gown) => {
    navigate('/reserve', { state: { gown } });
  };

  // Helper Function: Render static star elements on product grid cards
  const renderStars = (ratingScore) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star 
          key={i} 
          size={14} 
          fill={i <= Math.round(ratingScore) ? "#f59e0b" : "none"} 
          color={i <= Math.round(ratingScore) ? "#f59e0b" : "#cbd5e1"} 
          style={{ marginRight: '1px' }}
        />
      );
    }
    return stars;
  };

  const filteredItems = items
    .filter(item => {
      const isWishlistMode = activeCategory === 'Wishlist';
      const matchesCat = isWishlistMode ? wishlist.includes(item.id) : (activeCategory === 'All' || item.category === activeCategory);
      const matchesSearch = item.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'low-high') return a.price - b.price;
      if (sortBy === 'high-low') return b.price - a.price;
      return 0;
    });

  return (
    <div className="gown-suit-container" style={{ position: 'relative' }}>
      
      {/* ================= FLOATING WISHLIST BUTTON ================= */}
      {wishlist.length > 0 && (
        <button
          onClick={() => setActiveCategory(activeCategory === 'Wishlist' ? 'All' : 'Wishlist')}
          title="View Liked Gowns"
          style={{
            position: 'fixed',
            bottom: '40px',
            right: '40px',
            zIndex: 999,
            background: activeCategory === 'Wishlist' ? '#ef4444' : 'var(--accent-gold, #f59e0b)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '50px',
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Heart size={26} fill="#ffffff" />
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-2px',
            background: '#1e293b',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 'bold',
            borderRadius: '50px',
            padding: '2px 7px',
            border: '2px solid #ffffff'
          }}>
            {wishlist.length}
          </span>
        </button>
      )}

      {/* HEADER SECTION */}
      <div className="search-filter-header">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon-gold" />
          <input 
            type="text" 
            placeholder="Search for your dream gown..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="right-actions-group">
          <button 
            className={`wishlist-action-btn ${activeCategory === 'Wishlist' ? 'active' : ''}`}
            onClick={() => setActiveCategory(activeCategory === 'Wishlist' ? 'All' : 'Wishlist')}
          >
            <Heart size={18} fill={activeCategory === 'Wishlist' ? "#ef4444" : "none"} color={activeCategory === 'Wishlist' ? "#ef4444" : "#64748b"} />
            <span className="wishlist-text">Wishlist</span>
            {wishlist.length > 0 && <span className="wishlist-badge">{wishlist.length}</span>}
          </button>

          <div className="sort-wrapper">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sort-dropdown">
              <option value="default">Sort by...</option>
              <option value="low-high">Price: Low to High</option>
              <option value="high-low">Price: High to Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* CATEGORY TAGS */}
      <div className="category-tags-group">
        {['All', 'Wedding', 'Debut', 'Formal', 'Accessories', 'Wishlist'].map((cat) => (
          <button
            key={cat}
            className={`category-tag-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
            style={cat === 'Wishlist' ? { color: '#ef4444', fontWeight: 'bold' } : {}}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* PRODUCT GRID */}
      {loading ? (
        <div className="loading-state">Refreshing Collection...</div>
      ) : (
        <div className="products-grid-layout">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div key={item.id} className="gown-suit-card" onClick={() => setSelectedGown(item)}>
                <div className="card-image-section">
                  <img src={item.image} alt={item.name} className="gown-img-contain" />
                  <button 
                    className={`favorite-btn ${wishlist.includes(item.id) ? 'is-active' : ''}`} 
                    onClick={(e) => toggleWishlist(e, item.id)}
                  >
                    <Heart size={18} fill={wishlist.includes(item.id) ? "#ef4444" : "none"} color={wishlist.includes(item.id) ? "#ef4444" : "#64748b"} />
                  </button>
                  <div className="size-float-tag"><Ruler size={12} /> {item.size}</div>
                </div>
                <div className="card-info-section">
                  <span className="brand-label">Mrs. G Rental</span>
                  <h3 className="item-name">{item.name}</h3>
                  
                  {/* ================= STAR RATINGS DISPLAY ================= */}
                  <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 8px 0' }}>
                    {renderStars(item.averageRating)}
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '5px', fontWeight: 'bold' }}>
                      {item.averageRating > 0 ? `${item.averageRating} (${item.ratingCount})` : '0.0 (0)'}
                    </span>
                  </div>

                  <p className="item-price">₱{Number(item.price).toLocaleString()}</p>
                  <span className={`status-badge ${item.stock <= 0 ? 'rented-out' : 'available'}`}>
                    {item.stock <= 0 ? 'Rented Out' : 'Available'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state-msg">No items found in this section.</div>
          )}
        </div>
      )}

      {/* MODAL VIEW */}
      {selectedGown && (
        <div className="public-modal-overlay" onClick={() => setSelectedGown(null)}>
          <div className="public-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-public-modal" onClick={() => setSelectedGown(null)}><X /></button>
            <div className="public-modal-body">
              <div className="public-modal-image-side">
                <img src={selectedGown.image} alt={selectedGown.name} />
              </div>
              <div className="public-modal-info-side">
                <span className="modal-category-tag">{selectedGown.category}</span>
                <h2>{selectedGown.name}</h2>
                
                {/* GLOBAL RATING ANALYTICS ROW */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', margin: '6px 0' }}>
                  {renderStars(selectedGown.averageRating)}
                  <span style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold', marginLeft: '4px' }}>
                    {selectedGown.averageRating} / 5.0 ({selectedGown.ratingCount} reviews)
                  </span>
                </div>

                <div className="modal-price-row">
                   <span className="main-price">₱{Number(selectedGown.price).toLocaleString()}</span>
                   <span className="price-sub">/ Rental Period</span>
                </div>
                
                {/* ================= INTERACTIVE RATING FEEDBACK INTERACTION ================= */}
                <div style={{
                  background: '#fafafa',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '12px',
                  margin: '14px 0'
                }}>
                  <h4 style={{ fontSize: '12px', margin: '0 0 6px 0', color: '#4b5563' }}>
                    {selectedGown.ratedBy && selectedGown.ratedBy[userId]
                      ? `Your current rating: ${selectedGown.ratedBy[userId]} Stars. Click to modify:`
                      : 'How would you rate this item? Select stars below:'
                    }
                  </h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star}
                        size={22}
                        style={{ cursor: 'pointer' }}
                        fill={star <= (hoverRating || (selectedGown.ratedBy && selectedGown.ratedBy[userId]) || 0) ? "#f59e0b" : "none"}
                        color={star <= (hoverRating || (selectedGown.ratedBy && selectedGown.ratedBy[userId]) || 0) ? "#f59e0b" : "#9ca3af"}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => handleRatingSubmit(selectedGown, star)}
                      />
                    ))}
                  </div>
                </div>

                <div className="modal-specs">
                  <div className="spec-item"><Ruler size={18}/> Size: <strong>{selectedGown.size}</strong></div>
                  <div className="spec-item"><ShoppingBag size={18}/> Stock: <strong>{selectedGown.stock}</strong></div>
                </div>
                <div className="modal-description">
                  <h4>Description</h4>
                  <p>{selectedGown.desc || "Exquisite gown perfect for special occasions."}</p>
                </div>
                
                <button 
                  className="reserve-now-btn" 
                  disabled={selectedGown.stock <= 0}
                  onClick={() => handleReserveNow(selectedGown)}
                >
                  <Calendar size={18} /> {selectedGown.stock <= 0 ? 'Currently Unavailable' : 'Reserve Gown Now'}
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