import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Phone, MapPin, Clock, MessageCircle,
  Navigation, ChevronDown, Sparkles
} from 'lucide-react';
import '../styles-public/ContactUs.css';

/* ---------- SHOP DETAILS ----------
   TODO: replace the placeholder values (address, phone, email, Facebook) with the real ones. */
const SHOP = {
  address: 'Villanueva, Misamis Oriental',          // real street address shown on the page
  phoneDisplay: '+0918 242 0619',           // phone number as shown on screen
  phoneLink: '+0918 242 0619',                 // same number without spaces, used for tap-to-call
  email: 'mwauh18z@gmail.com',                // real shop email
  facebook: 'https://www.facebook.com/Mrs.GGownRental', // link to the Facebook page
  hours: [
    { days: 'Monday to Saturday', time: '9:00 AM to 6:00 PM' },
    { days: 'Sunday', time: 'By appointment only' },
  ],
  openDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday, 1 = Monday ... 6 = Saturday
  openFrom: 9,                  // 9:00 AM (24 hour clock)
  openTo: 18,                   // 6:00 PM (24 hour clock)

  // Google Maps (location of Mrs. G Gown Rental)
  mapsLink: 'https://www.google.com/maps/place/Mrs.+G+Gown+Rental/@8.585749,124.7686006,17z/data=!4m6!3m5!1s0x32ffef7042ae94a9:0x791bc833a94f674d!8m2!3d8.585749!4d124.7711755!16s%2Fg%2F11j2z65t92',
  lat: 8.585749,
  lng: 124.7711755,
};

const MAPS_URL = SHOP.mapsLink;                                                                        // opens the shop page
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${SHOP.lat},${SHOP.lng}`; // route from the visitor
const EMBED_URL = `https://www.google.com/maps?q=${SHOP.lat},${SHOP.lng}&z=17&output=embed`;         // map preview

const FAQS = [
  {
    q: 'How do I reserve a gown?',
    a: 'Open any gown, tap Reserve, and send your details. No login is needed. Our team reviews your request and confirms it.',
  },
  {
    q: 'Do I need to pay to reserve online?',
    a: 'No. Online reservations are a free hold. Your online hold is kept for 2 days while our team confirms it. Payment is settled with our staff.',
  },
  {
    q: 'Can I try the gown before renting?',
    a: 'You can preview gowns on our 3D mannequin online, and you are welcome to visit the shop for a fitting.',
  },
  {
    q: 'What happens if I return a gown late?',
    a: 'Late returns may have a daily penalty. Please ask our team for the details when you confirm your booking.',
  },
];

const Contact = () => {
  const navigate = useNavigate();

  const [openFaq, setOpenFaq] = useState(0);

  // Open now / Closed badge, based on the visitor's clock
  const isOpen = useMemo(() => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    return SHOP.openDays.includes(now.getDay()) && hour >= SHOP.openFrom && hour < SHOP.openTo;
  }, []);

  // Fade sections in as they scroll into view
  useEffect(() => {
    const els = document.querySelectorAll('.ct-page [data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('ct-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('ct-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const quickActions = [
    { icon: Phone,         label: 'Call us',    value: SHOP.phoneDisplay, href: `tel:${SHOP.phoneLink}` },
    { icon: MessageCircle, label: 'Message us', value: 'Facebook page',   href: SHOP.facebook,         external: true },
    { icon: Mail,          label: 'Email us',   value: SHOP.email,        href: `mailto:${SHOP.email}` },
    { icon: Navigation,    label: 'Visit us',   value: 'Get directions',  href: DIRECTIONS_URL,        external: true },
  ];

  return (
    <div className="ct-page">

      {/* ── HERO ── */}
      <section className="ct-hero">
        <div className="ct-hero-inner">
          <span className="ct-badge"><Sparkles size={14} /> Get In Touch</span>
          <h1>Contact <span>Us</span></h1>
          <p>
            Questions about bookings, sizes, or rental rates? Message us on our social media, call us, or visit the shop.
          </p>
        </div>
      </section>

      {/* ── QUICK ACTIONS ── */}
      <section className="ct-quick" aria-label="Quick contact">
        {quickActions.map(({ icon: Icon, label, value, href, external }) => (
          <a
            key={label}
            className="ct-quick-card"
            href={href}
            {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            <span className="ct-quick-icon"><Icon size={20} /></span>
            <span className="ct-quick-text">
              <strong>{label}</strong>
              <span>{value}</span>
            </span>
          </a>
        ))}
      </section>

      {/* ── FORM + INFO ── */}
      <section className="ct-wrap ct-main">

        {/* Info */}
        <aside className="ct-card ct-info-card" data-reveal>
          {/* Map preview */}
          <div className="ct-map">
            <iframe
              title="Mrs. G Gown Rental location"
              src={EMBED_URL}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>

          <div className="ct-info-details">
          <div className="ct-card-head">
            <h2>Visit Our Shop</h2>
            <p>Browse and fit our collection in person.</p>
          </div>

          <div className="ct-info-item">
            <span className="ct-info-icon"><MapPin size={18} /></span>
            <div>
              <h4>Address</h4>
              <p>{SHOP.address}</p>
            </div>
          </div>

          <div className="ct-info-item">
            <span className="ct-info-icon"><Clock size={18} /></span>
            <div>
              <h4>
                Store hours
                <span className={`ct-open ${isOpen ? 'on' : 'off'}`}>
                  <span className="ct-open-dot" /> {isOpen ? 'Open now' : 'Closed now'}
                </span>
              </h4>
              {SHOP.hours.map(h => (
                <p key={h.days} className="ct-hours">
                  <span>{h.days}</span>
                  <strong>{h.time}</strong>
                </p>
              ))}
            </div>
          </div>

          <div className="ct-map-actions">
            <a className="ct-btn ct-btn-gold" href={DIRECTIONS_URL} target="_blank" rel="noreferrer">
              <Navigation size={16} /> Get directions
            </a>
            <a className="ct-btn ct-btn-ghost" href={MAPS_URL} target="_blank" rel="noreferrer">
              <MapPin size={16} /> View on Google Maps
            </a>
          </div>
          </div>
        </aside>
      </section>

      {/* ── FAQ ── */}
      <section className="ct-wrap ct-faq-section">
        <div className="ct-section-head" data-reveal>
          <span className="ct-eyebrow">Quick answers</span>
          <h2>Frequently Asked Questions</h2>
        </div>

        <div className="ct-faq" data-reveal>
          {FAQS.map((item, i) => {
            const open = openFaq === i;
            return (
              <div key={item.q} className={`ct-faq-item ${open ? 'open' : ''}`}>
                <button
                  type="button"
                  className="ct-faq-q"
                  onClick={() => setOpenFaq(open ? -1 : i)}
                  aria-expanded={open}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} />
                </button>
                <div className="ct-faq-a"><p>{item.a}</p></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ct-wrap">
        <div className="ct-cta" data-reveal>
          <div className="ct-cta-text">
            <h2>Ready to reserve a gown?</h2>
            <p>Skip the wait. Browse the collection and send a reservation request in minutes.</p>
          </div>
          <button className="ct-btn ct-btn-gold ct-btn-lg" onClick={() => navigate('/gown-suit')}>
            Browse &amp; Reserve
          </button>
        </div>
      </section>

    </div>
  );
};

export default Contact;