import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import * as XLSX from 'xlsx';
import {
  Search, Plus, X, Trash2, CheckCircle, AlertTriangle,
  User, Calendar, DollarSign, Briefcase, CheckCircle2,
  HandHelping, Banknote, CreditCard, Mail, ShieldAlert,
  MessageSquare, Download, RefreshCw, Layers, Crown, Edit3
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Customers.css';

const Customers = () => {
  const [customers, setCustomers]           = useState([]);
  const [gowns, setGowns]                   = useState([]);
  const [petticoats, setPetticoats]         = useState([]);
  const [accessories, setAccessories]       = useState([]);
  const [searchTerm, setSearchTerm]         = useState('');
  const [activeTab, setActiveTab]           = useState('all');
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [partialPayAmt, setPartialPayAmt]   = useState('');
  const [isConfirmingHold, setIsConfirmingHold] = useState(false);
  const [isSwapMode, setIsSwapMode]         = useState(false); // swap addon in details
  const [isEditMode, setIsEditMode]         = useState(false); // edit booking details

  // ── New booking form state ──
  const [newCustomer, setNewCustomer] = useState({
    name: '', contact: '', gmail: '', facebook: '',
    gownId: '', gownName: '', rentalPrice: 0,
    petticoatId: null, petticoatName: '', petticoatPrice: 0,
    selectedAccessories: [],   // [{id, name, price, swap_fee}]
    petticoat: 'No', bookingDate: '', reservationDate: '',
    returnDate: '', down: 0, deposit: 0, assistedBy: '',
    commissions: 0, penaltyRate: 500, cancelPenaltyAmt: 200,
    customerMessage: '',
  });

  const [holdData, setHoldData] = useState({
    downpayment: 0, reservationDate: '', returnDate: '',
    deposit: 0, petticoat: 'No', penaltyRate: 500,
    cancelPenaltyAmt: 200, assistedBy: ''
  });

  // ── DB mapping ──
  const mapBooking = (row) => ({
    id: row.id, name: row.name, contact: row.contact,
    gmail: row.gmail, facebook: row.facebook,
    gownId: row.gown_id, gownName: row.gown_name,
    bookingDate: row.booking_date, reservationDate: row.reservation_date,
    returnDate: row.return_date, rentalPrice: row.rental_price,
    down: row.down, deposit: row.deposit, assistedBy: row.assisted_by,
    commissions: row.commissions, claimedStatus: row.claimed_status,
    returnStatus: row.return_status, penaltyRate: row.penalty_rate,
    cancelPenaltyAmt: row.cancel_penalty_amt, penalty: row.penalty,
    penaltyPaid: row.penalty_paid, isPenaltySettled: row.is_penalty_settled,
    isOnlineHold: row.is_online_hold, holdExpiresAt: row.hold_expires_at,
    customerMessage: row.customer_message, totalRent: row.total_rent,
    balance: row.balance, createdAt: row.created_at,
    petticoatId: row.petticoat_id, petticoatPrice: row.petticoat_price || 0,
    addons: row.addons || [], swapCharges: row.swap_charges || 0,
  });

  // ── FETCH ──
  const fetchAll = async () => {
    const [bRes, gRes, pRes, aRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('gowns').select('*').gt('price', 0),
      supabase.from('petticoats').select('*').order('layer'),
      supabase.from('accessories').select('*').order('category'),
    ]);
    if (!bRes.error) setCustomers(bRes.data.map(mapBooking));
    if (!gRes.error) setGowns(gRes.data);
    if (!pRes.error) setPetticoats(pRes.data);
    if (!aRes.error) setAccessories(aRes.data);
  };

  useEffect(() => { fetchAll(); }, []);

  // ── COMPUTED TOTAL ──
  const computeTotal = (form) => {
    const gown = Number(form.rentalPrice) || 0;
    const petti = Number(form.petticoatPrice) || 0;
    const acc = (form.selectedAccessories || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
    return gown + petti + acc;
  };

  const calculatePenalty = (booking) => {
    if (!booking || booking.isPenaltySettled || booking.returnStatus === 'returned' || booking.returnStatus === 'cancelled') return booking?.penalty || 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const rate = Number(booking.penaltyRate) || 500;
    if (booking.returnStatus === 'claimed' && booking.returnDate) {
      const due = new Date(booking.returnDate); due.setHours(0,0,0,0);
      if (today > due) {
        const days = Math.ceil((today - due) / 86400000);
        let total = 0;
        for (let i = 1; i <= days; i++) total += i > 3 ? rate * 2 : rate;
        return total;
      }
    }
    return 0;
  };

  const adjustStock = async (gownId, delta) => {
    if (!gownId) return true;
    const gown = gowns.find(g => g.id === gownId);
    if (!gown) return true;
    const newStock = (gown.stock || 0) + delta;
    if (newStock < 0) { alert(`Wala nay stock ang "${gown.name}".`); return false; }
    const { error } = await supabase.from('gowns').update({ stock: newStock, status: newStock > 0 ? 'Available' : 'Out of Stock' }).eq('id', gownId);
    if (error) { alert('Stock update error: ' + error.message); return false; }
    return true;
  };

  // ── ADD NEW BOOKING ──
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    const total = computeTotal(newCustomer);
    const down = Number(newCustomer.down);
    const balance = total - down;
    const initialStatus = newCustomer.reservationDate ? 'reserved' : 'pending';
    if (initialStatus === 'reserved') { const ok = await adjustStock(newCustomer.gownId, -1); if (!ok) return; }
    const { error } = await supabase.from('bookings').insert([{
      name: newCustomer.name, contact: newCustomer.contact,
      gmail: newCustomer.gmail, facebook: newCustomer.facebook,
      gown_id: newCustomer.gownId, gown_name: newCustomer.gownName,
      petticoat: newCustomer.petticoat,
      booking_date: newCustomer.bookingDate,
      reservation_date: newCustomer.reservationDate || null,
      return_date: newCustomer.returnDate || null,
      rental_price: Number(newCustomer.rentalPrice),
      down, deposit: Number(newCustomer.deposit),
      assisted_by: newCustomer.assistedBy,
      commissions: Number(newCustomer.commissions),
      claimed_status: 'unclaimed', return_status: initialStatus,
      penalty_rate: Number(newCustomer.penaltyRate),
      cancel_penalty_amt: Number(newCustomer.cancelPenaltyAmt),
      penalty: 0, penalty_paid: 0, is_penalty_settled: false,
      is_online_hold: false, hold_expires_at: 'No Expiry (Admin Booking)',
      customer_message: newCustomer.customerMessage,
      total_rent: total, balance,
      petticoat_id: newCustomer.petticoatId || null,
      petticoat_price: newCustomer.petticoatPrice || 0,
      addons: newCustomer.selectedAccessories,
      swap_charges: 0,
    }]);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_created', `New booking: ${newCustomer.name} rented ${newCustomer.gownName}`);
    fetchAll(); setIsModalOpen(false); resetForm();
  };

  // ── SWAP PETTICOAT / ACCESSORIES in existing booking ──
  const handleSwapPetticoat = async (booking, newPetti) => {
    const swapFee = Number(newPetti?.swap_fee || 0);
    const pettiName = newPetti ? `Layer ${newPetti.layer}` : 'None';
    const pettiPrice = Number(newPetti?.price || 0);
    const oldTotal = Number(booking.rentalPrice) + Number(booking.petticoatPrice) + (booking.addons || []).reduce((s, a) => s + Number(a.price), 0);
    const newTotal = Number(booking.rentalPrice) + pettiPrice + (booking.addons || []).reduce((s, a) => s + Number(a.price), 0);
    const newBalance = newTotal - Number(booking.down);
    const { error } = await supabase.from('bookings').update({
      petticoat_id: newPetti?.id || null,
      petticoat_price: pettiPrice,
      swap_charges: Number(booking.swapCharges || 0) + swapFee,
      total_rent: newTotal, balance: newBalance,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} swapped petticoat to ${pettiName} (+₱${swapFee} swap fee)`);
    fetchAll(); setIsSwapMode(false); setSelectedBooking(null);
  };

  const handleToggleAddon = async (booking, acc) => {
    const current = booking.addons || [];
    const exists = current.find(a => a.id === acc.id);
    let newAddons, swapFeeAdd = 0;
    if (exists) {
      newAddons = current.filter(a => a.id !== acc.id);
    } else {
      newAddons = [...current, { id: acc.id, name: acc.name, price: acc.price, swap_fee: acc.swap_fee }];
      swapFeeAdd = Number(acc.swap_fee || 0);
    }
    const newTotal = Number(booking.rentalPrice) + Number(booking.petticoatPrice || 0) + newAddons.reduce((s, a) => s + Number(a.price), 0);
    const newBalance = newTotal - Number(booking.down);
    const { error } = await supabase.from('bookings').update({
      addons: newAddons, total_rent: newTotal, balance: newBalance,
      swap_charges: Number(booking.swapCharges || 0) + swapFeeAdd,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} ${exists ? 'removed' : 'added'} ${acc.name} addon`);
    fetchAll();
    // Update selected booking locally
    const updated = await supabase.from('bookings').select('*').eq('id', booking.id).single();
    if (updated.data) setSelectedBooking(mapBooking(updated.data));
  };

  // ── PAYMENT ──
  const handleUpdatePayment = async (booking) => {
    const payAmt = Number(partialPayAmt);
    if (!payAmt || payAmt <= 0) return alert('Please enter a valid amount.');
    if (payAmt > booking.balance) return alert('Payment exceeds balance.');
    if (!window.confirm(`Confirm payment of ₱${payAmt}?`)) return;
    const { error } = await supabase.from('bookings').update({ down: Number(booking.down) + payAmt, balance: Number(booking.balance) - payAmt }).eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('payment_received', `₱${payAmt} from ${booking.name}`);
    setPartialPayAmt(''); setSelectedBooking(null); fetchAll();
  };

  const handlePayPenalty = async (booking) => {
    const pen = booking.penalty || calculatePenalty(booking);
    if (pen <= 0) return alert('No penalty.');
    if (!window.confirm(`Confirm penalty payment of ₱${pen}?`)) return;
    const { error } = await supabase.from('bookings').update({ penalty: 0, penalty_paid: pen, is_penalty_settled: true }).eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('penalty_paid', `₱${pen} penalty by ${booking.name}`);
    setSelectedBooking(null); fetchAll();
  };

  const handleProcessAction = async (booking, newStatus) => {
    if ((newStatus === 'claimed' || newStatus === 'reserved') && booking.returnStatus === 'pending') {
      const ok = await adjustStock(booking.gownId, -1); if (!ok) return;
    }
    if ((newStatus === 'returned' || newStatus === 'cancelled') && (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved')) {
      await adjustStock(booking.gownId, 1);
    }
    let finalPenalty = calculatePenalty(booking);
    if (newStatus === 'cancelled' && booking.returnStatus === 'reserved') finalPenalty = Number(booking.cancelPenaltyAmt) || 200;
    const { error } = await supabase.from('bookings').update({
      return_status: newStatus, penalty: finalPenalty,
      claimed_status: newStatus === 'claimed' ? 'claimed' : (newStatus === 'returned' ? 'claimed' : booking.claimedStatus)
    }).eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('booking_updated', `${booking.name} booking marked as ${newStatus}`);
    setSelectedBooking(null); fetchAll();
  };

  const handleConfirmOnlineHold = async () => {
    if (!holdData.downpayment || holdData.downpayment <= 0) return alert('Enter downpayment.');
    if (!holdData.returnDate) return alert('Select return date.');
    const rental = Number(selectedBooking.rentalPrice);
    const newDown = Number(holdData.downpayment);
    const willReserve = !!holdData.reservationDate;
    if (willReserve) { const ok = await adjustStock(selectedBooking.gownId, -1); if (!ok) return; }
    const { error } = await supabase.from('bookings').update({
      is_online_hold: false, hold_expires_at: 'Confirmed',
      down: newDown, balance: rental - newDown,
      reservation_date: holdData.reservationDate || null,
      return_date: holdData.returnDate,
      deposit: Number(holdData.deposit), petticoat: holdData.petticoat,
      penalty_rate: Number(holdData.penaltyRate),
      cancel_penalty_amt: Number(holdData.cancelPenaltyAmt),
      assisted_by: holdData.assistedBy,
      return_status: willReserve ? 'reserved' : 'pending'
    }).eq('id', selectedBooking.id);
    if (error) { alert(error.message); return; }
    await logActivity('hold_confirmed', `Hold confirmed for ${selectedBooking.name}`);
    setIsConfirmingHold(false); setSelectedBooking(null); fetchAll();
  };

  const handleDeleteBooking = async (booking) => {
    if (!window.confirm('Delete this record?')) return;
    if (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved') await adjustStock(booking.gownId, 1);
    const { error } = await supabase.from('bookings').delete().eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('booking_deleted', `Deleted booking: ${booking.name}`);
    setSelectedBooking(null); fetchAll();
  };

  const handleExportExcel = () => {
    const data = filtered.map(c => ({
      Name: c.name, Contact: c.contact, Gmail: c.gmail || '',
      Gown: c.gownName, Status: c.returnStatus,
      'Booking Date': c.bookingDate, 'Return Date': c.returnDate || '',
      'Rental Price': c.rentalPrice, 'Petticoat': c.petticoatPrice > 0 ? `+₱${c.petticoatPrice}` : 'None',
      'Accessories': (c.addons || []).map(a => a.name).join(', ') || 'None',
      'Swap Charges': c.swapCharges || 0,
      Downpayment: c.down, Deposit: c.deposit, Balance: c.balance,
      Penalty: c.penaltyPaid || 0, Commission: c.commissions,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Bookings');
    XLSX.writeFile(wb, `Bookings_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const resetForm = () => {
    setNewCustomer({
      name: '', contact: '', gmail: '', facebook: '',
      gownId: '', gownName: '', rentalPrice: 0,
      petticoatId: null, petticoatName: '', petticoatPrice: 0,
      selectedAccessories: [], petticoat: 'No',
      bookingDate: '', reservationDate: '', returnDate: '',
      down: 0, deposit: 0, assistedBy: '',
      commissions: 0, penaltyRate: 500, cancelPenaltyAmt: 200, customerMessage: '',
    });
  };

  const filtered = customers.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.contact?.includes(searchTerm);
    const matchTab = activeTab === 'all' || c.returnStatus === activeTab;
    return matchSearch && matchTab;
  });

  const formatCurrency = (amt) => `₱${Number(amt || 0).toLocaleString()}`;

  return (
    <>
      <Header />
      <div className="customers-luxury-container">

        {/* TOP BAR */}
        <div className="customers-top-bar">
          <div className="title-area">
            <h1>Customer Records</h1>
            <p>Track rentals, payments, and add-ons</p>
          </div>
          <div className="top-bar-actions">
            <button onClick={handleExportExcel} className="btn-export-sheet"><Download size={16} /> Export</button>
            <button onClick={() => setIsModalOpen(true)} className="btn-new-entry"><Plus size={18} /> New Rental</button>
          </div>
        </div>

        {/* SEARCH + TABS */}
        <div className="search-filter-row-container">
          <div className="search-input-wrapper">
            <Search size={18} className="s-icon" />
            <input type="text" placeholder="Search..." onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-tabs-row">
            {['all','pending','claimed','reserved','returned','cancelled'].map(tab => (
              <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* BOOKING CARDS */}
        <div className="booking-grid">
          {filtered.map(c => {
            const p = calculatePenalty(c);
            const hasAddons = (c.addons || []).length > 0 || c.petticoatPrice > 0;
            return (
              <div key={c.id} className="booking-mini-card" onClick={() => { setSelectedBooking(c); setIsSwapMode(false); setIsEditMode(false); }}>
                <div className="card-top-section">
                  <div className="avatar-gold">{c.name?.charAt(0)}</div>
                  <div className="client-info">
                    <h4>{c.name}</h4>
                    <span>{c.gownName}</span>
                    {hasAddons && (
                      <div className="card-addons-chips">
                        {c.petticoatPrice > 0 && <span className="addon-chip chip-petti">🩱 Petticoat</span>}
                        {(c.addons || []).slice(0,2).map((a,i) => <span key={i} className="addon-chip chip-acc">👑 {a.name}</span>)}
                        {(c.addons || []).length > 2 && <span className="addon-chip chip-more">+{c.addons.length - 2}</span>}
                      </div>
                    )}
                  </div>
                  <div className="status-badges-column">
                    <div className={`badge-status ${p > 0 && c.returnStatus === 'claimed' ? 'overdue' : c.returnStatus}`}>
                      {p > 0 && c.returnStatus === 'claimed' ? 'OVERDUE' : c.returnStatus}
                    </div>
                    {c.isOnlineHold && <div className="badge-hold">HOLDING</div>}
                  </div>
                </div>
                <div className="card-bottom-row">
                  <div className="stat-box"><label>Balance</label><span className={c.balance > 0 ? 'text-danger' : ''}>{formatCurrency(c.balance)}</span></div>
                  {p > 0 && <div className="penalty-mini-badge">Penalty: {formatCurrency(p)}</div>}
                  {c.swapCharges > 0 && <div className="swap-mini-badge">Swaps: {formatCurrency(c.swapCharges)}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════════════════════════
            DETAIL MODAL
        ══════════════════════════════════ */}
        {selectedBooking && (
          <div className="luxury-modal-overlay" onClick={() => { setSelectedBooking(null); setIsSwapMode(false); setIsEditMode(false); }}>
            <div className="luxury-modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-top-header">
                <h3><span className="modal-header-icon"><Briefcase size={16} color="#fff" /></span> Rental Details</h3>
                <button className="close-x" onClick={() => { setSelectedBooking(null); setIsSwapMode(false); setIsEditMode(false); }}><X size={16} /></button>
              </div>

              <div className="modal-info-grid">
                {/* Customer */}
                <div className="info-block">
                  <label><User size={13} /> Customer</label>
                  <div className="data-field">
                    <p><strong>{selectedBooking.name}</strong></p>
                    <p>📞 {selectedBooking.contact}</p>
                    {selectedBooking.gmail && <p>✉️ {selectedBooking.gmail}</p>}
                    {selectedBooking.assistedBy && <p>👤 Assisted: {selectedBooking.assistedBy}</p>}
                  </div>
                </div>

                {/* Schedule */}
                <div className="info-block">
                  <label><Calendar size={13} /> Schedule</label>
                  <div className="data-field">
                    <p><strong>Booked:</strong> {selectedBooking.bookingDate}</p>
                    <p><strong>Reserve:</strong> {selectedBooking.reservationDate || 'N/A'}</p>
                    <p><strong>Return:</strong> {selectedBooking.returnDate || 'N/A'}</p>
                  </div>
                </div>

                {/* Financials */}
                <div className="info-block gold-bg-block">
                  <label><DollarSign size={13} /> Financials</label>
                  <div className="data-field">
                    <p>Gown: {formatCurrency(selectedBooking.rentalPrice)}</p>
                    {selectedBooking.petticoatPrice > 0 && <p>🩱 Petticoat: {formatCurrency(selectedBooking.petticoatPrice)}</p>}
                    {(selectedBooking.addons || []).map((a, i) => <p key={i}>👑 {a.name}: {formatCurrency(a.price)}</p>)}
                    {selectedBooking.swapCharges > 0 && <p className="swap-fee-line">🔄 Swap charges: {formatCurrency(selectedBooking.swapCharges)}</p>}
                    <p>Deposit: {formatCurrency(selectedBooking.deposit)}</p>
                    <p>Paid: {formatCurrency(selectedBooking.down)}</p>
                    <p className="balance-highlighted"><strong>Balance: {formatCurrency(selectedBooking.balance)}</strong></p>
                    {selectedBooking.balance > 0 && (
                      <div className="partial-pay-input-grp">
                        <input type="number" placeholder="Amt" value={partialPayAmt} onChange={e => setPartialPayAmt(e.target.value)} />
                        <button className="btn-pay-small" onClick={() => handleUpdatePayment(selectedBooking)}><CreditCard size={13} /> Pay</button>
                      </div>
                    )}
                    {calculatePenalty(selectedBooking) > 0 && <p className="penalty-text">Penalty: {formatCurrency(calculatePenalty(selectedBooking))}</p>}
                  </div>
                </div>

                {/* Add-ons management */}
                <div className="info-block">
                  <label><RefreshCw size={13} /> Add-ons & Swap</label>
                  <div className="data-field">
                    {/* Current petticoat */}
                    <div className="addon-manage-row">
                      <span className="addon-label">🩱 Petticoat</span>
                      <span className="addon-current">
                        {selectedBooking.petticoatPrice > 0
                          ? `Layer (₱${selectedBooking.petticoatPrice})`
                          : 'None'
                        }
                      </span>
                    </div>

                    {/* Petticoat swap buttons */}
                    <div className="addon-swap-btns">
                      <button
                        className={`swap-opt-btn ${!selectedBooking.petticoatId ? 'active' : ''}`}
                        onClick={() => handleSwapPetticoat(selectedBooking, null)}
                      >None</button>
                      {petticoats.map(p => (
                        <button
                          key={p.id}
                          className={`swap-opt-btn ${selectedBooking.petticoatId === p.id ? 'active' : ''}`}
                          onClick={() => handleSwapPetticoat(selectedBooking, p)}
                        >
                          L{p.layer} {p.price > 0 ? `₱${p.price}` : 'Free'}
                          {p.swap_fee > 0 && selectedBooking.petticoatId !== p.id && <span className="swap-fee-tag">+₱{p.swap_fee}</span>}
                        </button>
                      ))}
                    </div>

                    {/* Accessories */}
                    <div className="addon-manage-row" style={{marginTop: 12}}>
                      <span className="addon-label">👑 Accessories</span>
                    </div>
                    <div className="addon-swap-btns">
                      {accessories.map(acc => {
                        const has = (selectedBooking.addons || []).find(a => a.id === acc.id);
                        return (
                          <button
                            key={acc.id}
                            className={`swap-opt-btn ${has ? 'active' : ''}`}
                            onClick={() => handleToggleAddon(selectedBooking, acc)}
                          >
                            {acc.name}
                            {!has && acc.price > 0 && <span className="swap-fee-tag">₱{acc.price}</span>}
                            {!has && acc.swap_fee > 0 && <span className="swap-fee-tag">+₱{acc.swap_fee}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Online hold confirm */}
                {selectedBooking.isOnlineHold && !isConfirmingHold && (
                  <div className="info-block">
                    <label><ShieldAlert size={13} /> Online Hold</label>
                    <div className="data-field">
                      <p>{selectedBooking.customerMessage || 'No message.'}</p>
                      <button className="btn-confirm-hold-trigger" onClick={() => setIsConfirmingHold(true)}>Confirm & Finalize</button>
                    </div>
                  </div>
                )}

                {isConfirmingHold && (
                  <div className="info-block confirm-hold-area gold-border">
                    <label><CheckCircle2 size={13} /> Complete Information</label>
                    <div className="hold-edit-fields">
                      <div className="input-grp"><label>Downpayment</label><input type="number" onChange={e => setHoldData({...holdData, downpayment: e.target.value})} /></div>
                      <div className="input-grp"><label>Deposit</label><input type="number" onChange={e => setHoldData({...holdData, deposit: e.target.value})} /></div>
                      <div className="input-grp"><label>Reservation Date</label><input type="date" onChange={e => setHoldData({...holdData, reservationDate: e.target.value})} /></div>
                      <div className="input-grp"><label>Return Date</label><input type="date" required onChange={e => setHoldData({...holdData, returnDate: e.target.value})} /></div>
                      <div className="input-grp"><label>Penalty Rate</label><input type="number" defaultValue="500" onChange={e => setHoldData({...holdData, penaltyRate: e.target.value})} /></div>
                      <div className="input-grp"><label>Assisted By</label><input type="text" onChange={e => setHoldData({...holdData, assistedBy: e.target.value})} /></div>
                      <button className="btn-finalize-hold" onClick={handleConfirmOnlineHold}>Save & Confirm</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="modal-action-footer-btns">
                {calculatePenalty(selectedBooking) > 0 && !selectedBooking.isPenaltySettled &&
                 (selectedBooking.returnStatus === 'returned' || selectedBooking.returnStatus === 'cancelled') && (
                  <button className="act-btn btn-pay-penalty" onClick={() => handlePayPenalty(selectedBooking)}><Banknote size={15} /> Pay Penalty</button>
                )}
                {selectedBooking.returnStatus === 'pending' && !selectedBooking.isOnlineHold && (
                  <button className="act-btn btn-claim" onClick={() => handleProcessAction(selectedBooking, 'claimed')}><HandHelping size={15} /> Claim Gown</button>
                )}
                {selectedBooking.returnStatus === 'reserved' && (
                  <>
                    <button className="act-btn btn-claim" onClick={() => handleProcessAction(selectedBooking, 'claimed')}><HandHelping size={15} /> Claim</button>
                    <button className="act-btn btn-cancel" onClick={() => handleProcessAction(selectedBooking, 'cancelled')}><AlertTriangle size={15} /> Cancel</button>
                  </>
                )}
                {selectedBooking.returnStatus === 'claimed' && (
                  <button className="act-btn btn-return" onClick={() => handleProcessAction(selectedBooking, 'returned')}><CheckCircle size={15} /> Return Gown</button>
                )}
                <button className="act-btn btn-delete-full" onClick={() => handleDeleteBooking(selectedBooking)}><Trash2 size={15} /> Delete Record</button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            NEW RENTAL MODAL
        ══════════════════════════════════ */}
        {isModalOpen && (
          <div className="luxury-modal-overlay">
            <div className="luxury-modal-box wide-form">
              <div className="modal-top-header">
                <h3><span className="modal-header-icon"><CheckCircle2 size={16} color="#fff" /></span> New Rental Entry</h3>
                <button className="close-x" onClick={() => setIsModalOpen(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleAddCustomer} className="luxury-form">

                {/* Customer Info */}
                <div className="form-section">
                  <h4 className="form-section-title"><User size={13} /> Customer Information</h4>
                  <div className="form-grid-2">
                    <div className="input-grp"><label>Customer Name</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} /></div>
                    <div className="input-grp"><label>Contact No.</label><input type="text" required onChange={e => setNewCustomer({...newCustomer, contact: e.target.value})} /></div>
                  </div>
                  <div className="form-grid-2">
                    <div className="input-grp"><label>Gmail</label><input type="email" placeholder="example@gmail.com" onChange={e => setNewCustomer({...newCustomer, gmail: e.target.value})} /></div>
                    <div className="input-grp"><label>Facebook</label><input type="text" placeholder="fb.com/username" onChange={e => setNewCustomer({...newCustomer, facebook: e.target.value})} /></div>
                  </div>
                </div>

                {/* Gown & Schedule */}
                <div className="form-section">
                  <h4 className="form-section-title"><Briefcase size={13} /> Gown & Schedule</h4>
                  <div className="form-grid-2">
                    <div className="input-grp">
                      <label>Gown Selection</label>
                      <select required value={newCustomer.gownId}
                        onChange={e => {
                          const g = gowns.find(x => String(x.id) === e.target.value);
                          if (g) setNewCustomer({...newCustomer, gownId: g.id, gownName: g.name, rentalPrice: g.price});
                        }}>
                        <option value="">-- Choose Gown --</option>
                        {gowns.filter(g => g.stock > 0).map(g => <option key={g.id} value={String(g.id)}>{g.name} ({g.stock} left)</option>)}
                      </select>
                    </div>
                    <div className="form-grid-1">
                      <div className="input-grp"><label>Booking Date</label><input type="date" required onChange={e => setNewCustomer({...newCustomer, bookingDate: e.target.value})} /></div>
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="input-grp"><label>Return Date</label><input type="date" required onChange={e => setNewCustomer({...newCustomer, returnDate: e.target.value})} /></div>
                    <div className="input-grp"><label>Reservation Date (Optional)</label><input type="date" onChange={e => setNewCustomer({...newCustomer, reservationDate: e.target.value})} /></div>
                  </div>
                </div>

                {/* Petticoat */}
                <div className="form-section">
                  <h4 className="form-section-title"><Layers size={13} /> Petticoat Layer</h4>
                  <div className="addon-selector-grid">
                    <button type="button"
                      className={`addon-select-btn ${!newCustomer.petticoatId ? 'selected' : ''}`}
                      onClick={() => setNewCustomer({...newCustomer, petticoatId: null, petticoatName: '', petticoatPrice: 0})}>
                      None
                    </button>
                    {petticoats.map(p => (
                      <button type="button" key={p.id}
                        className={`addon-select-btn ${newCustomer.petticoatId === p.id ? 'selected' : ''}`}
                        onClick={() => setNewCustomer({...newCustomer, petticoatId: p.id, petticoatName: `Layer ${p.layer}`, petticoatPrice: p.price})}>
                        Layer {p.layer}
                        {p.price > 0 && <span>+₱{Number(p.price).toLocaleString()}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accessories */}
                {accessories.length > 0 && (
                  <div className="form-section">
                    <h4 className="form-section-title"><Crown size={13} /> Accessories (optional)</h4>
                    <div className="addon-selector-grid">
                      {accessories.map(acc => {
                        const selected = newCustomer.selectedAccessories.find(a => a.id === acc.id);
                        return (
                          <button type="button" key={acc.id}
                            className={`addon-select-btn ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              const list = newCustomer.selectedAccessories;
                              const exists = list.find(a => a.id === acc.id);
                              setNewCustomer({
                                ...newCustomer,
                                selectedAccessories: exists
                                  ? list.filter(a => a.id !== acc.id)
                                  : [...list, { id: acc.id, name: acc.name, price: acc.price, swap_fee: acc.swap_fee }]
                              });
                            }}>
                            {acc.name}
                            {acc.price > 0 && <span>+₱{Number(acc.price).toLocaleString()}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Financial */}
                <div className="form-section form-section-gold">
                  <h4 className="form-section-title"><DollarSign size={13} /> Financial Details</h4>
                  {/* Running total */}
                  <div className="running-total-bar">
                    <span>Gown: {formatCurrency(newCustomer.rentalPrice)}</span>
                    {newCustomer.petticoatPrice > 0 && <span>+ Petticoat: {formatCurrency(newCustomer.petticoatPrice)}</span>}
                    {newCustomer.selectedAccessories.map((a, i) => <span key={i}>+ {a.name}: {formatCurrency(a.price)}</span>)}
                    <strong>Total: {formatCurrency(computeTotal(newCustomer))}</strong>
                  </div>
                  <div className="form-grid-3">
                    <div className="input-grp"><label>Total Rental</label><input type="number" value={computeTotal(newCustomer)} readOnly /></div>
                    <div className="input-grp"><label>Security Deposit</label><input type="number" onChange={e => setNewCustomer({...newCustomer, deposit: e.target.value})} /></div>
                    <div className="input-grp"><label>Downpayment</label><input type="number" required onChange={e => setNewCustomer({...newCustomer, down: e.target.value})} /></div>
                  </div>
                  <div className="form-grid-3">
                    <div className="input-grp"><label>Daily Penalty Rate</label><input type="number" value={newCustomer.penaltyRate} onChange={e => setNewCustomer({...newCustomer, penaltyRate: e.target.value})} /></div>
                    <div className="input-grp"><label>Cancel Penalty</label><input type="number" value={newCustomer.cancelPenaltyAmt} onChange={e => setNewCustomer({...newCustomer, cancelPenaltyAmt: e.target.value})} /></div>
                    <div className="input-grp"><label>Staff Commission</label><input type="number" onChange={e => setNewCustomer({...newCustomer, commissions: e.target.value})} /></div>
                  </div>
                </div>

                {/* Notes */}
                <div className="form-section">
                  <h4 className="form-section-title"><MessageSquare size={13} /> Notes & Staff</h4>
                  <div className="input-grp"><label>Customer Message/Note</label><textarea rows="2" placeholder="Additional notes..." onChange={e => setNewCustomer({...newCustomer, customerMessage: e.target.value})} /></div>
                  <div className="input-grp" style={{marginTop: 14}}><label>Assisted By</label><input type="text" onChange={e => setNewCustomer({...newCustomer, assistedBy: e.target.value})} /></div>
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