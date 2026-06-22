import { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { Search, Clock, Calendar as CalIcon, X, User, CalendarDays } from 'lucide-react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Header from '../components/Header';
import '../styles/Availability.css';

const Availability = () => {
  const [gowns, setGowns] = useState([]);
  const [bookings, setBookings] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGown, setSelectedGown] = useState(null);
  const [date, setDate] = useState(new Date());

  const defaultDress = "👗"; 

  // 1. REAL-TIME LISTENER PARA SA GOWNS
  useEffect(() => {
    const q = query(collection(db, "gowns"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGowns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // 2. REAL-TIME LISTENER PARA SA BOOKINGS
  useEffect(() => {
    const q = collection(db, "bookings");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // HELPER FUNCTION: Mangita sa booking nga nag-match sa Gown ID ug sa pinili nga Petsa
  const getActiveBookingForDate = (gownId, selectedDate) => {
    const checkDate = new Date(selectedDate.setHours(0,0,0,0));

    return bookings.find(booking => {
      if (booking.gownId !== gownId) return false;
      
      const startRent = new Date(booking.reservationDate);
      const endRent = new Date(booking.returnDate);

      return checkDate >= startRent && checkDate <= endRent;
    });
  };

  // FUNCTION: Mo-return og "Rented" o "Available" para sa badge ug counters
  const getGownStatusForDate = (gownId, selectedDate) => {
    const activeBooking = getActiveBookingForDate(gownId, selectedDate);
    return activeBooking ? "Rented" : "Available";
  };

  // I-filter ang mga gowns base sa Search Bar
  const filteredGowns = gowns.filter(gown => 
    gown.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
    <Header />
    <div className="inventory-container">
      

      {/* SUMMARY STATS - Gi-compute base sa pinili nga adlaw sa Calendar */}
      <div className="inventory-summary">
        <div className="stat-card">
          <div className="stat-icon green" style={{background: '#f0fdf4', color: '#22c55e'}}><CalIcon size={20}/></div>
          <div>
            <span>Available on this Date</span> 
            <h3>{filteredGowns.filter(g => getGownStatusForDate(g.id, date) === "Available").length}</h3>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red" style={{background: '#fef2f2', color: '#ef4444'}}><Clock size={20}/></div>
          <div>
            <span>Rented on this Date</span> 
            <h3>{filteredGowns.filter(g => getGownStatusForDate(g.id, date) === "Rented").length}</h3>
          </div>
        </div>
      </div>

      <div className="availability-layout-wrapper">
        {/* MAIN SECTION: SEARCH & GRID */}
        <div className="avail-content-main">
          <div className="inventory-header">
            <div className="search-box">
              <Search size={18} color="#64748b" />
              <input 
                type="text" 
                placeholder="Search gowns availability..." 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>

          <div className="gown-grid">
            {filteredGowns.map(gown => {
              const activeBooking = getActiveBookingForDate(gown.id, date);
              const currentStatus = activeBooking ? "Rented" : "Available";

              return (
                <div key={gown.id} className="gown-card" onClick={() => setSelectedGown(gown)}>
                  <div className="image-box" style={{ position: 'relative', overflow: 'hidden' }}>
                    {gown.image ? (
                      <img 
                        src={gown.image} 
                        alt={gown.name} 
                        className="gown-card-img" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                      />
                    ) : (
                      <span style={{ fontSize: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        {defaultDress}
                      </span>
                    )}
                    <span className="category-badge">{gown.category}</span>
                    <span className={`stock-indicator ${currentStatus === 'Rented' ? 'out' : 'in'}`}>
                      {currentStatus}
                    </span>
                  </div>
                  <div className="gown-info">
                    <span className="gown-id">ID: {gown.id.substring(0,5)}</span>
                    <h3>{gown.name}</h3>
                    <p className="price">₱{gown.price?.toLocaleString()}</p>
                    
                    {activeBooking && (
                      <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <p className="status rented-out" style={{ margin: 0, fontSize: '12px' }}>
                          🔙 Return: {activeBooking.returnDate}
                        </p>
                        <p className="status renter-name" style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                          👤 By: {activeBooking.name}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SIDEBAR SECTION: CALENDAR */}
        <aside className="avail-sidebar-calendar">
          <div className="calendar-inner-card">
            <div className="modal-header-simple">
               <h3 style={{fontSize: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
                 <CalIcon size={18}/> Schedule View
               </h3>
            </div>
            <hr style={{margin: '15px 0', opacity: 0.1}} />
            <Calendar onChange={setDate} value={date} />
            <div className="selected-date-display">
              <span className="gown-id">SELECTED DATE</span>
              <p style={{fontWeight: '700', color: '#1e293b', marginTop: '5px'}}>{date.toDateString()}</p>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL SECTION */}
      {selectedGown && (() => {
        // 1. Kuhaon ang booking karong adlawa
        const currentBooking = getActiveBookingForDate(selectedGown.id, date);
        const modalStatus = currentBooking ? "Rented" : "Available";

        // 2. Kuhaon ang TANANG umaabot o naglungtad nga reservation para niini nga gown
        const gownReservations = bookings.filter(b => b.gownId === selectedGown.id);

        return (
          <div className="modal-overlay" onClick={() => setSelectedGown(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <button className="close-modal" onClick={() => setSelectedGown(null)}><X /></button>
              
              <div className="modal-body">
                <div className="modal-image" style={{ width: '100%', height: '220px', overflow: 'hidden', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc' }}>
                  {selectedGown.image ? (
                    <img src={selectedGown.image} alt={selectedGown.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '48px' }}>{defaultDress}</span>
                  )}
                </div>
                
                <span className="modal-category">{selectedGown.category}</span>
                <h2 style={{margin: '5px 0 10px 0'}}>{selectedGown.name}</h2>
                <div className="modal-price" style={{color: '#f59e0b', fontWeight: '700', fontSize: '20px', marginBottom: '15px'}}>
                  ₱{selectedGown.price?.toLocaleString()}
                </div>

                {/* CURRENT ADLAW NGA STATUS CARD (GRID TYPE) */}
                <h4 style={{ margin: '15px 0 8px 0', color: '#1e293b', fontSize: '14px', fontWeight: '600' }}>Current Status ({date.toLocaleDateString()})</h4>
                <div className="input-group" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px'}}>
                  
                  <div className="stat-card" style={{boxShadow: 'none', border: '1px solid #f1f5f9', padding: '10px'}}>
                    <div>
                      <span>Status Today</span>
                      <p className="status" style={{margin:0, fontWeight: '600', color: modalStatus === 'Rented' ? '#ef4444' : '#10b981'}}>
                        {modalStatus}
                      </p>
                    </div>
                  </div>

                  <div className="stat-card" style={{boxShadow: 'none', border: '1px solid #f1f5f9', padding: '10px'}}>
                    <div>
                      <span>Customer / Renter</span>
                      <p className="status" style={{margin:0, fontWeight: '600', color: modalStatus === 'Rented' ? '#1e293b' : '#64748b', fontSize: '13px'}}>
                        {modalStatus === 'Rented' ? currentBooking.name : "None"}
                      </p>
                    </div>
                  </div>

                  <div className="stat-card" style={{boxShadow: 'none', border: '1px solid #f1f5f9', padding: '10px'}}>
                    <div>
                      <span>Expected Return</span>
                      <p className="status" style={{margin:0, fontWeight: '600', color: modalStatus === 'Rented' ? '#f59e0b' : '#64748b'}}>
                        {modalStatus === 'Rented' ? currentBooking.returnDate : "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="stat-card" style={{boxShadow: 'none', border: '1px solid #f1f5f9', padding: '10px'}}>
                    <div>
                      <span>Stock Available</span>
                      <p className="status" style={{margin:0, fontWeight: '600', color: '#1e293b'}}>
                        {modalStatus === 'Rented' ? Math.max(0, (selectedGown.stock || 1) - 1) : (selectedGown.stock || 0)} available
                      </p>
                    </div>
                  </div>
                </div>

                {/* LISTAHAN SA MGA NAG-RESERVE / BOOKINGS SCHEDULE */}
                <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '15px 0' }} />
                <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CalendarDays size={16} color="#f59e0b" /> Reservation Schedules List
                </h4>

                <div className="reservations-list-container" style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '5px' }}>
                  {gownReservations.length > 0 ? (
                    gownReservations.map((res) => (
                      <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={13} color="#64748b" /> {res.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Booking: {res.bookingDate || "N/A"}
                          </span>
                        </div>
                        <div style={{ textTarget: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: '4px' }}>
                            Return: {res.returnDate}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Sched: {res.reservationDate}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0' }}>No active or upcoming reservations found for this gown.</p>
                  )}
                </div>

                <button className="rent-now-btn" style={{marginTop: '20px', background: '#f59e0b', color: '#ffffff', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: 'pointer'}}>
                  Update Schedule
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
};

export default Availability;