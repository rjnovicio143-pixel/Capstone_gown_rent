import React, { useState } from 'react';
import { Sparkles, RotateCcw, Shirt, Camera, Check } from 'lucide-react';
import '../styles-public/VirtualTryOn.css';

// Real product inventory available in the rental shop
const SHOP_ITEMS = [
  { 
    id: 'gown1', 
    name: 'Royal Emerald Ballgown', 
    category: 'Gown', 
    image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=500&auto=format&fit=crop&q=60' 
  },
  { 
    id: 'suit1', 
    name: 'Classic Midnight Tuxedo', 
    category: 'Suit', 
    image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' 
  },
  { 
    id: 'gown2', 
    name: 'Golden Champagne Mermaid', 
    category: 'Gown', 
    image: 'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?w=500&auto=format&fit=crop&q=60' 
  },
  { 
    id: 'gown3', 
    name: 'Crimson Velvet Slit Gown', 
    category: 'Gown', 
    image: 'https://images.unsplash.com/photo-1518049360927-18680a142007?w=500&auto=format&fit=crop&q=60' 
  },
];

const VirtualTryOn = () => {
  const [selectedItem, setSelectedItem] = useState(null); // Selected shop item
  const [customerPhoto, setCustomerPhoto] = useState(null); // Uploaded customer image
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [fittedResult, setFittedResult] = useState(null); // Generated model output

  // Handle uploading and reading customer picture
  const handleCustomerPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomerPhoto(reader.result);
        setFittedResult(null); // Reset fitted result if a new image is loaded
      };
      reader.readAsDataURL(file);
    }
  };

  // Triggers the simulated AI virtual try-on rendering pipeline
  const handleGenerateFitting = () => {
    if (!customerPhoto) {
      alert("Please upload your photo first.");
      return;
    }
    if (!selectedItem) {
      alert("Please select a gown or suit from our shop to try on.");
      return;
    }

    setLoading(true);

    // Simulated 2.5-second API latency for the deep learning try-on engine
    setTimeout(() => {
      setLoading(false);
      setFittedResult({
        gownImage: selectedItem.image,
        customerImage: customerPhoto,
        itemName: selectedItem.name
      });
    }, 2500);
  };

  const handleReset = () => {
    setSelectedItem(null);
    setCustomerPhoto(null);
    setFittedResult(null);
  };

  const filteredItems = activeCategory === 'All' 
    ? SHOP_ITEMS 
    : SHOP_ITEMS.filter(item => item.category === activeCategory);

  return (
    <div className="vto-page-container">
      {/* Header */}
      <div className="vto-header">
        <span className="vto-gold-badge"><Sparkles size={14} /> AI Fitting Room v1.0</span>
        <h2>Virtual Try-On Studio</h2>
        <p>Upload your portrait and instantly wear any exquisite gown from Mrs. G's collection with just a single click!</p>
      </div>

      <div className="vto-grid-layout">
        
        {/* Left Side: Interactive Step Controls */}
        <div className="vto-control-panel">
          
          {/* STEP 1: UPLOAD CUSTOMER PHOTO */}
          <div className="vto-section-card">
            <h3>Step 1: Upload Your Photo</h3>
            <p className="section-subtitle">Make sure you upload a clear full-body or half-body portrait.</p>
            
            <div className="vto-upload-zone">
              {customerPhoto ? (
                <div className="uploaded-image-preview">
                  <img src={customerPhoto} alt="Customer Portrait" />
                  <button className="change-photo-btn" onClick={() => { setCustomerPhoto(null); setFittedResult(null); }}>
                    Change Photo
                  </button>
                </div>
              ) : (
                <label className="upload-label-wrapper">
                  <input type="file" accept="image/*" onChange={handleCustomerPhotoUpload} style={{ display: 'none' }} />
                  <div className="upload-placeholder-content">
                    <div className="upload-icon-circle">
                      <Camera size={24} />
                    </div>
                    <span>Upload Your Photo</span>
                    <small>Supports PNG or JPG</small>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* STEP 2: CHOOSE GOWN FROM SHOP */}
          <div className="vto-section-card">
            <h3>Step 2: Choose a Gown from the Shop</h3>
            <div className="vto-filter-tabs">
              {['All', 'Gown', 'Suit'].map((cat) => (
                <button 
                  key={cat} 
                  className={`vto-filter-btn ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="vto-items-carousel">
              {filteredItems.map((item) => (
                <div 
                  key={item.id} 
                  className={`vto-item-card ${selectedItem?.id === item.id ? 'selected' : ''}`}
                  onClick={() => { setSelectedItem(item); setFittedResult(null); }}
                >
                  <div className="item-thumbnail">
                    <img src={item.image} alt={item.name} />
                    {selectedItem?.id === item.id && (
                      <div className="selected-badge">
                        <Check size={12} /> Selected
                      </div>
                    )}
                  </div>
                  <div className="item-details-mini">
                    <h4>{item.name}</h4>
                    <span className="item-tag">{item.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Virtual Mirror Output Area */}
        <div className="vto-canvas-panel">
          <div className="vto-canvas-wrapper">
            <div className="canvas-header">
              <span className="canvas-status">
                <span className="live-indicator"></span> Mrs. G Magic Mirror
              </span>
              {(customerPhoto || selectedItem) && (
                <button className="reset-canvas-btn" onClick={handleReset} title="Reset All">
                  <RotateCcw size={16} />
                </button>
              )}
            </div>

            <div className="canvas-viewport">
              {loading ? (
                /* LOADING RENDER OVERLAY */
                <div className="canvas-loading-overlay">
                  <div className="spinner-gold"></div>
                  <p>Fitting the dress onto your photo...</p>
                  <small>Please wait while the AI magic happens ✨</small>
                </div>
              ) : fittedResult ? (
                /* TRY ON RESULTS PREVIEW */
                <div className="fitting-results-wrapper">
                  <div className="tryon-comparison-view">
                    <div className="compare-box">
                      <img src={fittedResult.gownImage} alt="Shop Catalog Gown" className="final-fitted-image" />
                      <span className="image-label-tag">Mrs. G Gown</span>
                    </div>
                    <div className="compare-box main-tryon">
                      <img src={fittedResult.gownImage} alt="Fitted Result Layout" className="final-fitted-image merged-effect" />
                      <span className="image-label-tag golden-tag">Your Try-On</span>
                    </div>
                  </div>
                  <div className="fitted-success-overlay">
                    <Sparkles size={16} />
                    <span>You look stunning! Fitted: {fittedResult.itemName}</span>
                  </div>
                </div>
              ) : (
                /* EMPTY BASE STATE */
                <div className="canvas-empty-state">
                  <div className="empty-illustration">
                    <Shirt className="shirt-glow-icon" size={48} />
                  </div>
                  <h3>Virtual Fitting Mirror</h3>
                  <p>Upload your portrait on the left panel, select any gown or tuxedo from Mrs. G's collection, and click "Let's Try It On!" below.</p>
                </div>
              )}
            </div>

            {/* GENERATE ACTION BUTTON */}
            <button 
              className="generate-vto-action-btn"
              onClick={handleGenerateFitting}
              disabled={loading || !customerPhoto || !selectedItem}
            >
              <Sparkles size={18} />
              <span>{loading ? 'Generating Try-On...' : "Let's Try It On!"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default VirtualTryOn;