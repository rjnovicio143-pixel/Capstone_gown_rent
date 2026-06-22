import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase'; 
import { supabase } from '../supabaseClient'; 
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  ArrowLeft, 
  Send, 
  User, 
  Phone, 
  Mail, 
  MessageSquare,
  AlertTriangle, 
  LogIn
} from 'lucide-react';
import '../styles-public/ReservationForm.css';

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
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Custom authentication modal layout indicator state
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const verifyUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setShowAuthModal(true);
      } else {
        setFormData(prev => ({
          ...prev,
          gmail: session.user.email
        }));
        setCheckingAuth(false);
      }
    };

    verifyUserSession();
  }, []);

  if (!gown) return <div className="p-10">No gown selected. Please go back.</div>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const now = new Date();
      const expiryDate = new Date(now.getTime() + (24 * 60 * 60 * 1000)); 

      const bookingData = {
        name: formData.name,
        contact: formData.contact,
        gmail: formData.gmail, 
        altContact: formData.altContact, 
        customerComment: formData.customerMessage,
        gownId: gown.id,
        gownName: gown.name,
        rentalPrice: Number(gown.price),
        gownImage: gown.image,
        returnStatus: "holding", 
        holdExpiresAt: expiryDate.toISOString(), 
        createdAt: serverTimestamp(),
        down: 0,
        deposit: 0,
        balance: Number(gown.price),
        isOnlineHold: true,
        assistedBy: '',
        commissions: 0,
        penaltyRate: 500, 
        cancelPenaltyAmt: 200, 
        isPenaltySettled: false,
        penalty: 0,
        claimedStatus: 'unclaimed'
      };

      await addDoc(collection(db, "bookings"), bookingData);
      alert(`Gown is now on HOLD! Please visit the physical shop before ${expiryDate.toLocaleTimeString()}.`);
      navigate('/gown-suit');

    } catch (error) {
      console.error(error);
      alert("An error occurred while saving your reservation profile parameters.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="reservation-page">
      {/* ================= MODERN GOLDEN AUTH MODAL OVERLAY ================= */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.75)', 
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#ffffff',
            width: '100%',
            maxWidth: '400px', 
            borderRadius: '16px',
            padding: '32px 24px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #fef3c7',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            {/* ICON INDICATOR */}
            <div style={{
              width: '56px',
              height: '56px',
              background: '#fffbeb',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              border: '2px solid #f59e0b',
              flexShrink: 0
            }}>
              <AlertTriangle size={26} color="#f59e0b" />
            </div>

            {/* HEADER TEXT */}
            <h3 style={{ 
              fontSize: '19px', 
              fontWeight: '700', 
              color: '#1e293b', 
              margin: '0 0 10px 0',
              fontFamily: 'inherit'
            }}>
              Authentication Required
            </h3>
            
            {/* DESCRIPTION BODY */}
            <p style={{ 
              fontSize: '13.5px', 
              color: '#64748b', 
              lineHeight: '1.5', 
              margin: '0 0 24px 0',
              fontFamily: 'inherit'
            }}>
              Please sign in using your <span style={{ fontWeight: '600', color: '#f59e0b' }}>Gmail account</span> before holding a gown to secure your reservation transaction logs.
            </p>

            {/* ACTION BUTTONS WRAPPER */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px',
              width: '100%' 
            }}>
              <button
                onClick={() => navigate('/login')}
                style={{
                  width: '100%', 
                  padding: '12px 20px', 
                  borderRadius: '10px', 
                  background: '#f59e0b',
                  color: '#ffffff', 
                  fontWeight: '600', 
                  fontSize: '14.5px', 
                  border: 'none',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  cursor: 'pointer', 
                  transition: 'background-color 0.2s',
                  boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.2)'
                }}
              >
                <LogIn size={16} />
                <span>Go to Secure Gateway</span>
              </button>

              <button
                onClick={() => navigate(-1)}
                style={{
                  width: '100%', 
                  padding: '11px 20px', 
                  borderRadius: '10px', 
                  background: 'transparent',
                  color: '#64748b', 
                  fontWeight: '600', 
                  fontSize: '13.5px', 
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer', 
                  transition: 'all 0.2s'
                }}
              >
                Cancel & Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ENTIRE FORM INTERFACE CONTAINER */}
      <div className={`res-container ${checkingAuth ? 'form-blur-layer' : ''}`}>
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} /> Back to Gallery
        </button>

        <div className="res-grid">
          {/* GOWN SUMMARY */}
          <div className="res-summary-card">
            <img src={gown.image} alt={gown.name} className="res-gown-img" />
            <div className="res-summary-details">
                <h2>{gown.name}</h2>
                <p className="res-price">₱{Number(gown.price).toLocaleString()}</p>
                <div className="hold-notice">
                    <p><b>HOLD STATUS:</b> Temporary (24 Hours Only)</p>
                    <small>Visit the physical shop to confirm and process the downpayment.</small>
                </div>
            </div>
          </div>

          {/* MAIN INPUT COMPONENT CARD */}
          <div className="res-form-card">
            <h1>Request Temporary Hold</h1>
            <p className="form-help">Your credentials are cross-verified via Google security mesh layers.</p>
            
            <form className="actual-form" onSubmit={handleSubmit}>
              <div className="input-group">
                <label><User size={14}/> Full Name</label>
                <input 
                  type="text" 
                  placeholder="John Doe" 
                  required 
                  disabled={checkingAuth}
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                />
              </div>

              <div className="input-row">
                <div className="input-group">
                  <label><Phone size={14}/> Primary Contact Number</label>
                  <input 
                    type="tel" 
                    placeholder="09123456789"
                    required 
                    disabled={checkingAuth}
                    onChange={(e) => setFormData({...formData, contact: e.target.value})} 
                  />
                </div>
                
                <div className="input-group">
                  <label><Mail size={14}/> Verified Gmail</label>
                  <input 
                    type="email" 
                    value={formData.gmail}
                    readOnly 
                    style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed', fontWeight: '500' }}
                    required 
                  />
                </div>
              </div>

              <div className="input-group">
                <label><Phone size={14}/> Alternative Contact Number</label> 
                <input 
                  type="tel" 
                  placeholder="09987654321 (Secondary line)" 
                  required 
                  disabled={checkingAuth}
                  onChange={(e) => setFormData({...formData, altContact: e.target.value})} 
                />
              </div>

              <div className="input-group">
                <label><MessageSquare size={14}/> Message to Admin (Optional)</label>
                <textarea 
                  placeholder="Write your requests or questions here..."
                  className="res-textarea"
                  rows="4"
                  disabled={checkingAuth}
                  onChange={(e) => setFormData({...formData, customerMessage: e.target.value})}
                ></textarea>
              </div>

              <button type="submit" className="submit-reservation-btn" disabled={isSubmitting || checkingAuth}>
                {isSubmitting ? "Processing..." : "Hold this Gown"} <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationForm;