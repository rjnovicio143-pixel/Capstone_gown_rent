import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Calendar, Heart } from 'lucide-react';
import '../styles-public/Home.css';

const Home = () => {
  // Sample featured gowns para naay nindot nga display sa landing page
  const featuredGowns = [
    {
      id: 1,
      name: "Seraphina Royal Gown",
      category: "Wedding Gown",
      price: "₱9,500.00",
      image: "👗" // Pwede ra nimo ilisan og tinuod nga image URL puhon
    },
    {
      id: 2,
      name: "Aurora Golden Prom Gown",
      category: "Debut Gown",
      price: "₱14,500.00",
      image: "✨"
    },
    {
      id: 3,
      name: "Classic Midnight Tuxedo",
      category: "Groom Suit",
      price: "₱5,800.00",
      image: "🤵"
    }
  ];

  return (
    <div className="home-container">
      {/* ================= HERO SECTION ================= */}
      {/* ================= HERO SECTION ================= */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="welcome-tag">
              <Sparkles size={16} /> 
              <span>Welcome to Mrs G Gown Rental Villanueva</span>
            </div>
            <h1>Find Your Dream Gown & Suit for Your Special Day</h1>
            <p>
              Experience premium gown and suit rentals with absolute convenience. 
              Discover our curated collections and experience our state-of-the-art 
              3D Mannequin.
            </p>
            <div className="hero-buttons">
              <button className="primary-gold-btn">
                Browse Collection <ArrowRight size={16} />
              </button>
              <button className="secondary-outline-btn">
                Try 3D Mannequin
              </button>
            </div>
          </div>

          <div className="hero-image-container">
            <div className="gold-glowing-circle"></div>
            
            {/* GI-UPDATE DIRI: Gigamit ang tag nga <img> para sa imong image */}
            <div className="hero-image-card">
              <img 
                src="/images/premium.jpg" 
                alt="Premium Gown" 
                className="hero-actual-image" 
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '15px' }}
              />
              <div className="floating-badge">
                <span className="badge-crown">👑</span>
                <div>
                  <h4>Premium Quality</h4>
                  <p>Curated Designer Wear</p>
                </div>
              </div>
            </div>
          </div>
        </section>

      {/* ================= SERVICES / FEATURES INFO ================= */}
      <section className="features-section">
        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Calendar size={24} />
          </div>
          <h3>Easy Booking</h3>
          <p>Search and reserve your preferred dates instantly with our availability checker.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Sparkles size={24} />
          </div>
          <h3>Interactive 3D Mannequin Fitting</h3>
          <p>Try advanced 3D Mannequin simulation tool.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <ShieldCheck size={24} />
          </div>
          <h3>Pristine Condition</h3>
          <p>Every dress is professionally dry-cleaned, sanitized, and altered to fit you perfectly.</p>
        </div>
      </section>

      {/* ================= FEATURED GOWNS SECTION ================= */}
      <section className="featured-section">
        <div className="section-header">
          <h2>Featured Creations</h2>
          <p>Take a glimpse at our most popular and elegant pieces for rent.</p>
        </div>

        <div className="featured-grid">
          {featuredGowns.map((gown) => (
            <div key={gown.id} className="public-gown-card">
              <div className="gown-image-box">
                <span className="gown-emoji">{gown.image}</span>
                <button className="wishlist-btn">
                  <Heart size={18} />
                </button>
              </div>
              <div className="gown-details">
                <span className="gown-cat">{gown.category}</span>
                <h3>{gown.name}</h3>
                <div className="gown-footer">
                  <span className="gown-price">{gown.price}</span>
                  <span className="rent-tag">Rent Now</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;