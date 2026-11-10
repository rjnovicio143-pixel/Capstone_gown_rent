import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  ArrowLeft, Send, User, Phone, Mail,
  MessageSquare, CheckCircle, Clock, Layers, Crown, AlertCircle
} from 'lucide-react';
import '../styles-public/ReservationForm.css';

const HOLD_DAYS = 2;                         // how long a pencil booking is kept
const COOLDOWN_MS = 60 * 1000;               // wait time between two reservations from this browser
const COOLDOWN_KEY = 'mrs_g_last_reservation';
const MAX_MESSAGE = 500;
const SHOW_DEBUG = true;                      // TEMPORARY: shows the technical error under the message. Set to false when everything works.

const ReservationForm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { gown } = location.state || {};

  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    gmail: '',
    altContact: '',
    customerMessage: '',
    website: '',          // honeypot (named hp_company_ref on the page so browsers do not autofill it)
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted]       = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');

  // Package included with the gown (petticoat + accessories)
  const [pkg, setPkg]               = useState({ petticoat: null, accessories: [] });
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgError, setPkgError]     = useState('');

  // Load the gown package from the database
  useEffect(() => {
    if (!gown?.id) return;

    const loadPackage = async () => {
      setPkgLoading(true);
      setPkgError('');

      const [gRes, pRes, aRes] = await Promise.all([
        supabase.from('gowns').select('petticoat_layer, included_accessories').eq('id', gown.id).single(),
        supabase.from('petticoats').select('*'),
        supabase.from('accessories').select('*'),
      ]);

      if (gRes.error || pRes.error || aRes.error) {
        console.error(gRes.error || pRes.error || aRes.error);
        setPkgError('Could not load the gown package. Please refresh the page.');
        setPkgLoading(false);
        return;
      }

      const layer = gRes.data?.petticoat_layer;
      const accessoryIds = gRes.data?.included_accessories || [];

      const petticoat = layer
        ? (pRes.data || []).find(p => Number(p.layer) === Number(layer)) || null
        : null;
      const accessories = (aRes.data || []).filter(a => accessoryIds.includes(a.id));

      setPkg({ petticoat, accessories });
      setPkgLoading(false);
    };

    loadPackage();
  }, [gown?.id]);

  // No gown selected fallback
  if (!gown) {
    return (
      <div className="rf-no-gown">
        <p>No gown selected.</p>
        <button onClick={() => navigate(-1)}>← Go Back</button>
      </div>
    );
  }

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pkgLoading || pkgError || isSubmitting) return;
    setErrorMsg('');

    // Honeypot: a real person never sees this field. Pretend it worked so bots learn nothing.
    if (formData.website) { setSubmitted(true); return; }

    // Clean up the values
    const name    = formData.name.trim();
    const contact = formData.contact.replace(/[\s-]/g, '');
    const alt     = formData.altContact.replace(/[\s-]/g, '');
    const gmail   = formData.gmail.trim().toLowerCase();

    if (name.length < 2) { setErrorMsg('Please enter your full name.'); return; }
    if (!/^(09|\+639)\d{9}$/.test(contact)) { setErrorMsg('Please enter a valid mobile number, for example 09123456789.'); return; }
    if (alt && !/^(09|\+639)\d{9}$/.test(alt)) { setErrorMsg('The alternative contact must also be a valid mobile number.'); return; }

    // Cooldown on this browser (the database has its own check too)
    try {
      const last = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
      const wait = COOLDOWN_MS - (Date.now() - last);
      if (wait > 0) {
        setErrorMsg(`Please wait ${Math.ceil(wait / 1000)} seconds before sending another reservation.`);
        return;
      }
    } catch { /* localStorage may be blocked; the database check still applies */ }

    setIsSubmitting(true);

    try {
      const now        = new Date();
      const expiryDate = new Date(now.getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000);
      const gownPrice  = Number(gown.price);

      const { error } = await supabase.from('bookings').insert([{
        name:               name,
        contact:            contact,
        gmail:              gmail,
        facebook:           alt,                   // reusing altContact as secondary
        customer_message:   formData.customerMessage.trim(),
        gown_id:            gown.id,
        gown_name:          gown.name,
        rental_price:       gownPrice,
        return_status:      'pending',
        hold_expires_at:    expiryDate.toISOString(),
        is_online_hold:     true,
        down:               0,
        deposit:            0,
        total_rent:         gownPrice,
        balance:            gownPrice,
        assisted_by:        '',
        commissions:        0,
        penalty_rate:       500,
        cancel_penalty_amt: 200,
        is_penalty_settled: false,
        penalty:            0,
        penalty_paid:       0,
        claimed_status:     'unclaimed',
        swap_charges:       0,

        // Package included with the gown: price is 0 because it is already part of the gown price
        petticoat:          pkg.petticoat ? 'Yes' : 'No',
        petticoat_id:       pkg.petticoat?.id || null,
        petticoat_price:    0,
        addons: pkg.accessories.map(a => ({
          id: a.id,
          name: a.name,
          price: 0,
          swap_fee: Number(a.swap_fee) || 0,
          included: true,
        })),
      }]);

      if (error) throw error;

      try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* ignore */ }
      setSubmitted(true);
    } catch (error) {
      console.error(error);
      // Messages raised by the database checks (code P0001) are written for customers, so show them as they are
      setErrorMsg(
        error?.code === 'P0001' && error.message
          ? error.message
          : 'Something went wrong while submitting. Please try again.'
            + (SHOW_DEBUG ? ` [${error?.code || 'no code'}] ${error?.message || ''}` : '')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── SUCCESS SCREEN ──
  if (submitted) {
    return (
      <div className="rf-success-page">
        <div className="rf-success-card">
          <div className="rf-success-icon">
            <CheckCircle size={48} color="#22c55e" />
          </div>
          <h2>Reservation Submitted!</h2>
          <p>
            Your hold request for <strong>{gown.name}</strong> has been sent.
            Our admin will review and confirm your reservation soon.
            Your hold is kept for {HOLD_DAYS} days.
          </p>
          <div className="rf-success-note">
            <Clock size={16} />
            <span>Please wait for a confirmation from our team before visiting the shop.</span>
          </div>
          <button className="rf-back-btn-success" onClick={() => navigate('/gown-suit')}>
            Browse More Gowns
          </button>
        </div>
      </div>
    );
  }

  const hasPackage = pkg.petticoat || pkg.accessories.length > 0;

  return (
    <div className="rf-page">
      {/* ── BACK BUTTON ── */}
      <button className="rf-back" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Back to Gallery
      </button>

      <div className="rf-grid">

        {/* ── LEFT: GOWN SUMMARY ── */}
        <div className="rf-summary">
          <div className="rf-gown-img-wrap">
            {gown.image
              ? <img src={gown.image} alt={gown.name} />
              : <div className="rf-no-img">👗</div>
            }
          </div>
          <div className="rf-gown-details">
            <span className="rf-gown-cat">{gown.category}</span>
            <h2 className="rf-gown-name">{gown.name}</h2>
            <p className="rf-gown-price">₱{Number(gown.price).toLocaleString()}</p>
            {gown.size && <p className="rf-gown-size">Size: {gown.size}</p>}
          </div>

          {/* Included package */}
          <div className="rf-package">
            <h4>Included in this gown</h4>
            {pkgLoading ? (
              <p className="rf-package-empty">Loading...</p>
            ) : pkgError ? (
              <p className="rf-package-error">{pkgError}</p>
            ) : hasPackage ? (
              <div className="rf-package-list">
                {pkg.petticoat && (
                  <span className="rf-package-chip petti">
                    <Layers size={12} /> Petticoat Layer {pkg.petticoat.layer}
                  </span>
                )}
                {pkg.accessories.map(a => (
                  <span key={a.id} className="rf-package-chip acc">
                    <Crown size={12} /> {a.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rf-package-empty">Gown only (no petticoat or accessories included).</p>
            )}
          </div>

          <div className="rf-hold-notice">
            <Clock size={15} />
            <div>
              <strong>Pencil Booking</strong>
              <span>Admin will confirm your reservation. No payment required yet. Your hold is kept for {HOLD_DAYS} days.</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: FORM ── */}
        <div className="rf-form-card">
          <div className="rf-form-header">
            <h1>Request a Reservation</h1>
            <p>Fill in your details and our admin will get back to you.</p>
          </div>

          <form className="rf-form" onSubmit={handleSubmit}>

            <div className="rf-field">
              <label><User size={13} /> Full Name</label>
              <input
                type="text"
                placeholder="e.g. Maria Santos"
                required
                maxLength={80}
                autoComplete="name"
                value={formData.name}
                onChange={handleChange('name')}
              />
            </div>

            <div className="rf-row">
              <div className="rf-field">
                <label><Phone size={13} /> Contact Number</label>
                <input
                  type="tel"
                  placeholder="09XXXXXXXXX"
                  required
                  maxLength={16}
                  autoComplete="tel"
                  value={formData.contact}
                  onChange={handleChange('contact')}
                />
              </div>
              <div className="rf-field">
                <label><Phone size={13} /> Alternative Contact</label>
                <input
                  type="tel"
                  placeholder="09XXXXXXXXX (optional)"
                  maxLength={16}
                  value={formData.altContact}
                  onChange={handleChange('altContact')}
                />
              </div>
            </div>

            <div className="rf-field">
              <label><Mail size={13} /> Gmail Address</label>
              <input
                type="email"
                placeholder="example@gmail.com"
                value={formData.gmail}
                onChange={handleChange('gmail')}
              />
            </div>

            <div className="rf-field">
              <label><MessageSquare size={13} /> Message to Admin <span className="rf-optional">(optional)</span></label>
              <textarea
                placeholder="Write your requests, preferred date, or questions here..."
                rows="4"
                maxLength={MAX_MESSAGE}
                value={formData.customerMessage}
                onChange={handleChange('customerMessage')}
              />
              <span className="rf-count">{formData.customerMessage.length}/{MAX_MESSAGE}</span>
            </div>

            {/* Honeypot (hidden from people) */}
            <div className="rf-hp" aria-hidden="true">
              <label>Leave this empty
                <input
                  type="text"
                  name="hp_company_ref"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.website}
                  onChange={handleChange('website')}
                />
              </label>
            </div>

            {errorMsg && (
              <div className="rf-error" role="alert">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="rf-submit"
              disabled={isSubmitting || pkgLoading || !!pkgError}
            >
              {isSubmitting
                ? <><span className="rf-spinner" /> Submitting...</>
                : <><Send size={16} /> Submit Reservation</>
              }
            </button>

          </form>
        </div>
      </div>
    </div>
  );
};

export default ReservationForm;