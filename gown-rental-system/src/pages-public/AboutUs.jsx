import React from 'react';
import { Heart, Sparkles, Award, ShieldCheck } from 'lucide-react';
import '../styles-public/AboutUs.css';

const AboutUs = () => {
  return (
    <div className="about-page-container">
      {/* Hero Section */}
      <div className="about-hero">
        <span className="about-gold-badge"><Sparkles size={14} /> Our Story</span>
        <h2>About Mrs. G Gown Clinic</h2>
        <p>Bringing elegance, confidence, and premium fashion to your most memorable life celebrations.</p>
      </div>

      {/* Main Content Grid */}
      <div className="about-grid">
        <div className="about-text-section">
          <h3>Crafting Timeless Moments</h3>
          <p>
            Founded with a passion for exquisite design and unmatched tailoring, <strong>Mrs. G Gown Clinic</strong> 
            has been helping individuals look and feel their absolute best on their special days. We specialize in 
            premium gown and suit rentals, custom adjustments, and style consultations that cater to your unique personality.
          </p>
          <p>
            We believe that luxury fashion should be accessible. Whether it's a grand wedding, a formal prom, 
            or a high-profile corporate gala, our curated collection of gowns and suits ensures that you stand out with 
            grace, sophistication, and confidence.
          </p>
        </div>
        <div className="about-image-section">
          <img 
            src="https://images.unsplash.com/photo-1518049360927-18680a142007?w=600&auto=format&fit=crop&q=60" 
            alt="Mrs. G Gown Boutique" 
            className="about-showcase-img"
          />
        </div>
      </div>

      {/* Values Section */}
      <div className="about-values-section">
        <h3 className="values-title">Why Choose Mrs. G?</h3>
        <div className="values-grid">
          <div className="value-card">
            <div className="value-icon-box">
              <Award size={24} />
            </div>
            <h4>Premium Quality</h4>
            <p>Every piece in our inventory undergoes rigorous quality checks and preservation care to guarantee perfection.</p>
          </div>

          <div className="value-card">
            <div className="value-icon-box">
              <Heart size={24} />
            </div>
            <h4>Tailored for You</h4>
            <p>Our professional fitting services ensure that your chosen attire conforms beautifully to your unique frame.</p>
          </div>

          <div className="value-card">
            <div className="value-icon-box">
              <ShieldCheck size={24} />
            </div>
            <h4>Trusted Service</h4>
            <p>We pride ourselves on seamless booking, punctual dry-cleaning turnarounds, and reliable reservations.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;