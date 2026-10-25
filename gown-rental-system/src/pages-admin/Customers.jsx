import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import * as XLSX from 'xlsx';
import {
  Search, Plus, X, Trash2, CheckCircle, AlertTriangle,
  User, Calendar, DollarSign, Briefcase, CheckCircle2,
  HandHelping, Banknote, CreditCard, ShieldAlert,
  MessageSquare, Download, RefreshCw, Layers, Crown, Edit3, Tag, Save
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Customers.css';

/* ---------- PRICE HELPERS ---------- */
const addonsTotal = (list) => (list || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
const grossTotal = (b) =>
  (Number(b.rentalPrice) || 0) + (Number(b.petticoatPrice) || 0) + addonsTotal(b.addons);
const netTotal = (b) => Math.max(0, grossTotal(b) - (Number(b.discount) || 0));

const formatCurrency = (amt) => `₱${Number(amt || 0).toLocaleString()}`;

const Customers = () => {
  const [customers, setCustomers]             = useState([]);
  const [gowns, setGowns]                     = useState([]);
  const [petticoats, setPetticoats]           = useState([]);
  const [accessories, setAccessories]         = useState([]);
  const [searchTerm, setSearchTerm]           = useState('');
  const [activeTab, setActiveTab]             = useState('all');
  const [isModalOpen, setIsModalOpen]         = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [partialPayAmt, setPartialPayAmt]     = useState('');
  const [isConfirmingHold, setIsConfirmingHold] = useState(false);
  const [isSwapMode, setIsSwapMode]           = useState(false); // add-ons panel
  const [isEditMode, setIsEditMode]           = useState(false); // edit booking
  const [editForm, setEditForm]               = useState(null);
  const [saving, setSaving]                   = useState(false);

  // ── New booking form state ──
  const emptyForm = {
    name: '', contact: '', gmail: '', facebook: '',
    gownId: '', gownName: '', rentalPrice: 0,
    petticoatId: null, petticoatName: '', petticoatPrice: 0,
    selectedAccessories: [],
    petticoat: 'No', bookingDate: '', reservationDate: '',
    returnDate: '', down: 0, deposit: 0, assistedBy: '',
    commissions: 0, penaltyRate: 500, cancelPenaltyAmt: 200,
    customerMessage: '', discount: 0, discountNote: '',
  };
  const [newCustomer, setNewCustomer] = useState(emptyForm);

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
    discount: row.discount || 0, discountNote: row.discount_note || '',
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

  // I-reload ang gibuksan nga booking human sa usa ka update
  const refreshSelected = async (id) => {
    const { data } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (data) setSelectedBooking(mapBooking(data));
  };

  const closeDetails = () => {
    setSelectedBooking(null);
    setIsSwapMode(false);
    setIsEditMode(false);
    setIsConfirmingHold(false);
    setEditForm(null);
    setPartialPayAmt('');
  };

  // ── NEW RENTAL TOTAL (net sa discount) ──
  const computeTotal = (form) => {
    const gown = Number(form.rentalPrice) || 0;
    const petti = Number(form.petticoatPrice) || 0;
    const acc = (form.selectedAccessories || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
    return Math.max(0, gown + petti + acc - (Number(form.discount) || 0));
  };
  const computeGross = (form) => computeTotal({ ...form, discount: 0 });

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
    const gross = computeGross(newCustomer);
    const discount = Number(newCustomer.discount) || 0;
    if (discount < 0 || discount > gross) return alert('Sayop ang discount. Dili pwede mas dako sa total.');
    const total = gross - discount;
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
      discount, discount_note: newCustomer.discountNote || null,
    }]);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_created', `New booking: ${newCustomer.name} rented ${newCustomer.gownName}${discount > 0 ? ` (discount ₱${discount})` : ''}`);
    fetchAll(); setIsModalOpen(false); resetForm();
  };

  // ── EDIT EXISTING BOOKING ──
  const startEdit = (b) => {
    setEditForm({
      name: b.name || '', contact: b.contact || '', gmail: b.gmail || '',
      reservationDate: b.reservationDate || '', returnDate: b.returnDate || '',
      rentalPrice: b.rentalPrice || 0,
      discount: b.discount || 0, discountNote: b.discountNote || '',
      deposit: b.deposit || 0, penaltyRate: b.penaltyRate || 500,
      commissions: b.commissions || 0, assistedBy: b.assistedBy || '',
    });
    setIsEditMode(true);
    setIsSwapMode(false);
    setIsConfirmingHold(false);
  };

  // Live preview sa pag-edit
  const editPreview = (b, f) => {
    const gross = (Number(f.rentalPrice) || 0) + (Number(b.petticoatPrice) || 0) + addonsTotal(b.addons);
    const discount = Number(f.discount) || 0;
    const net = Math.max(0, gross - discount);
    const prevNet = netTotal(b);
    const paid = Number(b.down) || 0;
    return { gross, discount, net, prevNet, diff: net - prevNet, paid, balance: net - paid };
  };

  const applyPercent = (pct) => {
    if (!selectedBooking || !editForm) return;
    const { gross } = editPreview(selectedBooking, editForm);
    setEditForm({ ...editForm, discount: Math.round((gross * pct) / 100) });
  };

  const handleSaveEdit = async () => {
    const b = selectedBooking;
    const f = editForm;
    if (!f.name.trim()) return alert('Kinahanglan ang pangalan.');
    const p = editPreview(b, f);
    if (p.discount < 0) return alert('Dili pwede negative ang discount.');
    if (p.discount > p.gross) return alert('Mas dako ang discount kaysa total.');

    setSaving(true);
    const { error } = await supabase.from('bookings').update({
      name: f.name.trim(), contact: f.contact, gmail: f.gmail,
      reservation_date: f.reservationDate || null,
      return_date: f.returnDate || null,
      rental_price: Number(f.rentalPrice) || 0,
      discount: p.discount, discount_note: f.discountNote || null,
      deposit: Number(f.deposit) || 0,
      penalty_rate: Number(f.penaltyRate) || 500,
      commissions: Number(f.commissions) || 0,
      assisted_by: f.assistedBy,
      total_rent: p.net, balance: p.balance,
    }).eq('id', b.id);
    setSaving(false);

    if (error) { alert('Error: ' + error.message); return; }

    const changes = [];
    if (p.prevNet !== p.net) changes.push(`total ₱${p.prevNet} → ₱${p.net}`);
    if ((Number(b.discount) || 0) !== p.discount) changes.push(`discount ₱${Number(b.discount) || 0} → ₱${p.discount}${f.discountNote ? ` (${f.discountNote})` : ''}`);
    if ((b.returnDate || '') !== f.returnDate) changes.push(`return date ${b.returnDate || 'N/A'} → ${f.returnDate || 'N/A'}`);
    await logActivity('booking_updated', `Gi-edit ang booking ni ${b.name}${changes.length ? ': ' + changes.join(', ') : ''}`);

    await refreshSelected(b.id);
    setIsEditMode(false);
    setEditForm(null);
    fetchAll();
  };

  // ── SWAP PETTICOAT / ACCESSORIES in existing booking ──
  const handleSwapPetticoat = async (booking, newPetti) => {
    const swapFee = Number(newPetti?.swap_fee || 0);
    const pettiName = newPetti ? `Layer ${newPetti.layer}` : 'None';
    const pettiPrice = Number(newPetti?.price || 0);
    const gross = Number(booking.rentalPrice) + pettiPrice + addonsTotal(booking.addons);
    const newTotal = Math.max(0, gross - (Number(booking.discount) || 0));
    const newBalance = newTotal - Number(booking.down);
    const { error } = await supabase.from('bookings').update({
      petticoat_id: newPetti?.id || null,
      petticoat_price: pettiPrice,
      swap_charges: Number(booking.swapCharges || 0) + swapFee,
      total_rent: newTotal, balance: newBalance,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} swapped petticoat to ${pettiName} (+₱${swapFee} swap fee)`);
    fetchAll();
    await refreshSelected(booking.id);
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
    const gross = Number(booking.rentalPrice) + Number(booking.petticoatPrice || 0) + addonsTotal(newAddons);
    const newTotal = Math.max(0, gross - (Number(booking.discount) || 0));
    const newBalance = newTotal - Number(booking.down);
    const { error } = await supabase.from('bookings').update({
      addons: newAddons, total_rent: newTotal, balance: newBalance,
      swap_charges: Number(booking.swapCharges || 0) + swapFeeAdd,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} ${exists ? 'removed' : 'added'} ${acc.name} addon`);
    fetchAll();
    await refreshSelected(booking.id);
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
    setPartialPayAmt('');
    fetchAll();
    await refreshSelected(booking.id);
  };

  const handlePayPenalty = async (booking) => {
    const pen = booking.penalty || calculatePenalty(booking);
    if (pen <= 0) return alert('No penalty.');
    if (!window.confirm(`Confirm penalty payment of ₱${pen}?`)) return;
    const { error } = await supabase.from('bookings').update({ penalty: 0, penalty_paid: pen, is_penalty_settled: true }).eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('penalty_paid', `₱${pen} penalty by ${booking.name}`);
    closeDetails(); fetchAll();
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
    closeDetails(); fetchAll();
  };

  const handleConfirmOnlineHold = async () => {
    if (!holdData.downpayment || holdData.downpayment <= 0) return alert('Enter downpayment.');
    if (!holdData.returnDate) return alert('Select return date.');
    const total = netTotal(selectedBooking) || Number(selectedBooking.rentalPrice);
    const newDown = Number(holdData.downpayment);
    const willReserve = !!holdData.reservationDate;
    if (willReserve) { const ok = await adjustStock(selectedBooking.gownId, -1); if (!ok) return; }
    const { error } = await supabase.from('bookings').update({
      is_online_hold: false, hold_expires_at: 'Confirmed',
      down: newDown, balance: total - newDown,
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
    closeDetails(); fetchAll();
  };

  const handleDeleteBooking = async (booking) => {
    if (!window.confirm('Delete this record?')) return;
    if (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved') await adjustStock(booking.gownId, 1);
    const { error } = await supabase.from('bookings').delete().eq('id', booking.id);
    if (error) { alert(error.message); return; }
    await logActivity('booking_deleted', `Deleted booking: ${booking.name}`);
    closeDetails(); fetchAll();
  };

  const handleExportExcel = () => {
    const data = filtered.map(c => ({
      Name: c.name, Contact: c.contact, Gmail: c.gmail || '',
      Gown: c.gownName, Status: c.returnStatus,
      'Booking Date': c.bookingDate, 'Return Date': c.returnDate || '',
      'Rental Price': c.rentalPrice, 'Petticoat': c.petticoatPrice > 0 ? `+₱${c.petticoatPrice}` : 'None',
      'Accessories': (c.addons || []).map(a => a.name).join(', ') || 'None',
      'Swap Charges': c.swapCharges || 0,
      Discount: c.discount || 0, 'Discount Note': c.discountNote || '',
      'Total (after discount)': netTotal(c),
      Downpayment: c.down, Deposit: c.deposit, Balance: c.balance,
      Penalty: c.penaltyPaid || 0, Commission: c.commissions,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Bookings');
    XLSX.writeFile(wb, `Bookings_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const resetForm = () => setNewCustomer(emptyForm);

  const filtered = customers.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.contact?.includes(searchTerm);
    const matchTab = activeTab === 'all' || c.returnStatus === activeTab;
    return matchSearch && matchTab;
  });

  const sb = selectedBooking;
  const sbPenalty = sb ? calculatePenalty(sb) : 0;
  const sbNet = sb ? netTotal(sb) : 0;
  const sbBalance = sb ? Number(sb.balance) || 0 : 0;
  const preview = sb && editForm ? editPreview(sb, editForm) : null;

  return (
    <>
      <Header />
      <div className="customers-luxury-container">

        {/* TOP BAR */}
        <div className="customers-top-bar">
          <div className="title-area">
            <h1>Customer Records</h1>
            <p>Track rentals, payments, discounts, and add-ons</p>
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
            <input type="text" placeholder="Search name or contact..." onChange={e => setSearchTerm(e.target.value)} />
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
              <div key={c.id} className="booking-mini-card" onClick={() => { setSelectedBooking(c); setIsSwapMode(false); setIsEditMode(false); setIsConfirmingHold(false); }}>
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
                  <div className="stat-box">
                    <label>{Number(c.balance) < 0 ? 'Refund' : 'Balance'}</label>
                    <span className={Number(c.balance) > 0 ? 'text-danger' : Number(c.balance) < 0 ? 'text-success' : ''}>
                      {formatCurrency(Math.abs(c.balance))}
                    </span>
                  </div>
                  <div className="card-mini-badges">
                    {c.discount > 0 && <div className="discount-mini-badge">−{formatCurrency(c.discount)}</div>}
                    {p > 0 && <div className="penalty-mini-badge">Penalty: {formatCurrency(p)}</div>}
                    {c.swapCharges > 0 && <div className="swap-mini-badge">Swaps: {formatCurrency(c.swapCharges)}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="empty-note">Walay booking nga nakit-an.</p>}
        </div>

        {/* ══════════════════════════════════
            DETAIL MODAL
        ══════════════════════════════════ */}
        {sb && (
          <div className="luxury-modal-overlay" onClick={closeDetails}>
            <div className="luxury-modal-box detail-box" onClick={e => e.stopPropagation()}>

              {/* HEADER */}
              <div className="detail-head">
                <div className="detail-avatar">{sb.name?.charAt(0)}</div>
                <div className="detail-head-info">
                  <h3>{sb.name}</h3>
                  <span>{sb.gownName}</span>
                </div>
                <div className={`badge-status ${sbPenalty > 0 && sb.returnStatus === 'claimed' ? 'overdue' : sb.returnStatus}`}>
                  {sbPenalty > 0 && sb.returnStatus === 'claimed' ? 'OVERDUE' : sb.returnStatus}
                </div>
                {!isEditMode && (
                  <button className="head-icon-btn" title="Edit booking" onClick={() => startEdit(sb)}>
                    <Edit3 size={15} />
                  </button>
                )}
                <button className="close-x" onClick={closeDetails}><X size={16} /></button>
              </div>

              {/* SUMMARY STRIP */}
              <div className="summary-strip">
                <div className="sum-box">
                  <label>Total</label>
                  <span>{formatCurrency(sbNet)}</span>
                </div>
                <div className="sum-box">
                  <label>Paid</label>
                  <span className="text-success">{formatCurrency(sb.down)}</span>
                </div>
                <div className={`sum-box ${sbBalance > 0 ? 'sum-danger' : sbBalance < 0 ? 'sum-refund' : ''}`}>
                  <label>{sbBalance < 0 ? 'Refund' : 'Balance'}</label>
                  <span>{formatCurrency(Math.abs(sbBalance))}</span>
                </div>
              </div>

              <div className="detail-body">

                {/* ========== EDIT MODE ========== */}
                {isEditMode && editForm && preview && (
                  <div className="edit-panel">
                    <h4 className="panel-title"><Edit3 size={13} /> I-edit ang Booking</h4>

                    <div className="edit-grid">
                      <div className="input-grp"><label>Pangalan</label>
                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                      <div className="input-grp"><label>Contact</label>
                        <input type="text" value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} /></div>
                      <div className="input-grp"><label>Gmail</label>
                        <input type="email" value={editForm.gmail} onChange={e => setEditForm({ ...editForm, gmail: e.target.value })} /></div>
                      <div className="input-grp"><label>Assisted By</label>
                        <input type="text" value={editForm.assistedBy} onChange={e => setEditForm({ ...editForm, assistedBy: e.target.value })} /></div>
                      <div className="input-grp"><label>Reservation Date</label>
                        <input type="date" value={editForm.reservationDate} onChange={e => setEditForm({ ...editForm, reservationDate: e.target.value })} /></div>
                      <div className="input-grp"><label>Return Date</label>
                        <input type="date" value={editForm.returnDate} onChange={e => setEditForm({ ...editForm, returnDate: e.target.value })} /></div>
                      <div className="input-grp"><label>Gown Price (₱)</label>
                        <input type="number" min="0" value={editForm.rentalPrice} onChange={e => setEditForm({ ...editForm, rentalPrice: e.target.value })} /></div>
                      <div className="input-grp"><label>Security Deposit (₱)</label>
                        <input type="number" min="0" value={editForm.deposit} onChange={e => setEditForm({ ...editForm, deposit: e.target.value })} /></div>
                      <div className="input-grp"><label>Daily Penalty Rate (₱)</label>
                        <input type="number" min="0" value={editForm.penaltyRate} onChange={e => setEditForm({ ...editForm, penaltyRate: e.target.value })} /></div>
                      <div className="input-grp"><label>Staff Commission (₱)</label>
                        <input type="number" min="0" value={editForm.commissions} onChange={e => setEditForm({ ...editForm, commissions: e.target.value })} /></div>
                    </div>

                    {/* DISCOUNT */}
                    <div className="discount-box">
                      <h4 className="panel-title"><Tag size={13} /> Discount</h4>
                      <div className="edit-grid">
                        <div className="input-grp"><label>Discount Amount (₱)</label>
                          <input type="number" min="0" value={editForm.discount} onChange={e => setEditForm({ ...editForm, discount: e.target.value })} /></div>
                        <div className="input-grp"><label>Rason / Note</label>
                          <input type="text" placeholder="e.g. regular customer, promo" value={editForm.discountNote} onChange={e => setEditForm({ ...editForm, discountNote: e.target.value })} /></div>
                      </div>
                      <div className="quick-discounts">
                        <span>Quick:</span>
                        {[5, 10, 15].map(pct => (
                          <button type="button" key={pct} className="quick-chip" onClick={() => applyPercent(pct)}>{pct}%</button>
                        ))}
                        <button type="button" className="quick-chip clear" onClick={() => setEditForm({ ...editForm, discount: 0, discountNote: '' })}>Clear</button>
                      </div>
                    </div>

                    {/* LIVE PREVIEW */}
                    <div className="edit-preview">
                      <div className="prev-row"><span>Una nga total</span><span>{formatCurrency(preview.prevNet)}</span></div>
                      <div className="prev-row"><span>Subtotal (gown + add-ons)</span><span>{formatCurrency(preview.gross)}</span></div>
                      {preview.discount > 0 && (
                        <div className="prev-row minus"><span>Discount</span><span>−{formatCurrency(preview.discount)}</span></div>
                      )}
                      <div className="prev-row strong"><span>Bag-ong total</span><span>{formatCurrency(preview.net)}</span></div>
                      <div className="prev-row"><span>Nabayad na</span><span>{formatCurrency(preview.paid)}</span></div>
                      <div className={`prev-row strong ${preview.balance < 0 ? 'refund' : preview.balance > 0 ? 'owe' : ''}`}>
                        <span>{preview.balance < 0 ? 'I-refund sa customer' : 'Bag-ong balance'}</span>
                        <span>{formatCurrency(Math.abs(preview.balance))}</span>
                      </div>
                      {preview.diff !== 0 && (
                        <p className={`prev-diff ${preview.diff < 0 ? 'down' : 'up'}`}>
                          {preview.diff < 0
                            ? `Nabawasan ang total og ${formatCurrency(Math.abs(preview.diff))}`
                            : `Nadugang ang total og ${formatCurrency(preview.diff)}`}
                        </p>
                      )}
                    </div>

                    <div className="edit-actions">
                      <button className="btn-edit-cancel" onClick={() => { setIsEditMode(false); setEditForm(null); }}>Cancel</button>
                      <button className="btn-edit-save" onClick={handleSaveEdit} disabled={saving}>
                        <Save size={15} /> {saving ? 'Nag-save...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ========== VIEW MODE ========== */}
                {!isEditMode && (
                  <>
                    <div className="detail-grid">
                      <div className="info-block">
                        <label><User size={13} /> Customer</label>
                        <div className="data-field">
                          <p><strong>{sb.name}</strong></p>
                          <p>📞 {sb.contact}</p>
                          {sb.gmail && <p>✉️ {sb.gmail}</p>}
                          {sb.assistedBy && <p>👤 Assisted: {sb.assistedBy}</p>}
                        </div>
                      </div>

                      <div className="info-block">
                        <label><Calendar size={13} /> Schedule</label>
                        <div className="data-field">
                          <p><strong>Booked:</strong> {sb.bookingDate || 'N/A'}</p>
                          <p><strong>Reserve:</strong> {sb.reservationDate || 'N/A'}</p>
                          <p><strong>Return:</strong> {sb.returnDate || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* PRICE BREAKDOWN (resibo) */}
                    <div className="info-block receipt-block">
                      <label><DollarSign size={13} /> Price Breakdown</label>
                      <div className="receipt">
                        <div className="receipt-row"><span>Gown rental</span><span>{formatCurrency(sb.rentalPrice)}</span></div>
                        {sb.petticoatPrice > 0 && (
                          <div className="receipt-row"><span>🩱 Petticoat</span><span>{formatCurrency(sb.petticoatPrice)}</span></div>
                        )}
                        {(sb.addons || []).map((a, i) => (
                          <div key={i} className="receipt-row"><span>👑 {a.name}</span><span>{formatCurrency(a.price)}</span></div>
                        ))}

                        {sb.discount > 0 && (
                          <>
                            <div className="receipt-row subtotal"><span>Subtotal</span><span>{formatCurrency(grossTotal(sb))}</span></div>
                            <div className="receipt-row minus">
                              <span>
                                Discount
                                {sb.discountNote && <em className="discount-note"> ({sb.discountNote})</em>}
                              </span>
                              <span>−{formatCurrency(sb.discount)}</span>
                            </div>
                          </>
                        )}

                        <div className="receipt-row total"><span>Total</span><span>{formatCurrency(sbNet)}</span></div>
                        <div className="receipt-row"><span>Nabayad na</span><span className="text-success">{formatCurrency(sb.down)}</span></div>
                        <div className={`receipt-row balance ${sbBalance < 0 ? 'refund' : ''}`}>
                          <span>{sbBalance < 0 ? 'I-refund sa customer' : 'Balance'}</span>
                          <span>{formatCurrency(Math.abs(sbBalance))}</span>
                        </div>

                        <div className="receipt-row muted"><span>Security deposit (lain)</span><span>{formatCurrency(sb.deposit)}</span></div>
                        {sb.swapCharges > 0 && (
                          <div className="receipt-row muted"><span>🔄 Swap charges (lain)</span><span>{formatCurrency(sb.swapCharges)}</span></div>
                        )}
                        {sbPenalty > 0 && (
                          <div className="receipt-row penalty"><span>⚠️ Penalty</span><span>{formatCurrency(sbPenalty)}</span></div>
                        )}
                      </div>

                      {sbBalance > 0 && (
                        <div className="partial-pay-input-grp">
                          <input type="number" placeholder="Amount nga bayran" value={partialPayAmt} onChange={e => setPartialPayAmt(e.target.value)} />
                          <button className="btn-pay-small" onClick={() => handleUpdatePayment(sb)}><CreditCard size={13} /> Pay</button>
                        </div>
                      )}
                      {sbBalance < 0 && (
                        <p className="refund-note">Sobra ang bayad sa bag-ong total. I-hatag balik sa customer ang {formatCurrency(Math.abs(sbBalance))}.</p>
                      )}
                    </div>

                    {/* ADD-ONS (collapsible) */}
                    <div className="info-block">
                      <div className="addon-head">
                        <label><RefreshCw size={13} /> Add-ons & Swap</label>
                        <button className="manage-btn" onClick={() => setIsSwapMode(!isSwapMode)}>
                          {isSwapMode ? 'Isira' : 'Manage'}
                        </button>
                      </div>

                      {!isSwapMode && (
                        <div className="addon-summary">
                          <span className="addon-chip chip-petti">🩱 {sb.petticoatPrice > 0 ? `Petticoat ₱${sb.petticoatPrice}` : 'Walay petticoat'}</span>
                          {(sb.addons || []).length === 0
                            ? <span className="addon-chip chip-more">Walay accessories</span>
                            : sb.addons.map((a, i) => <span key={i} className="addon-chip chip-acc">👑 {a.name}</span>)}
                        </div>
                      )}

                      {isSwapMode && (
                        <div className="addon-panel">
                          <p className="addon-group-title">🩱 Petticoat</p>
                          <div className="addon-swap-btns">
                            <button
                              className={`swap-opt-btn ${!sb.petticoatId ? 'active' : ''}`}
                              onClick={() => handleSwapPetticoat(sb, null)}
                            >None</button>
                            {petticoats.map(p => (
                              <button
                                key={p.id}
                                className={`swap-opt-btn ${sb.petticoatId === p.id ? 'active' : ''}`}
                                onClick={() => handleSwapPetticoat(sb, p)}
                              >
                                L{p.layer} {p.price > 0 ? `₱${p.price}` : 'Free'}
                                {p.swap_fee > 0 && sb.petticoatId !== p.id && <span className="swap-fee-tag">+₱{p.swap_fee}</span>}
                              </button>
                            ))}
                          </div>

                          <p className="addon-group-title">👑 Accessories</p>
                          <div className="addon-swap-btns">
                            {accessories.length === 0 && <span className="empty-inline">Wala pay accessories sa inventory.</span>}
                            {accessories.map(acc => {
                              const has = (sb.addons || []).find(a => a.id === acc.id);
                              return (
                                <button
                                  key={acc.id}
                                  className={`swap-opt-btn ${has ? 'active' : ''}`}
                                  onClick={() => handleToggleAddon(sb, acc)}
                                >
                                  {acc.name}
                                  {!has && acc.price > 0 && <span className="swap-fee-tag">₱{acc.price}</span>}
                                  {!has && acc.swap_fee > 0 && <span className="swap-fee-tag">+₱{acc.swap_fee}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ONLINE HOLD */}
                    {sb.isOnlineHold && !isConfirmingHold && (
                      <div className="info-block hold-block">
                        <label><ShieldAlert size={13} /> Online Hold</label>
                        <div className="data-field">
                          <p>{sb.customerMessage || 'No message.'}</p>
                          <button className="btn-confirm-hold-trigger" onClick={() => setIsConfirmingHold(true)}>Confirm & Finalize</button>
                        </div>
                      </div>
                    )}

                    {isConfirmingHold && (
                      <div className="info-block confirm-hold-area">
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
                  </>
                )}
              </div>

              {/* ACTION BUTTONS */}
              {!isEditMode && (
                <div className="modal-action-footer-btns">
                  {sbPenalty > 0 && !sb.isPenaltySettled &&
                   (sb.returnStatus === 'returned' || sb.returnStatus === 'cancelled') && (
                    <button className="act-btn btn-pay-penalty" onClick={() => handlePayPenalty(sb)}><Banknote size={15} /> Pay Penalty</button>
                  )}
                  {sb.returnStatus === 'pending' && !sb.isOnlineHold && (
                    <button className="act-btn btn-claim" onClick={() => handleProcessAction(sb, 'claimed')}><HandHelping size={15} /> Claim Gown</button>
                  )}
                  {sb.returnStatus === 'reserved' && (
                    <>
                      <button className="act-btn btn-claim" onClick={() => handleProcessAction(sb, 'claimed')}><HandHelping size={15} /> Claim</button>
                      <button className="act-btn btn-cancel" onClick={() => handleProcessAction(sb, 'cancelled')}><AlertTriangle size={15} /> Cancel</button>
                    </>
                  )}
                  {sb.returnStatus === 'claimed' && (
                    <button className="act-btn btn-return" onClick={() => handleProcessAction(sb, 'returned')}><CheckCircle size={15} /> Return Gown</button>
                  )}
                  <button className="act-btn btn-delete-full" onClick={() => handleDeleteBooking(sb)}><Trash2 size={15} /> Delete Record</button>
                </div>
              )}
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
                    <div className="input-grp"><label>Booking Date</label><input type="date" required onChange={e => setNewCustomer({...newCustomer, bookingDate: e.target.value})} /></div>
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

                  <div className="running-total-bar">
                    <span>Gown: {formatCurrency(newCustomer.rentalPrice)}</span>
                    {newCustomer.petticoatPrice > 0 && <span>+ Petticoat: {formatCurrency(newCustomer.petticoatPrice)}</span>}
                    {newCustomer.selectedAccessories.map((a, i) => <span key={i}>+ {a.name}: {formatCurrency(a.price)}</span>)}
                    {Number(newCustomer.discount) > 0 && <span className="rt-discount">− Discount: {formatCurrency(newCustomer.discount)}</span>}
                    <strong>Total: {formatCurrency(computeTotal(newCustomer))}</strong>
                  </div>

                  <div className="form-grid-3">
                    <div className="input-grp"><label>Discount (₱)</label><input type="number" min="0" placeholder="0" onChange={e => setNewCustomer({...newCustomer, discount: e.target.value})} /></div>
                    <div className="input-grp" style={{ gridColumn: 'span 2' }}><label>Discount Note</label><input type="text" placeholder="e.g. regular customer" onChange={e => setNewCustomer({...newCustomer, discountNote: e.target.value})} /></div>
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
                  <div className="input-grp" style={{ marginTop: 14 }}><label>Assisted By</label><input type="text" onChange={e => setNewCustomer({...newCustomer, assistedBy: e.target.value})} /></div>
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