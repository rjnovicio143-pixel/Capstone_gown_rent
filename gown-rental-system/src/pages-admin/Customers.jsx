import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, onSnapshot, query, orderBy, 
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment 
} from "firebase/firestore";
import { 
  Search, Plus, X, Trash2, FileText, CheckCircle, AlertTriangle,
  Download, User, Tag, Calendar, Clock, DollarSign, Briefcase, 
  CheckCircle2, HandHelping, BookmarkCheck, Banknote, CreditCard, Mail, Globe, ShieldAlert, MessageSquare
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Customers.css';

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [gowns, setGowns] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  
  const [partialPayAmt, setPartialPayAmt] = useState("");
  
  // Updated States for confirming Online Hold with more fields
  const [isConfirmingHold, setIsConfirmingHold] = useState(false);
  const [holdUpdateData, setHoldUpdateData] = useState({
    downpayment: 0,
    reservationDate: '',
    returnDate: '',
    deposit: 0,
    petticoat: 'No',
    penaltyRate: 500,
    cancelPenaltyAmt: 200,
    assistedBy: ''
  });

  const [newCustomer, setNewCustomer] = useState({
    name: '', contact: '', gmail: '', facebook: '', gownId: '', gownName: '', petticoat: 'No',
    bookingDate: '', reservationDate: '', returnDate: '',
    rentalPrice: 0, down: 0, deposit: 0, assistedBy: '', 
    commissions: 0, claimedStatus: 'unclaimed', returnStatus: 'pending',
    penaltyRate: 500, 
    cancelPenaltyAmt: 200, 
    penalty: 0,
    penaltyPaid: 0,
    isPenaltySettled: false,
    isOnlineHold: false, 
    holdExpiresAt: "No Expiry (Admin Booking)",
    customerMessage: "" 
  });

  useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "gowns"), (snapshot) => {
      setGowns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const calculatePenalty = (booking) => {
    if (!booking || booking.isPenaltySettled || booking.returnStatus === 'returned' || booking.returnStatus === 'cancelled') {
        return booking.penalty || 0;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    const rate = Number(booking.penaltyRate) || 500;
    
    if (booking.returnStatus === 'claimed' && booking.returnDate) {
      const dueDate = new Date(booking.returnDate); dueDate.setHours(0,0,0,0);
      if (today > dueDate) {
        const diffDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
        let totalPenalty = 0;
        for (let i = 1; i <= diffDays; i++) {
          if (i > 3) { totalPenalty += (rate * 2); } 
          else { totalPenalty += rate; }
        }
        return totalPenalty;
      }
    }
    return 0;
  };

  const handleUpdatePayment = async (booking) => {
    const payAmt = Number(partialPayAmt);
    if (!payAmt || payAmt <= 0) return alert("Please enter a valid amount.");
    if (payAmt > booking.balance) return alert("Payment is more than the remaining balance.");

    try {
      if(window.confirm(`Confirm payment of ₱${payAmt}?`)) {
        const bookingRef = doc(db, "bookings", booking.id);
        await updateDoc(bookingRef, {
          down: increment(payAmt), 
          balance: increment(-payAmt) 
        });
        setPartialPayAmt(""); 
        setSelectedBooking(null); 
      }
    } catch (err) { console.error("Payment error:", err); }
  };

  const handlePayPenalty = async (booking) => {
    const currentPenalty = booking.penalty || calculatePenalty(booking);
    if (currentPenalty <= 0) return alert("No penalty to pay.");

    try {
      if(window.confirm(`Confirm payment of ₱${currentPenalty} penalty?`)) {
        await updateDoc(doc(db, "bookings", booking.id), {
          penalty: 0,
          penaltyPaid: currentPenalty,
          isPenaltySettled: true 
        });
        setSelectedBooking(null);
      }
    } catch (err) { console.error("Error paying penalty:", err); }
  };

  const handleProcessAction = async (booking, newStatus) => {
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      const gownRef = doc(db, "gowns", booking.gownId);

      if ((newStatus === 'claimed' || newStatus === 'reserved') && booking.returnStatus === 'pending') {
        if(booking.gownId) await updateDoc(gownRef, { stock: increment(-1) });
      }
      if ((newStatus === 'returned' || newStatus === 'cancelled') && (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved')) {
        if(booking.gownId) await updateDoc(gownRef, { stock: increment(1) });
      }

      let finalPenalty = calculatePenalty(booking);
      if (newStatus === 'cancelled' && booking.returnStatus === 'reserved') {
        finalPenalty = Number(booking.cancelPenaltyAmt) || 200; 
      }

      await updateDoc(bookingRef, { 
        returnStatus: newStatus,
        penalty: finalPenalty,
        claimedStatus: newStatus === 'claimed' ? 'claimed' : (newStatus === 'returned' ? 'claimed' : booking.claimedStatus)
      });
      setSelectedBooking(null);
    } catch (err) { console.error("Error:", err); }
  };

  // UPDATED: Logic to finalize Online Hold into a real Booking with all missing fields
  const handleConfirmOnlineHold = async () => {
    if(!holdUpdateData.downpayment || holdUpdateData.downpayment <= 0) {
      return alert("Please enter downpayment to confirm.");
    }
    if(!holdUpdateData.returnDate) {
      return alert("Please select a returning date.");
    }

    try {
      const bookingRef = doc(db, "bookings", selectedBooking.id);
      const rental = Number(selectedBooking.rentalPrice);
      const newDown = Number(holdUpdateData.downpayment);
      
      await updateDoc(bookingRef, {
        isOnlineHold: false,
        holdExpiresAt: "Confirmed",
        down: newDown,
        balance: rental - newDown,
        reservationDate: holdUpdateData.reservationDate,
        returnDate: holdUpdateData.returnDate, // Added
        deposit: Number(holdUpdateData.deposit), // Added
        petticoat: holdUpdateData.petticoat, // Added
        penaltyRate: Number(holdUpdateData.penaltyRate), // Added
        cancelPenaltyAmt: Number(holdUpdateData.cancelPenaltyAmt), // Added
        assistedBy: holdUpdateData.assistedBy,
        returnStatus: holdUpdateData.reservationDate ? 'reserved' : 'pending'
      });

      // Deduct stock if it becomes reserved
      if (holdUpdateData.reservationDate && selectedBooking.gownId) {
        const gownRef = doc(db, "gowns", selectedBooking.gownId);
        await updateDoc(gownRef, { stock: increment(-1) });
      }

      alert("Online hold confirmed and updated!");
      setIsConfirmingHold(false);
      setSelectedBooking(null);
    } catch (err) {
      console.error("Error confirming hold:", err);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    try {
      const rental = Number(newCustomer.rentalPrice);
      const down = Number(newCustomer.down);
      const balance = rental - down;
      const totalRent = rental + Number(newCustomer.deposit);
      const initialStatus = newCustomer.reservationDate ? 'reserved' : 'pending';

      if (initialStatus === 'reserved' && newCustomer.gownId) {
        const gownRef = doc(db, "gowns", newCustomer.gownId);
        await updateDoc(gownRef, { stock: increment(-1) });
      }

      await addDoc(collection(db, "bookings"), { 
        ...newCustomer, 
        returnStatus: initialStatus,
        totalRent, 
        balance, 
        createdAt: serverTimestamp() 
      });
      
      setIsModalOpen(false);
      resetForm();
    } catch (err) { console.error(err); }
  };

  const resetForm = () => {
    setNewCustomer({
      name: '', contact: '', gmail: '', facebook: '', gownId: '', gownName: '', petticoat: 'No',
      bookingDate: '', reservationDate: '', returnDate: '',
      rentalPrice: 0, down: 0, deposit: 0, assistedBy: '', 
      commissions: 0, claimedStatus: 'unclaimed', returnStatus: 'pending',
      penaltyRate: 500, cancelPenaltyAmt: 200, penaltyPaid: 0, isPenaltySettled: false,
      isOnlineHold: false,
      holdExpiresAt: "No Expiry (Admin Booking)",
      customerMessage: ""
    });
  };

  const filtered = customers.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.contact?.includes(searchTerm);
    const matchesTab = activeTab === "all" || c.returnStatus === activeTab;
    return matchesSearch && matchesTab;
  });

  return (
    <>
    <Header />
    <div className="customers-luxury-container">
      <div className="customers-top-bar">
        <div className="title-area">
          <h1>Customer Records</h1>
          <p>Track rentals, payments, and commissions</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-new-entry"><Plus size={18} /> New Rental Entry</button>
      </div>

      <div className="search-filter-row-container">
        <div className="search-input-wrapper">
          <Search size={18} className="s-icon" />
          <input type="text" placeholder="Search..." onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="filter-tabs-row">
          {["all", "pending", "claimed", "reserved", "returned", "cancelled"].map((tab) => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>{tab.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="booking-grid">
        {filtered.map((c) => {
          const p = calculatePenalty(c);
          return (
            <div key={c.id} className="booking-mini-card" onClick={() => setSelectedBooking(c)}>
              <div className="card-top-section">
                <div className="avatar-gold">{c.name?.charAt(0)}</div>
                <div className="client-info"><h4>{c.name}</h4><span>{c.gownName}</span></div>
                <div className="status-badges-column">
                   <div className={`badge-status ${p > 0 && c.returnStatus === 'claimed' ? 'overdue' : c.returnStatus}`}>
                      {p > 0 && c.returnStatus === 'claimed' ? 'OVERDUE' : c.returnStatus}
                   </div>
                   {c.isOnlineHold && <div className="badge-hold">HOLDING</div>}
                </div>
              </div>
              <div className="card-bottom-row">
                <div className="stat-box"><label>Balance</label><span className={c.balance > 0 ? "text-danger" : ""}>₱{c.balance}</span></div>
                {p > 0 && <div className="penalty-mini-badge">Penalty: ₱{p}</div>}
                {c.isPenaltySettled && <div className="settled-badge">Penalty Paid</div>}
              </div>
            </div>
          );
        })}
      </div>

      {selectedBooking && (
        <div className="luxury-modal-overlay" onClick={() => { setSelectedBooking(null); setIsConfirmingHold(false); }}>
          <div className="luxury-modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-top-header">
              <h3><Briefcase size={20} color="#b8860b"/> Rental Full Details</h3>
              <button className="close-x" onClick={() => { setSelectedBooking(null); setIsConfirmingHold(false); }}><X/></button>
            </div>
            
            <div className="modal-info-grid">
              <div className="info-block">
                <label><User size={14}/> Customer & Contact</label>
                <div className="data-field">
                  <p><strong>Name:</strong> {selectedBooking.name}</p>
                  <p><strong>Contact:</strong> {selectedBooking.contact}</p>
                  <p><strong>Gmail:</strong> {selectedBooking.gmail || 'N/A'}</p>
                  <p><strong>Facebook:</strong> {selectedBooking.facebook || 'N/A'}</p>
                  <p><strong>Assisted By:</strong> {selectedBooking.assistedBy || 'N/A'}</p>
                </div>
              </div>

              <div className="info-block">
                <label><ShieldAlert size={14}/> Hold & Security</label>
                <div className="data-field">
                  <p><strong>Online Holding:</strong> {selectedBooking.isOnlineHold ? "YES" : "NO"}</p>
                  <p><strong>Expiration:</strong> {selectedBooking.holdExpiresAt}</p>
                  <p><strong>Message:</strong> {selectedBooking.customerMessage || "No message provided."}</p>
                  
                  {selectedBooking.isOnlineHold && !isConfirmingHold && (
                    <button className="btn-confirm-hold-trigger" onClick={() => setIsConfirmingHold(true)}>
                      Confirm & Finalize Booking
                    </button>
                  )}
                </div>
              </div>

              {/* UPDATED: Complete Edit Form for Online Hold with all missing fields */}
              {isConfirmingHold ? (
                <div className="info-block confirm-hold-area gold-border">
                  <label><CheckCircle2 size={14}/> Complete Information</label>
                  <div className="hold-edit-fields">
                    <div className="input-grp">
                      <label>Downpayment</label>
                      <input type="number" placeholder="Enter amount" onChange={e => setHoldUpdateData({...holdUpdateData, downpayment: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Security Deposit</label>
                      <input type="number" placeholder="Security Deposit" onChange={e => setHoldUpdateData({...holdUpdateData, deposit: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Reservation Date</label>
                      <input type="date" onChange={e => setHoldUpdateData({...holdUpdateData, reservationDate: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Return Date</label>
                      <input type="date" required onChange={e => setHoldUpdateData({...holdUpdateData, returnDate: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Petticoat</label>
                      <select onChange={e => setHoldUpdateData({...holdUpdateData, petticoat: e.target.value})}>
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                    <div className="input-grp">
                      <label>Daily Penalty Rate</label>
                      <input type="number" defaultValue="500" onChange={e => setHoldUpdateData({...holdUpdateData, penaltyRate: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Cancel Penalty</label>
                      <input type="number" defaultValue="200" onChange={e => setHoldUpdateData({...holdUpdateData, cancelPenaltyAmt: e.target.value})} />
                    </div>
                    <div className="input-grp">
                      <label>Assisted By</label>
                      <input type="text" placeholder="Staff Name" onChange={e => setHoldUpdateData({...holdUpdateData, assistedBy: e.target.value})} />
                    </div>
                    <button className="btn-finalize-hold" onClick={handleConfirmOnlineHold}>Save & Remove Expiry</button>
                  </div>
                </div>
              ) : (
                <div className="info-block">
                  <label><Calendar size={14}/> Schedule</label>
                  <div className="data-field">
                    <p><strong>Booking Date:</strong> {selectedBooking.bookingDate}</p>
                    <p><strong>Reservation:</strong> {selectedBooking.reservationDate || 'N/A'}</p>
                    <p><strong>Date Return:</strong> {selectedBooking.returnDate || 'N/A'}</p>
                    <p><strong>Petticoat:</strong> {selectedBooking.petticoat || 'No'}</p>
                  </div>
                </div>
              )}

              <div className="info-block gold-bg-block">
                <label><DollarSign size={14}/> Financials</label>
                <div className="data-field">
                  <p>Rental Price: ₱{selectedBooking.rentalPrice}</p>
                  <p>Security Deposit: ₱{selectedBooking.deposit || 0}</p>
                  <p>Paid (Collected): ₱{selectedBooking.down}</p>
                  <p className="balance-highlighted"><strong>Balance: ₱{selectedBooking.balance}</strong></p>
                  
                  {selectedBooking.balance > 0 && (
                    <div className="partial-pay-input-grp">
                      <input 
                        type="number" 
                        placeholder="Amt" 
                        value={partialPayAmt}
                        onChange={(e) => setPartialPayAmt(e.target.value)}
                        style={{width: '80px'}}
                      />
                      <button className="btn-pay-small" onClick={() => handleUpdatePayment(selectedBooking)}>
                        <CreditCard size={14}/> Pay
                      </button>
                    </div>
                  )}

                  {calculatePenalty(selectedBooking) > 0 && (
                    <p className="penalty-text">Penalty: ₱{calculatePenalty(selectedBooking)}</p>
                  )}
                  {selectedBooking.isPenaltySettled && (
                    <p className="paid-text">Penalty Paid: ₱{selectedBooking.penaltyPaid}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-action-footer-btns">
                {(selectedBooking.returnStatus === 'returned' || selectedBooking.returnStatus === 'cancelled') && 
                 calculatePenalty(selectedBooking) > 0 && !selectedBooking.isPenaltySettled && (
                  <button className="act-btn btn-pay-penalty" onClick={() => handlePayPenalty(selectedBooking)}>
                     <Banknote size={16}/> Pay Penalty
                  </button>
                )}

                {selectedBooking.returnStatus === 'pending' && !selectedBooking.isOnlineHold && (
                   <button className="act-btn btn-claim" onClick={() => handleProcessAction(selectedBooking, 'claimed')}><HandHelping size={16}/> Claim Gown</button>
                )}

                {selectedBooking.returnStatus === 'reserved' && (
                  <>
                    <button className="act-btn btn-claim" onClick={() => handleProcessAction(selectedBooking, 'claimed')}><HandHelping size={16}/> Claim Gown</button>
                    <button className="act-btn btn-cancel" onClick={() => handleProcessAction(selectedBooking, 'cancelled')}><AlertTriangle size={16}/> Cancel Reservation</button>
                  </>
                )}

                {selectedBooking.returnStatus === 'claimed' && (
                  <button className="act-btn btn-return" onClick={() => handleProcessAction(selectedBooking, 'returned')}>
                    <CheckCircle size={16}/> Return Gown
                  </button>
                )}

                <button className="act-btn btn-delete-full" onClick={() => {
                  if(window.confirm("Delete record?")) { deleteDoc(doc(db, "bookings", selectedBooking.id)); setSelectedBooking(null); }
                }}><Trash2 size={16}/> Delete Record</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="luxury-modal-overlay">
          <div className="luxury-modal-box wide-form">
            <div className="modal-top-header">
              <h3><CheckCircle2 size={20} color="#b8860b"/> New Rental Entry</h3>
              <button onClick={() => setIsModalOpen(false)}><X /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="luxury-form">
              <div className="form-grid-2">
                <div className="input-grp"><label>Customer Name</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} /></div>
                <div className="input-grp"><label>Contact No.</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, contact: e.target.value})} /></div>
              </div>
              
              <div className="form-grid-2">
                <div className="input-grp"><label><Mail size={12}/> Gmail</label><input type="email" placeholder="example@gmail.com" onChange={e => setNewCustomer({...newCustomer, gmail: e.target.value})} /></div>
                <div className="input-grp"><label> Facebook Profile/Link</label><input type="text" placeholder="fb.com/username" onChange={e => setNewCustomer({...newCustomer, facebook: e.target.value})} /></div>
              </div>

              <div className="form-grid-2">
                <div className="input-grp">
                  <label>Gown Selection</label>
                  <select required onChange={e => {
                    const g = gowns.find(x => x.id === e.target.value);
                    if(g) setNewCustomer({...newCustomer, gownId: g.id, gownName: g.name, rentalPrice: g.price});
                  }}>
                    <option value="">-- Choose Gown --</option>
                    {gowns.filter(g => g.stock > 0).map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}
                  </select>
                </div>
                <div className="input-grp"><label>Petticoat</label>
                  <select onChange={e => setNewCustomer({...newCustomer, petticoat: e.target.value})}>
                    <option value="No">No</option><option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-3">
                <div className="input-grp"><label>Booking Date</label><input type="date" required onChange={e => setNewCustomer({...newCustomer, bookingDate: e.target.value})} /></div>
                <div className="input-grp"><label>Return Date</label><input type="date" required onChange={e => setNewCustomer({...newCustomer, returnDate: e.target.value})} /></div>
                <div className="input-grp"><label>Reservation Date (Optional)</label><input type="date" onChange={e => setNewCustomer({...newCustomer, reservationDate: e.target.value})} /></div>
              </div>

              <div className="form-grid-3">
                <div className="input-grp"><label>Rent Price</label><input type="number" value={newCustomer.rentalPrice} readOnly /></div>
                <div className="input-grp"><label>Security Deposit</label><input type="number" onChange={e => setNewCustomer({...newCustomer, deposit: e.target.value})} /></div>
                <div className="input-grp"><label>Downpayment</label><input type="number" required onChange={e => setNewCustomer({...newCustomer, down: e.target.value})} /></div>
              </div>

              <div className="form-grid-1">
                <div className="input-grp">
                   <label><MessageSquare size={12}/> Customer Message/Note</label>
                   <textarea 
                     rows="2" 
                     placeholder="Additional instructions or notes..." 
                     onChange={e => setNewCustomer({...newCustomer, customerMessage: e.target.value})}
                   ></textarea>
                </div>
              </div>

              <div className="form-grid-3">
                <div className="input-grp"><label>Daily Penalty Rate</label><input type="number" value={newCustomer.penaltyRate} onChange={e => setNewCustomer({...newCustomer, penaltyRate: e.target.value})} /></div>
                <div className="input-grp"><label>Cancel Penalty</label><input type="number" value={newCustomer.cancelPenaltyAmt} onChange={e => setNewCustomer({...newCustomer, cancelPenaltyAmt: e.target.value})} /></div>
                <div className="input-grp"><label>Staff Commission</label><input type="number" onChange={e => setNewCustomer({...newCustomer, commissions: e.target.value})} /></div>
              </div>

              <div className="form-grid-1">
                <div className="input-grp"><label>Assisted By</label><input type="text" onChange={e => setNewCustomer({...newCustomer, assistedBy: e.target.value})} /></div>
              </div>
              <button type="submit" className="btn-confirm-gold-large">Confirm Rental</button>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default Customers;