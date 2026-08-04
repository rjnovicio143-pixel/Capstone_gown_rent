import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import * as XLSX from 'xlsx';
import {
  Search, Plus, X, Trash2, CheckCircle, AlertTriangle,
  User, Calendar, DollarSign, Briefcase,
  CheckCircle2, HandHelping, Banknote, CreditCard, Mail, ShieldAlert, MessageSquare,
  Download, Link2, Shirt
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Customers.css';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [gowns, setGowns] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [partialPayAmt, setPartialPayAmt] = useState("");

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

  // --- DB ROW (snake_case) -> JS STATE (camelCase) ---
  const mapBookingFromDb = (row) => ({
    id: row.id,
    name: row.name,
    contact: row.contact,
    gmail: row.gmail,
    facebook: row.facebook,
    gownId: row.gown_id,
    gownName: row.gown_name,
    petticoat: row.petticoat,
    bookingDate: row.booking_date,
    reservationDate: row.reservation_date,
    returnDate: row.return_date,
    rentalPrice: row.rental_price,
    down: row.down,
    deposit: row.deposit,
    assistedBy: row.assisted_by,
    commissions: row.commissions,
    claimedStatus: row.claimed_status,
    returnStatus: row.return_status,
    penaltyRate: row.penalty_rate,
    cancelPenaltyAmt: row.cancel_penalty_amt,
    penalty: row.penalty,
    penaltyPaid: row.penalty_paid,
    isPenaltySettled: row.is_penalty_settled,
    isOnlineHold: row.is_online_hold,
    holdExpiresAt: row.hold_expires_at,
    customerMessage: row.customer_message,
    totalRent: row.total_rent,
    balance: row.balance,
    createdAt: row.created_at,
  });

  // --- FETCH ---
  const fetchBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching bookings:", error);
    else setCustomers(data.map(mapBookingFromDb));
  };

  const fetchGowns = async () => {
    const { data, error } = await supabase.from('gowns').select('*');
    if (error) console.error("Error fetching gowns:", error);
    else setGowns(data);
  };

  useEffect(() => {
    fetchBookings();
    fetchGowns();
  }, []);

  const calculatePenalty = (booking) => {
    if (!booking || booking.isPenaltySettled || booking.returnStatus === 'returned' || booking.returnStatus === 'cancelled') {
      return booking.penalty || 0;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rate = Number(booking.penaltyRate) || 500;

    if (booking.returnStatus === 'claimed' && booking.returnDate) {
      const dueDate = new Date(booking.returnDate); dueDate.setHours(0, 0, 0, 0);
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

  // --- STOCK HELPER ---
  // delta = -1 (taking out a gown) or +1 (returning a gown).
  // Blocks the action (returns false) if stock would go below 0.
  const adjustGownStock = async (gownId, delta) => {
    if (!gownId) return true;

    const gown = gowns.find(g => g.id === gownId);
    if (!gown) return true; // gown record missing/deleted, nothing to adjust

    const newStock = (gown.stock || 0) + delta;
    if (newStock < 0) {
      alert(`Wala nay stock ang "${gown.name}". Dili na ma-book pa kini.`);
      return false;
    }

    const { error } = await supabase
      .from('gowns')
      .update({
        stock: newStock,
        status: newStock > 0 ? "Available" : "Out of Stock"
      })
      .eq('id', gownId);

    if (error) {
      console.error("Stock update error:", error);
      alert("Naay sayop sa pag-update sa stock: " + error.message);
      return false;
    }

    return true;
  };

  const handleUpdatePayment = async (booking) => {
    const payAmt = Number(partialPayAmt);
    if (!payAmt || payAmt <= 0) return alert("Please enter a valid amount.");
    if (payAmt > booking.balance) return alert("Payment is more than the remaining balance.");
    if (!window.confirm(`Confirm payment of ₱${payAmt}?`)) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          down: Number(booking.down) + payAmt,
          balance: Number(booking.balance) - payAmt,
        })
        .eq('id', booking.id);

      if (error) throw error;

      await logActivity('payment_received', `Payment of ₱${payAmt} received from ${booking.name} (${booking.gownName})`);

      setPartialPayAmt("");
      setSelectedBooking(null);
      fetchBookings();
    } catch (err) {
      console.error("Payment error:", err);
      alert("Naay sayop sa pag-bayad: " + err.message);
    }
  };

  const handlePayPenalty = async (booking) => {
    const currentPenalty = booking.penalty || calculatePenalty(booking);
    if (currentPenalty <= 0) return alert("No penalty to pay.");
    if (!window.confirm(`Confirm payment of ₱${currentPenalty} penalty?`)) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          penalty: 0,
          penalty_paid: currentPenalty,
          is_penalty_settled: true
        })
        .eq('id', booking.id);

      if (error) throw error;

      await logActivity('penalty_paid', `Penalty of ₱${currentPenalty} paid by ${booking.name} (${booking.gownName})`);

      setSelectedBooking(null);
      fetchBookings();
    } catch (err) {
      console.error("Error paying penalty:", err);
      alert("Naay sayop: " + err.message);
    }
  };

  const handleProcessAction = async (booking, newStatus) => {
    try {
      // Taking the gown out of the rack
      if ((newStatus === 'claimed' || newStatus === 'reserved') && booking.returnStatus === 'pending') {
        const ok = await adjustGownStock(booking.gownId, -1);
        if (!ok) return;
      }

      // Putting the gown back in the rack
      if ((newStatus === 'returned' || newStatus === 'cancelled') && (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved')) {
        await adjustGownStock(booking.gownId, 1);
      }

      let finalPenalty = calculatePenalty(booking);
      if (newStatus === 'cancelled' && booking.returnStatus === 'reserved') {
        finalPenalty = Number(booking.cancelPenaltyAmt) || 200;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          return_status: newStatus,
          penalty: finalPenalty,
          claimed_status: newStatus === 'claimed' ? 'claimed' : (newStatus === 'returned' ? 'claimed' : booking.claimedStatus)
        })
        .eq('id', booking.id);

      if (error) throw error;

      await logActivity('booking_updated', `${booking.name}'s booking for "${booking.gownName}" marked as ${newStatus}`);

      setSelectedBooking(null);
      fetchBookings();
      fetchGowns();
    } catch (err) {
      console.error("Error:", err);
      alert("Naay sayop: " + err.message);
    }
  };

  const handleConfirmOnlineHold = async () => {
    if (!holdUpdateData.downpayment || holdUpdateData.downpayment <= 0) {
      return alert("Please enter downpayment to confirm.");
    }
    if (!holdUpdateData.returnDate) {
      return alert("Please select a returning date.");
    }

    try {
      const rental = Number(selectedBooking.rentalPrice);
      const newDown = Number(holdUpdateData.downpayment);
      const willReserve = !!holdUpdateData.reservationDate;

      if (willReserve) {
        const ok = await adjustGownStock(selectedBooking.gownId, -1);
        if (!ok) return;
      }

      const { error } = await supabase
        .from('bookings')
        .update({
          is_online_hold: false,
          hold_expires_at: "Confirmed",
          down: newDown,
          balance: rental - newDown,
          reservation_date: holdUpdateData.reservationDate || null,
          return_date: holdUpdateData.returnDate,
          deposit: Number(holdUpdateData.deposit),
          petticoat: holdUpdateData.petticoat,
          penalty_rate: Number(holdUpdateData.penaltyRate),
          cancel_penalty_amt: Number(holdUpdateData.cancelPenaltyAmt),
          assisted_by: holdUpdateData.assistedBy,
          return_status: willReserve ? 'reserved' : 'pending'
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      await logActivity('hold_confirmed', `Online hold confirmed for ${selectedBooking.name} (${selectedBooking.gownName})`);

      alert("Online hold confirmed and updated!");
      setIsConfirmingHold(false);
      setSelectedBooking(null);
      fetchBookings();
      fetchGowns();
    } catch (err) {
      console.error("Error confirming hold:", err);
      alert("Naay sayop: " + err.message);
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

      if (initialStatus === 'reserved') {
        const ok = await adjustGownStock(newCustomer.gownId, -1);
        if (!ok) return;
      }

      const { error } = await supabase.from('bookings').insert([{
        name: newCustomer.name,
        contact: newCustomer.contact,
        gmail: newCustomer.gmail,
        facebook: newCustomer.facebook,
        gown_id: newCustomer.gownId,
        gown_name: newCustomer.gownName,
        petticoat: newCustomer.petticoat,
        booking_date: newCustomer.bookingDate,
        reservation_date: newCustomer.reservationDate || null,
        return_date: newCustomer.returnDate || null,
        rental_price: rental,
        down,
        deposit: Number(newCustomer.deposit),
        assisted_by: newCustomer.assistedBy,
        commissions: Number(newCustomer.commissions),
        claimed_status: newCustomer.claimedStatus,
        return_status: initialStatus,
        penalty_rate: Number(newCustomer.penaltyRate),
        cancel_penalty_amt: Number(newCustomer.cancelPenaltyAmt),
        penalty: 0,
        penalty_paid: 0,
        is_penalty_settled: false,
        is_online_hold: false,
        hold_expires_at: newCustomer.holdExpiresAt,
        customer_message: newCustomer.customerMessage,
        total_rent: totalRent,
        balance,
      }]);

      if (error) throw error;

      await logActivity('booking_created', `New booking: ${newCustomer.name} rented ${newCustomer.gownName}`);

      fetchBookings();
      fetchGowns();
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Naay sayop sa pag-save sa booking: " + err.message);
    }
  };

  const handleDeleteBooking = async (booking) => {
    if (!window.confirm("Delete record?")) return;
    try {
      // Return the gown to stock if it was currently held by this booking
      if (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved') {
        await adjustGownStock(booking.gownId, 1);
      }

      const { error } = await supabase.from('bookings').delete().eq('id', booking.id);
      if (error) throw error;

      await logActivity('booking_deleted', `Deleted booking record: ${booking.name} (${booking.gownName})`);

      setSelectedBooking(null);
      fetchBookings();
      fetchGowns();
    } catch (err) {
      console.error(err);
      alert("Naay sayop sa pag-delete: " + err.message);
    }
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

  // --- EXPORT TO EXCEL (gigamit ang kasamtangan nga filter/search) ---
  const handleExportExcel = () => {
    const sheetData = filtered.map(c => ({
      Name: c.name,
      Contact: c.contact,
      Gmail: c.gmail || '',
      Facebook: c.facebook || '',
      Gown: c.gownName,
      Petticoat: c.petticoat,
      Status: c.returnStatus,
      'Booking Date': c.bookingDate || '',
      'Reservation Date': c.reservationDate || '',
      'Return Date': c.returnDate || '',
      'Rental Price': c.rentalPrice,
      Deposit: c.deposit,
      Downpayment: c.down,
      Balance: c.balance,
      'Penalty Rate': c.penaltyRate,
      'Cancel Penalty': c.cancelPenaltyAmt,
      Penalty: c.penalty,
      'Penalty Paid': c.penaltyPaid,
      'Penalty Settled': c.isPenaltySettled ? 'Yes' : 'No',
      Commission: c.commissions,
      'Assisted By': c.assistedBy || '',
      'Online Hold': c.isOnlineHold ? 'Yes' : 'No',
      Notes: c.customerMessage || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Customer_Bookings_${today}.xlsx`);
  };

  return (
    <>
    <Header />
    <div className="customers-luxury-container">
      <div className="customers-top-bar">
        <div className="title-area">
          <h1>Customer Records</h1>
          <p>Track rentals, payments, and commissions</p>
        </div>
        <div className="top-bar-actions">
          <button onClick={handleExportExcel} className="btn-export-sheet"><Download size={18} /> Export to Sheet</button>
          <button onClick={() => setIsModalOpen(true)} className="btn-new-entry"><Plus size={18} /> New Rental Entry</button>
        </div>
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
              <h3><span className="modal-header-icon"><Briefcase size={18} color="#fff"/></span> Rental Full Details</h3>
              <button className="close-x" onClick={() => { setSelectedBooking(null); setIsConfirmingHold(false); }}><X size={16}/></button>
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

                <button className="act-btn btn-delete-full" onClick={() => handleDeleteBooking(selectedBooking)}>
                  <Trash2 size={16}/> Delete Record
                </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="luxury-modal-overlay">
          <div className="luxury-modal-box wide-form">
            <div className="modal-top-header">
              <h3><span className="modal-header-icon"><CheckCircle2 size={18} color="#fff"/></span> New Rental Entry</h3>
              <button className="close-x" onClick={() => setIsModalOpen(false)}><X /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="luxury-form">

              <div className="form-section">
                <h4 className="form-section-title"><User size={14}/> Customer Information</h4>
                <div className="form-grid-2">
                  <div className="input-grp"><label>Customer Name</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} /></div>
                  <div className="input-grp"><label>Contact No.</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, contact: e.target.value})} /></div>
                </div>

                <div className="form-grid-2">
                  <div className="input-grp"><label><Mail size={12}/> Gmail</label><input type="email" placeholder="example@gmail.com" onChange={e => setNewCustomer({...newCustomer, gmail: e.target.value})} /></div>
                  <div className="input-grp"><label><Link2 size={12}/> Facebook Profile/Link</label><input type="text" placeholder="fb.com/username" onChange={e => setNewCustomer({...newCustomer, facebook: e.target.value})} /></div>
                </div>
              </div>

              <div className="form-section">
                <h4 className="form-section-title"><Shirt size={14}/> Gown & Schedule</h4>
                <div className="form-grid-2">
                  <div className="input-grp">
                    <label>Gown Selection</label>
                    <select required value={newCustomer.gownId} onChange={e => {
                      const g = gowns.find(x => String(x.id) === e.target.value);
                      if(g) setNewCustomer({...newCustomer, gownId: g.id, gownName: g.name, rentalPrice: g.price});
                    }}>
                      <option value="">-- Choose Gown --</option>
                      {gowns.filter(g => g.stock > 0).map(g => (<option key={g.id} value={String(g.id)}>{g.name} ({g.stock} left)</option>))}
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
              </div>

              <div className="form-section form-section-gold">
                <h4 className="form-section-title"><DollarSign size={14}/> Financial Details</h4>
                <div className="form-grid-3">
                  <div className="input-grp"><label>Rent Price</label><input type="number" value={newCustomer.rentalPrice} readOnly /></div>
                  <div className="input-grp"><label>Security Deposit</label><input type="number" onChange={e => setNewCustomer({...newCustomer, deposit: e.target.value})} /></div>
                  <div className="input-grp"><label>Downpayment</label><input type="number" required onChange={e => setNewCustomer({...newCustomer, down: e.target.value})} /></div>
                </div>

                <div className="form-grid-3">
                  <div className="input-grp"><label>Daily Penalty Rate</label><input type="number" value={newCustomer.penaltyRate} onChange={e => setNewCustomer({...newCustomer, penaltyRate: e.target.value})} /></div>
                  <div className="input-grp"><label>Cancel Penalty</label><input type="number" value={newCustomer.cancelPenaltyAmt} onChange={e => setNewCustomer({...newCustomer, cancelPenaltyAmt: e.target.value})} /></div>
                  <div className="input-grp"><label>Staff Commission</label><input type="number" onChange={e => setNewCustomer({...newCustomer, commissions: e.target.value})} /></div>
                </div>
              </div>

              <div className="form-section">
                <h4 className="form-section-title"><MessageSquare size={14}/> Notes & Staff</h4>
                <div className="form-grid-1">
                  <div className="input-grp">
                     <label>Customer Message/Note</label>
                     <textarea
                       rows="2"
                       placeholder="Additional instructions or notes..."
                       onChange={e => setNewCustomer({...newCustomer, customerMessage: e.target.value})}
                     ></textarea>
                  </div>
                </div>
                <div className="form-grid-1">
                  <div className="input-grp"><label>Assisted By</label><input type="text" onChange={e => setNewCustomer({...newCustomer, assistedBy: e.target.value})} /></div>
                </div>
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