import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/activityLogger';
import * as XLSX from 'xlsx';
import {
  Search, Plus, X, Trash2, CheckCircle, AlertTriangle,
  User, Calendar, DollarSign, Briefcase, CheckCircle2,
  HandHelping, CreditCard, ShieldAlert,
  MessageSquare, Download, RefreshCw, Layers, Crown, Edit3, Tag, Save, Package
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/Customers.css';

/* ---------- PRICE HELPERS ---------- */
const addonsTotal = (list) => (list || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
const grossTotal = (b) =>
  (Number(b.rentalPrice) || 0) + (Number(b.petticoatPrice) || 0) + addonsTotal(b.addons);
const netTotal = (b) => Math.max(0, grossTotal(b) - (Number(b.discount) || 0));

const formatCurrency = (amt) => `₱${Number(amt || 0).toLocaleString()}`;

// An online hold that is still waiting for a downpayment has no balance yet
const isAwaiting = (b) => !!b?.isOnlineHold && b?.returnStatus === 'pending';

/* ---------- PENALTY HELPERS ----------
   While a gown is claimed and late, the penalty grows every day:
   days 1 to 3 cost the daily rate, every day after that costs double.
   The amount already paid is always subtracted, so nothing is charged twice. */
const accruedPenalty = (b) => {
  if (!b || b.returnStatus !== 'claimed' || !b.returnDate) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(b.returnDate); due.setHours(0, 0, 0, 0);
  if (today <= due) return 0;

  const rate = Number(b.penaltyRate) || 500;
  const days = Math.ceil((today - due) / 86400000);
  let total = 0;
  for (let i = 1; i <= days; i++) total += i > 3 ? rate * 2 : rate;
  return total;
};

// Penalty that is still unpaid
const calculatePenalty = (b) => {
  if (!b) return 0;
  if (b.returnStatus === 'claimed') {
    if (b.isPenaltySettled) return 0; // older records
    return Math.max(0, accruedPenalty(b) - (Number(b.penaltyPaid) || 0));
  }
  return Number(b.penalty) || 0; // returned or cancelled: the stored unpaid amount
};

const isOverdue = (b) => b?.returnStatus === 'claimed' && accruedPenalty(b) > 0;

const Customers = () => {
  const [customers, setCustomers]               = useState([]);
  const [gowns, setGowns]                       = useState([]);
  const [petticoats, setPetticoats]             = useState([]);
  const [accessories, setAccessories]           = useState([]);
  const [searchTerm, setSearchTerm]             = useState('');
  const [activeTab, setActiveTab]               = useState('all');
  const [isModalOpen, setIsModalOpen]           = useState(false);
  const [selectedBooking, setSelectedBooking]   = useState(null);
  const [partialPayAmt, setPartialPayAmt]       = useState('');
  const [penaltyPayAmt, setPenaltyPayAmt]       = useState('');
  const [isConfirmingHold, setIsConfirmingHold] = useState(false);
  const [isSwapMode, setIsSwapMode]             = useState(false); // add-ons panel
  const [isEditMode, setIsEditMode]             = useState(false); // edit booking
  const [editForm, setEditForm]                 = useState(null);
  const [saving, setSaving]                     = useState(false);

  // ── New booking form state ──
  const emptyForm = {
    name: '', contact: '', gmail: '', facebook: '',
    gownId: '', gownName: '', rentalPrice: 0,
    petticoatId: null, petticoatName: '', petticoatPrice: 0,
    selectedAccessories: [],
    bookingDate: '', reservationDate: '',
    returnDate: '', down: 0, deposit: 0, assistedBy: '',
    commissions: 0, penaltyRate: 500, cancelPenaltyAmt: 200,
    customerMessage: '', discount: 0, discountNote: '',
  };
  const [newCustomer, setNewCustomer] = useState(emptyForm);

  const [holdData, setHoldData] = useState({
    downpayment: 0, reservationDate: '', returnDate: '',
    deposit: 0, penaltyRate: 500,
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
    cancelReason: row.cancel_reason || '',
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

  // Reload the currently opened booking after an update
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
    setPenaltyPayAmt('');
  };

  /* ---------- GOWN PACKAGE HELPERS ----------
     A gown can include a petticoat layer and some accessories.
     Included items cost 0. Only upgrades or extras are charged.
     IDs are compared as strings so "1" and 1 still match. */
  const gownById = (id) => gowns.find(g => String(g.id) === String(id));

  const includedPettiOf = (gown) =>
    gown?.petticoat_layer
      ? petticoats.find(p => Number(p.layer) === Number(gown.petticoat_layer)) || null
      : null;

  const includedAccsOf = (gown) => {
    const ids = (gown?.included_accessories || []).map(String);
    return accessories.filter(a => ids.includes(String(a.id)));
  };

  // Price of a petticoat for a gown: only the difference from the included layer is charged
  const pettiPriceFor = (gown, petti) => {
    if (!petti) return 0;
    const included = includedPettiOf(gown);
    return Math.max(0, (Number(petti.price) || 0) - (Number(included?.price) || 0));
  };

  const toAddon = (acc, included) => ({
    id: acc.id,
    name: acc.name,
    price: included ? 0 : (Number(acc.price) || 0),
    swap_fee: Number(acc.swap_fee) || 0,
    included: !!included,
  });

  // ── NEW RENTAL TOTAL (net of discount) ──
  const computeTotal = (form) => {
    const gown = Number(form.rentalPrice) || 0;
    const petti = Number(form.petticoatPrice) || 0;
    const acc = (form.selectedAccessories || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
    return Math.max(0, gown + petti + acc - (Number(form.discount) || 0));
  };
  const computeGross = (form) => computeTotal({ ...form, discount: 0 });

  /* ---------- STOCK + FIRST-DOWNPAYMENT RULE ----------
     Online holds never take stock and never expire.
     The gown is secured when a downpayment is confirmed (stock goes down).
     When the stock reaches 0, all other online holds for that gown are cancelled. */

  // Reads the latest stock from the database so two admins cannot oversell a gown
  const adjustStock = async (gownId, delta) => {
    if (!gownId) return true;

    const { data: gown, error: readError } = await supabase
      .from('gowns').select('name, stock').eq('id', gownId).single();
    if (readError || !gown) return true;

    const newStock = (Number(gown.stock) || 0) + delta;
    if (newStock < 0) { alert(`No stock left for "${gown.name}".`); return false; }

    const { error } = await supabase
      .from('gowns')
      .update({ stock: newStock, status: newStock > 0 ? 'Available' : 'Out of Stock' })
      .eq('id', gownId);
    if (error) { alert('Stock update error: ' + error.message); return false; }
    return true;
  };

  const cancelCompetingHolds = async (gownId) => {
    if (!gownId) return 0;

    const { data: gown, error } = await supabase
      .from('gowns').select('stock').eq('id', gownId).single();
    if (error || !gown || Number(gown.stock) > 0) return 0;

    const { data, error: updateError } = await supabase
      .from('bookings')
      .update({
        return_status: 'cancelled',
        is_online_hold: false,
        cancel_reason: 'The gown was taken by a customer who paid the downpayment first.',
      })
      .eq('gown_id', gownId)
      .eq('is_online_hold', true)
      .eq('return_status', 'pending')
      .select('id');

    if (updateError) { console.error(updateError); return 0; }
    return data?.length || 0;
  };

  const notifyCancelled = (count) => {
    if (count > 0) {
      alert(`${count} other online hold${count === 1 ? ' was' : 's were'} cancelled because this gown is now taken.`);
    }
  };

  // ── NEW RENTAL: pick a gown and auto-apply its package ──
  const handleGownSelect = (e) => {
    const g = gowns.find(x => String(x.id) === e.target.value);
    if (!g) return;
    const petti = includedPettiOf(g);
    setNewCustomer(prev => ({
      ...prev,
      gownId: g.id,
      gownName: g.name,
      rentalPrice: g.price,
      petticoatId: petti?.id || null,
      petticoatName: petti ? `Layer ${petti.layer}` : '',
      petticoatPrice: 0,
      selectedAccessories: includedAccsOf(g).map(a => toAddon(a, true)),
    }));
  };

  const handleFormPetticoat = (petti) => {
    const gown = gownById(newCustomer.gownId);
    setNewCustomer(prev => ({
      ...prev,
      petticoatId: petti?.id || null,
      petticoatName: petti ? `Layer ${petti.layer}` : '',
      petticoatPrice: pettiPriceFor(gown, petti),
    }));
  };

  const toggleFormAccessory = (acc) => {
    const gown = gownById(newCustomer.gownId);
    const included = includedAccsOf(gown).some(a => a.id === acc.id);
    setNewCustomer(prev => {
      const list = prev.selectedAccessories;
      const exists = list.find(a => a.id === acc.id);
      return {
        ...prev,
        selectedAccessories: exists
          ? list.filter(a => a.id !== acc.id)
          : [...list, toAddon(acc, included)],
      };
    });
  };

  // ── ADD NEW BOOKING ──
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    const gross = computeGross(newCustomer);
    const discount = Number(newCustomer.discount) || 0;
    if (discount < 0 || discount > gross) return alert('Invalid discount. It cannot be greater than the total.');
    const total = gross - discount;
    const down = Number(newCustomer.down);
    const balance = total - down;
    const initialStatus = newCustomer.reservationDate ? 'reserved' : 'pending';
    if (initialStatus === 'reserved') { const ok = await adjustStock(newCustomer.gownId, -1); if (!ok) return; }
    const { error } = await supabase.from('bookings').insert([{
      name: newCustomer.name, contact: newCustomer.contact,
      gmail: newCustomer.gmail, facebook: newCustomer.facebook,
      gown_id: newCustomer.gownId, gown_name: newCustomer.gownName,
      petticoat: newCustomer.petticoatId ? 'Yes' : 'No',
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
    if (error) {
      alert('Error: ' + error.message);
      if (initialStatus === 'reserved') await adjustStock(newCustomer.gownId, 1); // undo the stock change
      return;
    }

    // A reserved booking takes the stock, so other online holds may have to be cancelled
    let cancelledHolds = 0;
    if (initialStatus === 'reserved') cancelledHolds = await cancelCompetingHolds(newCustomer.gownId);

    await logActivity('booking_created', `New booking: ${newCustomer.name} rented ${newCustomer.gownName}${discount > 0 ? ` (discount ₱${discount})` : ''}`);
    notifyCancelled(cancelledHolds);
    fetchAll(); setIsModalOpen(false); resetForm();
  };

  // ── EDIT EXISTING BOOKING ──
  const startEdit = (b) => {
    if (b.returnStatus === 'cancelled') return; // cancelled bookings are locked
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

  // Live preview while editing
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
    if (!f.name.trim()) return alert('Name is required.');
    const p = editPreview(b, f);
    if (p.discount < 0) return alert('Discount cannot be negative.');
    if (p.discount > p.gross) return alert('Discount cannot be greater than the total.');

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
    await logActivity('booking_updated', `Edited booking of ${b.name}${changes.length ? ': ' + changes.join(', ') : ''}`);

    await refreshSelected(b.id);
    setIsEditMode(false);
    setEditForm(null);
    fetchAll();
  };

  // ── SWAP PETTICOAT in an existing booking ──
  const handleSwapPetticoat = async (booking, newPetti) => {
    if ((booking.petticoatId || null) === (newPetti?.id || null)) return; // nothing changed

    const gown = gownById(booking.gownId);
    const includedPetti = includedPettiOf(gown);
    const pettiPrice = pettiPriceFor(gown, newPetti);
    // No swap fee when going back to the included layer
    const swapFee = newPetti && includedPetti?.id !== newPetti.id ? Number(newPetti.swap_fee || 0) : 0;
    const pettiName = newPetti ? `Layer ${newPetti.layer}` : 'None';

    const gross = Number(booking.rentalPrice) + pettiPrice + addonsTotal(booking.addons);
    const newTotal = Math.max(0, gross - (Number(booking.discount) || 0));
    const newBalance = newTotal - Number(booking.down);

    const { error } = await supabase.from('bookings').update({
      petticoat: newPetti ? 'Yes' : 'No',
      petticoat_id: newPetti?.id || null,
      petticoat_price: pettiPrice,
      swap_charges: Number(booking.swapCharges || 0) + swapFee,
      total_rent: newTotal, balance: newBalance,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} changed petticoat to ${pettiName}${pettiPrice > 0 ? ` (+₱${pettiPrice})` : ''}${swapFee > 0 ? ` (swap fee ₱${swapFee})` : ''}`);
    fetchAll();
    await refreshSelected(booking.id);
  };

  // ── ADD / REMOVE ACCESSORY in an existing booking ──
  const handleToggleAddon = async (booking, acc) => {
    const gown = gownById(booking.gownId);
    const included = includedAccsOf(gown).some(a => a.id === acc.id);
    const current = booking.addons || [];
    const exists = current.find(a => String(a.id) === String(acc.id));

    const newAddons = exists
      ? current.filter(a => String(a.id) !== String(acc.id))
      : [...current, toAddon(acc, included)];
    const swapFeeAdd = !exists && !included ? Number(acc.swap_fee || 0) : 0;

    const gross = Number(booking.rentalPrice) + Number(booking.petticoatPrice || 0) + addonsTotal(newAddons);
    const newTotal = Math.max(0, gross - (Number(booking.discount) || 0));
    const newBalance = newTotal - Number(booking.down);
    const { error } = await supabase.from('bookings').update({
      addons: newAddons, total_rent: newTotal, balance: newBalance,
      swap_charges: Number(booking.swapCharges || 0) + swapFeeAdd,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `${booking.name} ${exists ? 'removed' : 'added'} ${acc.name}`);
    fetchAll();
    await refreshSelected(booking.id);
  };

  // ── APPLY THE GOWN PACKAGE to an existing booking (for older bookings) ──
  const handleApplyPackage = async (booking) => {
    const gown = gownById(booking.gownId);
    const petti = includedPettiOf(gown);
    const incAccs = includedAccsOf(gown);
    if (!petti && incAccs.length === 0) return alert('This gown has no included package.');

    const current = booking.addons || [];
    const missing = incAccs
      .filter(a => !current.some(c => String(c.id) === String(a.id)))
      .map(a => toAddon(a, true));
    const newAddons = [...current, ...missing];

    const applyPetti = !!petti && !booking.petticoatId;
    const pettiId = applyPetti ? petti.id : (booking.petticoatId || null);
    const pettiPrice = applyPetti ? 0 : Number(booking.petticoatPrice || 0);

    const gross = Number(booking.rentalPrice) + pettiPrice + addonsTotal(newAddons);
    const newTotal = Math.max(0, gross - (Number(booking.discount) || 0));
    const newBalance = newTotal - Number(booking.down);

    const { error } = await supabase.from('bookings').update({
      petticoat: pettiId ? 'Yes' : 'No',
      petticoat_id: pettiId,
      petticoat_price: pettiPrice,
      addons: newAddons,
      total_rent: newTotal, balance: newBalance,
    }).eq('id', booking.id);
    if (error) { alert('Error: ' + error.message); return; }
    await logActivity('booking_updated', `Applied included package of "${booking.gownName}" to ${booking.name}`);
    fetchAll();
    await refreshSelected(booking.id);
  };

  // ── PAYMENT (balance of a confirmed booking) ──
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

  // ── PENALTY PAYMENT (full or partial, while claimed or after return/cancel) ──
  const handlePayPenalty = async (booking) => {
    const owed = calculatePenalty(booking);
    const payAmt = Number(penaltyPayAmt);

    if (owed <= 0) return alert('There is no unpaid penalty.');
    if (!payAmt || payAmt <= 0) return alert('Please enter a valid amount.');
    if (payAmt > owed) return alert(`The amount is more than the unpaid penalty (${formatCurrency(owed)}).`);
    if (!window.confirm(`Confirm penalty payment of ${formatCurrency(payAmt)}?`)) return;

    const stillClaimed = booking.returnStatus === 'claimed';
    const remaining = owed - payAmt;

    const { error } = await supabase.from('bookings').update({
      penalty_paid: (Number(booking.penaltyPaid) || 0) + payAmt,
      // While claimed, the penalty is calculated live, so only returned or cancelled bookings keep a stored amount
      penalty: stillClaimed ? 0 : remaining,
      is_penalty_settled: stillClaimed ? false : remaining <= 0,
    }).eq('id', booking.id);
    if (error) { alert(error.message); return; }

    await logActivity('penalty_paid', `₱${payAmt} penalty from ${booking.name}${remaining > 0 ? ` (₱${remaining} still unpaid)` : ''}`);
    setPenaltyPayAmt('');
    fetchAll();
    await refreshSelected(booking.id);
  };

  const handleProcessAction = async (booking, newStatus) => {
    // Warn before returning a gown that still has an unpaid penalty
    if (newStatus === 'returned') {
      const owed = calculatePenalty(booking);
      if (owed > 0 && !window.confirm(
        `This booking has an unpaid penalty of ${formatCurrency(owed)}.\n\nMark it as returned anyway? You can still collect the penalty afterwards.`
      )) return;
    }

    const takesStock =
      (newStatus === 'claimed' || newStatus === 'reserved') && booking.returnStatus === 'pending';

    if (takesStock) {
      const ok = await adjustStock(booking.gownId, -1); if (!ok) return;
    }
    if ((newStatus === 'returned' || newStatus === 'cancelled') && (booking.returnStatus === 'claimed' || booking.returnStatus === 'reserved')) {
      await adjustStock(booking.gownId, 1);
    }

    // Unpaid penalty at this moment (computed from the old status, before it changes)
    let finalPenalty = calculatePenalty(booking);
    if (newStatus === 'cancelled' && booking.returnStatus === 'reserved') finalPenalty = Number(booking.cancelPenaltyAmt) || 200;

    const fullyPaid = finalPenalty <= 0 && Number(booking.penaltyPaid) > 0;

    const { error } = await supabase.from('bookings').update({
      return_status: newStatus,
      penalty: finalPenalty,
      is_penalty_settled: fullyPaid || booking.isPenaltySettled,
      claimed_status: newStatus === 'claimed' ? 'claimed' : (newStatus === 'returned' ? 'claimed' : booking.claimedStatus)
    }).eq('id', booking.id);
    if (error) { alert(error.message); return; }

    // A pending booking that is now claimed or reserved took the stock
    let cancelledHolds = 0;
    if (takesStock) cancelledHolds = await cancelCompetingHolds(booking.gownId);

    await logActivity('booking_updated', `${booking.name} booking marked as ${newStatus}`);
    notifyCancelled(cancelledHolds);
    closeDetails(); fetchAll();
  };

  // ── CONFIRM AN ONLINE HOLD (the first downpayment gets the gown) ──
  const handleConfirmOnlineHold = async () => {
    if (!holdData.downpayment || Number(holdData.downpayment) <= 0) return alert('Enter the downpayment.');
    if (!holdData.returnDate) return alert('Select the return date.');

    const total = netTotal(selectedBooking) || Number(selectedBooking.rentalPrice);
    const newDown = Number(holdData.downpayment);
    if (newDown > total) return alert('The downpayment cannot be greater than the total.');

    // Paying the downpayment secures the gown
    const ok = await adjustStock(selectedBooking.gownId, -1);
    if (!ok) return;

    const { error } = await supabase.from('bookings').update({
      is_online_hold: false, hold_expires_at: 'Confirmed',
      down: newDown, balance: total - newDown,
      reservation_date: holdData.reservationDate || null,
      return_date: holdData.returnDate,
      deposit: Number(holdData.deposit),
      penalty_rate: Number(holdData.penaltyRate),
      cancel_penalty_amt: Number(holdData.cancelPenaltyAmt),
      assisted_by: holdData.assistedBy,
      return_status: 'reserved',
    }).eq('id', selectedBooking.id);

    if (error) {
      alert(error.message);
      await adjustStock(selectedBooking.gownId, 1); // undo the stock change
      return;
    }

    const cancelled = await cancelCompetingHolds(selectedBooking.gownId);
    await logActivity(
      'hold_confirmed',
      `Hold confirmed for ${selectedBooking.name}${cancelled > 0 ? ` (${cancelled} other hold${cancelled === 1 ? '' : 's'} cancelled)` : ''}`
    );
    notifyCancelled(cancelled);
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
    const data = filtered.map(c => {
      const petti = petticoats.find(p => p.id === c.petticoatId);
      const pettiLabel = c.petticoatId
        ? `${petti ? `Layer ${petti.layer}` : 'Yes'}${c.petticoatPrice > 0 ? ` (+₱${c.petticoatPrice})` : ' (included)'}`
        : 'None';
      const noBalance = isAwaiting(c) || c.returnStatus === 'cancelled';
      return {
        Name: c.name, Contact: c.contact, Gmail: c.gmail || '',
        Gown: c.gownName, Status: isAwaiting(c) ? 'pending (awaiting downpayment)' : c.returnStatus,
        'Booking Date': c.bookingDate, 'Return Date': c.returnDate || '',
        'Rental Price': c.rentalPrice, Petticoat: pettiLabel,
        Accessories: (c.addons || []).map(a => `${a.name}${Number(a.price) > 0 ? ` (+₱${a.price})` : ' (included)'}`).join(', ') || 'None',
        'Swap Charges': c.swapCharges || 0,
        Discount: c.discount || 0, 'Discount Note': c.discountNote || '',
        'Total (after discount)': netTotal(c),
        Downpayment: c.down, Deposit: c.deposit,
        Balance: noBalance ? '' : c.balance,
        'Penalty Paid': c.penaltyPaid || 0,
        'Penalty Unpaid': calculatePenalty(c),
        Commission: c.commissions,
        'Cancel Reason': c.cancelReason || '',
      };
    });
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

  /* ---------- DERIVED VALUES ---------- */
  const sb = selectedBooking;
  const sbPenalty = sb ? calculatePenalty(sb) : 0;
  const sbOverdue = isOverdue(sb);
  const sbNet = sb ? netTotal(sb) : 0;
  const sbBalance = sb ? Number(sb.balance) || 0 : 0;
  const sbAwaiting = isAwaiting(sb);
  const sbCancelled = sb?.returnStatus === 'cancelled';
  const preview = sb && editForm ? editPreview(sb, editForm) : null;

  // Other customers still holding the same gown (online holds waiting for a downpayment)
  const sbCompetitors = sb && sbAwaiting
    ? customers.filter(c =>
        isAwaiting(c) &&
        String(c.gownId) === String(sb.gownId) &&
        c.id !== sb.id
      ).length
    : 0;

  // Package of the gown in the opened booking
  const sbGown = sb ? gownById(sb.gownId) : null;
  const sbIncPetti = includedPettiOf(sbGown);
  const sbIncAccs = includedAccsOf(sbGown);
  const sbHasPackage = !!sbIncPetti || sbIncAccs.length > 0;
  const sbPackageMissing = sb && sbHasPackage && (
    (!!sbIncPetti && !sb.petticoatId) ||
    sbIncAccs.some(a => !(sb.addons || []).some(x => String(x.id) === String(a.id)))
  );
  const sbPetti = sb ? petticoats.find(p => p.id === sb.petticoatId) : null;

  // Package of the gown in the New Rental form
  const formGown = gownById(newCustomer.gownId);
  const formIncPetti = includedPettiOf(formGown);
  const formIncAccs = includedAccsOf(formGown);

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
            const hasAddons = (c.addons || []).length > 0 || !!c.petticoatId;
            const awaiting = isAwaiting(c);
            const cancelled = c.returnStatus === 'cancelled';
            const overdue = isOverdue(c);
            return (
              <div key={c.id} className="booking-mini-card" onClick={() => { setSelectedBooking(c); setIsSwapMode(false); setIsEditMode(false); setIsConfirmingHold(false); }}>
                <div className="card-top-section">
                  <div className="avatar-gold">{c.name?.charAt(0)}</div>
                  <div className="client-info">
                    <h4>{c.name}</h4>
                    <span>{c.gownName}</span>
                    {hasAddons && (
                      <div className="card-addons-chips">
                        {c.petticoatId && <span className="addon-chip chip-petti">🩱 Petticoat</span>}
                        {(c.addons || []).slice(0,2).map((a,i) => <span key={i} className="addon-chip chip-acc">👑 {a.name}</span>)}
                        {(c.addons || []).length > 2 && <span className="addon-chip chip-more">+{c.addons.length - 2}</span>}
                      </div>
                    )}
                  </div>
                  <div className="status-badges-column">
                    <div className={`badge-status ${overdue ? 'overdue' : c.returnStatus}`}>
                      {overdue ? 'OVERDUE' : c.returnStatus}
                    </div>
                    {c.isOnlineHold && <div className="badge-hold">HOLDING</div>}
                  </div>
                </div>

                <div className="card-bottom-row">
                  {awaiting ? (
                    <div className="stat-box">
                      <label>Total</label>
                      <span>{formatCurrency(netTotal(c))}</span>
                      <small className="stat-sub">Awaiting downpayment</small>
                    </div>
                  ) : cancelled ? (
                    <div className="stat-box">
                      <label>Paid</label>
                      <span className="text-muted">{Number(c.down) > 0 ? formatCurrency(c.down) : 'No payment'}</span>
                    </div>
                  ) : (
                    <div className="stat-box">
                      <label>{Number(c.balance) < 0 ? 'Refund' : 'Balance'}</label>
                      <span className={Number(c.balance) > 0 ? 'text-danger' : Number(c.balance) < 0 ? 'text-success' : ''}>
                        {formatCurrency(Math.abs(c.balance))}
                      </span>
                    </div>
                  )}
                  <div className="card-mini-badges">
                    {c.discount > 0 && <div className="discount-mini-badge">−{formatCurrency(c.discount)}</div>}
                    {p > 0 && <div className="penalty-mini-badge">Penalty: {formatCurrency(p)}</div>}
                    {c.swapCharges > 0 && <div className="swap-mini-badge">Swaps: {formatCurrency(c.swapCharges)}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="empty-note">No bookings found.</p>}
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
                <div className={`badge-status ${sbOverdue ? 'overdue' : sb.returnStatus}`}>
                  {sbOverdue ? 'OVERDUE' : sb.returnStatus}
                </div>
                {!isEditMode && !sbCancelled && (
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
                  <span className={Number(sb.down) > 0 ? 'text-success' : 'text-muted'}>{formatCurrency(sb.down)}</span>
                </div>
                {sbAwaiting ? (
                  <div className="sum-box sum-wait">
                    <label>Status</label>
                    <span>Awaiting downpayment</span>
                  </div>
                ) : sbCancelled ? (
                  <div className="sum-box">
                    <label>Status</label>
                    <span className="text-muted">Cancelled</span>
                  </div>
                ) : (
                  <div className={`sum-box ${sbBalance > 0 ? 'sum-danger' : sbBalance < 0 ? 'sum-refund' : 'sum-refund'}`}>
                    <label>{sbBalance < 0 ? 'Refund' : sbBalance === 0 ? 'Status' : 'Balance'}</label>
                    <span>{sbBalance === 0 ? 'Fully paid' : formatCurrency(Math.abs(sbBalance))}</span>
                  </div>
                )}
              </div>

              <div className="detail-body">

                {/* Why this booking was cancelled */}
                {sbCancelled && sb.cancelReason && (
                  <p className="cancel-note">{sb.cancelReason}</p>
                )}

                {/* ========== EDIT MODE ========== */}
                {isEditMode && editForm && preview && (
                  <div className="edit-panel">
                    <h4 className="panel-title"><Edit3 size={13} /> Edit Booking</h4>

                    <div className="edit-grid">
                      <div className="input-grp"><label>Name</label>
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
                        <div className="input-grp"><label>Reason / Note</label>
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
                      <div className="prev-row"><span>Previous total</span><span>{formatCurrency(preview.prevNet)}</span></div>
                      <div className="prev-row"><span>Subtotal (gown + add-ons)</span><span>{formatCurrency(preview.gross)}</span></div>
                      {preview.discount > 0 && (
                        <div className="prev-row minus"><span>Discount</span><span>−{formatCurrency(preview.discount)}</span></div>
                      )}
                      <div className="prev-row strong"><span>New total</span><span>{formatCurrency(preview.net)}</span></div>
                      {!sbAwaiting && (
                        <>
                          <div className="prev-row"><span>Already paid</span><span>{formatCurrency(preview.paid)}</span></div>
                          <div className={`prev-row strong ${preview.balance < 0 ? 'refund' : preview.balance > 0 ? 'owe' : ''}`}>
                            <span>{preview.balance < 0 ? 'Refund to customer' : 'New balance'}</span>
                            <span>{formatCurrency(Math.abs(preview.balance))}</span>
                          </div>
                        </>
                      )}
                      {preview.diff !== 0 && (
                        <p className={`prev-diff ${preview.diff < 0 ? 'down' : 'up'}`}>
                          {preview.diff < 0
                            ? `Total reduced by ${formatCurrency(Math.abs(preview.diff))}`
                            : `Total increased by ${formatCurrency(preview.diff)}`}
                        </p>
                      )}
                    </div>

                    <div className="edit-actions">
                      <button className="btn-edit-cancel" onClick={() => { setIsEditMode(false); setEditForm(null); }}>Cancel</button>
                      <button className="btn-edit-save" onClick={handleSaveEdit} disabled={saving}>
                        <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
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

                    {/* PRICE BREAKDOWN (receipt) */}
                    <div className="info-block receipt-block">
                      <label><DollarSign size={13} /> Price Breakdown</label>
                      <div className="receipt">
                        <div className="receipt-row"><span>Gown rental</span><span>{formatCurrency(sb.rentalPrice)}</span></div>
                        {sb.petticoatId && (
                          <div className="receipt-row">
                            <span>🩱 Petticoat{sbPetti ? ` (Layer ${sbPetti.layer})` : ''}</span>
                            <span>{sb.petticoatPrice > 0 ? `+${formatCurrency(sb.petticoatPrice)}` : 'Included'}</span>
                          </div>
                        )}
                        {(sb.addons || []).map((a, i) => (
                          <div key={i} className="receipt-row">
                            <span>👑 {a.name}</span>
                            <span>{Number(a.price) > 0 ? formatCurrency(a.price) : 'Included'}</span>
                          </div>
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

                        {sbAwaiting ? (
                          <div className="receipt-wait">
                            Awaiting downpayment. The balance will show after the downpayment is confirmed.
                          </div>
                        ) : (
                          <>
                            <div className="receipt-row"><span>Already paid</span><span className="text-success">{formatCurrency(sb.down)}</span></div>
                            {!sbCancelled && (
                              <div className={`receipt-row balance ${sbBalance < 0 ? 'refund' : sbBalance === 0 ? 'paid' : ''}`}>
                                <span>{sbBalance < 0 ? 'Refund to customer' : sbBalance === 0 ? 'Fully paid' : 'Balance'}</span>
                                <span>{formatCurrency(Math.abs(sbBalance))}</span>
                              </div>
                            )}
                          </>
                        )}

                        <div className="receipt-row muted"><span>Security deposit (separate)</span><span>{formatCurrency(sb.deposit)}</span></div>
                        {sb.swapCharges > 0 && (
                          <div className="receipt-row muted"><span>🔄 Swap charges (separate)</span><span>{formatCurrency(sb.swapCharges)}</span></div>
                        )}
                        {Number(sb.penaltyPaid) > 0 && (
                          <div className="receipt-row muted"><span>Penalty paid</span><span className="text-success">{formatCurrency(sb.penaltyPaid)}</span></div>
                        )}
                        {sbPenalty > 0 && (
                          <div className="receipt-row penalty"><span>⚠️ Penalty (unpaid)</span><span>{formatCurrency(sbPenalty)}</span></div>
                        )}
                      </div>

                      {/* Balance payment: only after the downpayment is confirmed */}
                      {sbBalance > 0 && !sbAwaiting && !sbCancelled && (
                        <div className="pay-box">
                          <p className="pay-box-label">Pay balance</p>
                          <div className="partial-pay-input-grp">
                            <input type="number" min="0" placeholder="Amount to pay" value={partialPayAmt} onChange={e => setPartialPayAmt(e.target.value)} />
                            <button className="btn-pay-small" onClick={() => handleUpdatePayment(sb)}><CreditCard size={13} /> Pay</button>
                          </div>
                        </div>
                      )}
                      {sbBalance < 0 && !sbCancelled && (
                        <p className="refund-note">The amount paid exceeds the new total. Give {formatCurrency(Math.abs(sbBalance))} back to the customer.</p>
                      )}

                      {/* Penalty payment: while claimed (late) or after the gown is returned or cancelled */}
                      {sbPenalty > 0 && !sbAwaiting && (
                        <div className="pay-box penalty-box">
                          <div className="pay-box-head">
                            <p className="pay-box-label">Pay penalty</p>
                            <strong>{formatCurrency(sbPenalty)} unpaid</strong>
                          </div>
                          <div className="partial-pay-input-grp">
                            <input
                              type="number"
                              min="0"
                              placeholder="Amount to pay"
                              value={penaltyPayAmt}
                              onChange={e => setPenaltyPayAmt(e.target.value)}
                            />
                            <button className="btn-pay-small btn-pay-penalty-small" onClick={() => handlePayPenalty(sb)}>
                              <CreditCard size={13} /> Pay
                            </button>
                          </div>
                          <div className="penalty-actions">
                            <button type="button" className="quick-chip" onClick={() => setPenaltyPayAmt(String(sbPenalty))}>
                              Fill full amount
                            </button>
                            {sb.returnStatus === 'claimed' && (
                              <span className="penalty-hint">Late penalty grows every day until the gown is returned.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ADD-ONS & SWAP */}
                    <div className="info-block">
                      <div className="addon-head">
                        <label><RefreshCw size={13} /> Add-ons & Swap</label>
                        {!sbCancelled && (
                          <button className="manage-btn" onClick={() => setIsSwapMode(!isSwapMode)}>
                            {isSwapMode ? 'Close' : 'Manage'}
                          </button>
                        )}
                      </div>

                      {/* Shown only when the booking is missing part of the gown package */}
                      {sbPackageMissing && !sbCancelled && (
                        <div className="included-box">
                          <p className="included-title"><Package size={13} /> Included with this gown</p>
                          <div className="addon-summary">
                            {sbIncPetti && <span className="addon-chip chip-petti">🩱 Layer {sbIncPetti.layer}</span>}
                            {sbIncAccs.map(a => <span key={a.id} className="addon-chip chip-acc">👑 {a.name}</span>)}
                          </div>
                          <button className="btn-apply-package" onClick={() => handleApplyPackage(sb)}>
                            Apply included package
                          </button>
                        </div>
                      )}

                      {!isSwapMode && (
                        <div className="addon-summary">
                          <span className="addon-chip chip-petti">
                            🩱 {sb.petticoatId
                              ? `Layer ${sbPetti?.layer ?? ''}${sb.petticoatPrice > 0 ? ` · +₱${sb.petticoatPrice}` : ' · Included'}`
                              : 'No petticoat'}
                          </span>
                          {(sb.addons || []).length === 0
                            ? <span className="addon-chip chip-more">No accessories</span>
                            : sb.addons.map((a, i) => (
                                <span key={i} className="addon-chip chip-acc">
                                  👑 {a.name}{Number(a.price) > 0 ? ` · ₱${a.price}` : ' · Included'}
                                </span>
                              ))}
                        </div>
                      )}

                      {isSwapMode && !sbCancelled && (
                        <div className="addon-panel">
                          <p className="addon-group-title">🩱 Petticoat</p>
                          <div className="addon-swap-btns">
                            <button
                              className={`swap-opt-btn ${!sb.petticoatId ? 'active' : ''}`}
                              onClick={() => handleSwapPetticoat(sb, null)}
                            >None</button>
                            {petticoats.map(p => {
                              const isCurrent = sb.petticoatId === p.id;
                              const isIncluded = sbIncPetti?.id === p.id;
                              const charge = pettiPriceFor(sbGown, p);
                              return (
                                <button
                                  key={p.id}
                                  className={`swap-opt-btn ${isCurrent ? 'active' : ''}`}
                                  onClick={() => handleSwapPetticoat(sb, p)}
                                >
                                  Layer {p.layer}
                                  {isIncluded
                                    ? <span className="included-tag">Included</span>
                                    : charge > 0 && <span className="swap-fee-tag">+₱{charge}</span>}
                                  {!isCurrent && !isIncluded && p.swap_fee > 0 && (
                                    <span className="swap-fee-tag">swap +₱{p.swap_fee}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {petticoats.length === 0 && <span className="empty-inline">No petticoat layers in inventory yet.</span>}

                          <p className="addon-group-title">👑 Accessories</p>
                          <div className="addon-swap-btns">
                            {accessories.length === 0 && <span className="empty-inline">No accessories in inventory yet.</span>}
                            {accessories.map(acc => {
                              const has = (sb.addons || []).find(a => String(a.id) === String(acc.id));
                              const isIncluded = sbIncAccs.some(a => a.id === acc.id);
                              return (
                                <button
                                  key={acc.id}
                                  className={`swap-opt-btn ${has ? 'active' : ''}`}
                                  onClick={() => handleToggleAddon(sb, acc)}
                                >
                                  {acc.name}
                                  {isIncluded
                                    ? <span className="included-tag">Included</span>
                                    : !has && acc.price > 0 && <span className="swap-fee-tag">+₱{acc.price}</span>}
                                  {!has && !isIncluded && acc.swap_fee > 0 && <span className="swap-fee-tag">swap +₱{acc.swap_fee}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ONLINE HOLD (the only place where the downpayment is entered) */}
                    {sbAwaiting && !isConfirmingHold && (
                      <div className="info-block hold-block">
                        <label><ShieldAlert size={13} /> Online Hold</label>
                        <div className="data-field">
                          <p>{sb.customerMessage || 'No message.'}</p>
                          <p className="hold-compete">
                            {sbCompetitors > 0
                              ? `${sbCompetitors} other customer${sbCompetitors === 1 ? ' is' : 's are'} also holding this gown. The first downpayment gets it.`
                              : 'No other customer is holding this gown.'}
                          </p>
                          <button className="btn-confirm-hold-trigger" onClick={() => setIsConfirmingHold(true)}>Confirm & Finalize</button>
                        </div>
                      </div>
                    )}

                    {isConfirmingHold && (
                      <div className="info-block confirm-hold-area">
                        <label><CheckCircle2 size={13} /> Complete Information</label>
                        <div className="hold-edit-fields">
                          <div className="input-grp"><label>Downpayment</label><input type="number" min="0" onChange={e => setHoldData({...holdData, downpayment: e.target.value})} /></div>
                          <div className="input-grp"><label>Deposit</label><input type="number" min="0" onChange={e => setHoldData({...holdData, deposit: e.target.value})} /></div>
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
                      <select required value={newCustomer.gownId} onChange={handleGownSelect}>
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
                  <p className="package-hint">
                    {!formGown
                      ? 'Select a gown first to see its included petticoat.'
                      : formIncPetti
                        ? `Included with this gown: Layer ${formIncPetti.layer}. A higher layer only charges the difference.`
                        : 'This gown does not include a petticoat. Any layer is charged in full.'}
                  </p>
                  <div className="addon-selector-grid">
                    <button type="button"
                      className={`addon-select-btn ${!newCustomer.petticoatId ? 'selected' : ''}`}
                      onClick={() => handleFormPetticoat(null)}>
                      None
                    </button>
                    {petticoats.map(p => {
                      const charge = pettiPriceFor(formGown, p);
                      const isIncluded = formIncPetti?.id === p.id;
                      return (
                        <button type="button" key={p.id}
                          className={`addon-select-btn ${newCustomer.petticoatId === p.id ? 'selected' : ''}`}
                          onClick={() => handleFormPetticoat(p)}>
                          Layer {p.layer}
                          {isIncluded
                            ? <span className="included-tag">Included</span>
                            : charge > 0 && <span>+₱{Number(charge).toLocaleString()}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accessories */}
                {accessories.length > 0 && (
                  <div className="form-section">
                    <h4 className="form-section-title"><Crown size={13} /> Accessories</h4>
                    <p className="package-hint">
                      {!formGown
                        ? 'Select a gown first to see its included accessories.'
                        : formIncAccs.length > 0
                          ? `Included with this gown: ${formIncAccs.map(a => a.name).join(', ')}. Any extra accessory is charged.`
                          : 'This gown has no included accessories. Any accessory is charged.'}
                    </p>
                    <div className="addon-selector-grid">
                      {accessories.map(acc => {
                        const selected = newCustomer.selectedAccessories.find(a => a.id === acc.id);
                        const isIncluded = formIncAccs.some(a => a.id === acc.id);
                        return (
                          <button type="button" key={acc.id}
                            className={`addon-select-btn ${selected ? 'selected' : ''}`}
                            onClick={() => toggleFormAccessory(acc)}>
                            {acc.name}
                            {isIncluded
                              ? <span className="included-tag">Included</span>
                              : acc.price > 0 && <span>+₱{Number(acc.price).toLocaleString()}</span>}
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
                    {newCustomer.petticoatId && (
                      <span>
                        {newCustomer.petticoatPrice > 0
                          ? `+ ${newCustomer.petticoatName} upgrade: ${formatCurrency(newCustomer.petticoatPrice)}`
                          : `${newCustomer.petticoatName} (included)`}
                      </span>
                    )}
                    {newCustomer.selectedAccessories.map((a, i) => (
                      <span key={i}>
                        {Number(a.price) > 0 ? `+ ${a.name}: ${formatCurrency(a.price)}` : `${a.name} (included)`}
                      </span>
                    ))}
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