import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
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

  // --- DB ROW (snake_case) -> JS (camelCase), only the fields this page needs ---
  const mapBookingFromDb = (row) => ({
    id: row.id,
    name: row.name,
    gownId: row.gown_id,
    bookingDate: row.booking_date,
    reservationDate: row.reservation_date,
    returnDate: row.return_date,
    returnStatus: row.return_status,
  });

  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('*')
      .order('name', { ascending: true });

    if (error) console.error("Error fetching gowns:", error);
    else setGowns(data);
  };

  const fetchBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*');

    if (error) console.error("Error fetching bookings:", error);
    else setBookings(data.map(mapBookingFromDb));
  };

  useEffect(() => {
    fetchGowns();
    fetchBookings();
  }, []);

  // Only bookings that are actually holding the gown count toward availability.
  // Cancelled/returned bookings should never block a date.
  const activeBookings = bookings.filter(b => b.returnStatus === 'reserved' || b.returnStatus === 'claimed');

  // Mangita sa TANANG booking nga nag-match sa Gown ug sa pinili nga Petsa
  // (puwede sila daghan kung 2+ ang stock sa gown nga gibook sa lain-laing customer)
  const getActiveBookingsForDate = (gownId, selectedDate) => {
    const checkDate = new Date(selectedDate);
    checkDate.setHours(0, 0, 0, 0);

    // 1. Eksakto nga date-range match
    const dateMatches = activeBookings.filter(booking => {
      if (booking.gownId !== gownId) return false;
      if (!booking.reservationDate || !booking.returnDate) return false;

      const startRent = new Date(booking.reservationDate);
      const endRent = new Date(booking.returnDate);

      return checkDate >= startRent && checkDate <= endRent;
    });
    if (dateMatches.length > 0) return dateMatches;

    // 2. Kung wala'y date match pero 0 na ang stock, ipakita gihapon ang
    //    tanang naka-claim/reserve nga nag-konsumo sa stock niini nga gown.
    const gown = gowns.find(g => g.id === gownId);
    if ((gown?.stock || 0) <= 0) {
      return activeBookings.filter(b => b.gownId === gownId);
    }

    return [];
  };

  // Stock ang nag-decide una kung available o dili — kung 0 na ang stock,
  // dili na "Available" bisan unsa pa ang petsa nga gipili sa calendar.
  const getGownStatusForDate = (gownId, selectedDate) => {
    const gown = gowns.find(g => g.id === gownId);
    if ((gown?.stock || 0) <= 0) return "Rented";
    return getActiveBookingsForDate(gownId, selectedDate).length > 0 ? "Rented" : "Available";
  };

  const filteredGowns = gowns.filter(gown =>
    gown.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Header />
      <div className="avail-page-container">

        {/* SUMMARY STATS - base sa pinili nga adlaw sa Calendar */}
        <div className="inventory-summary">
          <div className="stat-card">
            <div className="stat-icon green"><CalIcon size={20} /></div>
            <div>
              <span>Available on this Date</span>
              <h3>{filteredGowns.filter(g => getGownStatusForDate(g.id, date) === "Available").length}</h3>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red"><Clock size={20} /></div>
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
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search gowns availability..."
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="gown-grid">
              {filteredGowns.map(gown => {
                const gownBookingsToday = getActiveBookingsForDate(gown.id, date);
                const currentStatus = gownBookingsToday.length > 0 ? "Rented" : "Available";

                return (
                  <div key={gown.id} className="gown-card" onClick={() => setSelectedGown(gown)}>
                    <div className="image-box">
                      {gown.image ? (
                        <img src={gown.image} alt={gown.name} className="gown-img-preview" />
                      ) : (
                        <div className="no-img">{defaultDress}</div>
                      )}
                      <span className="category-badge">{gown.category}</span>
                      <span className={`stock-indicator ${currentStatus === 'Rented' ? 'out' : 'in'}`}>
                        {currentStatus}
                      </span>
                    </div>
                    <div className="gown-info">
                      <span className="gown-id-tag">#{gown.id}</span>
                      <h3>{gown.name}</h3>
                      <p className="price">₱{gown.price?.toLocaleString()}</p>

                      {gownBookingsToday.length > 0 && (
                        <div className="booking-mini-info">
                          {gownBookingsToday.map((b) => (
                            <p key={b.id} className="status renter-name">
                              👤 {b.name} — 🔙 {b.returnDate || 'N/A'}
                            </p>
                          ))}
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
              <div className="calendar-header-row">
                <h3><CalIcon size={18} /> Schedule View</h3>
              </div>
              <hr className="calendar-divider" />
              <Calendar onChange={setDate} value={date} />
              <div className="selected-date-display">
                <span className="gown-id-tag">SELECTED DATE</span>
                <p className="selected-date-text">{date.toDateString()}</p>
              </div>
            </div>
          </aside>
        </div>

        {/* MODAL SECTION */}
        {selectedGown && (() => {
          const currentBookings = getActiveBookingsForDate(selectedGown.id, date);
          const modalStatus = currentBookings.length > 0 ? "Rented" : "Available";
          const gownReservations = activeBookings.filter(b => b.gownId === selectedGown.id && b.returnStatus === 'reserved');

          return (
            <div className="modal-overlay" onClick={() => setSelectedGown(null)}>
              <div className="modal-content avail-modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-modal" onClick={() => setSelectedGown(null)}><X /></button>

                <div className="modal-body avail-modal-body">
                  <div className="modal-image avail-modal-image">
                    {selectedGown.image ? (
                      <img src={selectedGown.image} alt={selectedGown.name} className="avail-modal-img" />
                    ) : (
                      <span className="avail-modal-placeholder">{defaultDress}</span>
                    )}
                  </div>

                  <span className="modal-category">{selectedGown.category}</span>
                  <h2 className="avail-modal-title">{selectedGown.name}</h2>
                  <div className="avail-modal-price">₱{selectedGown.price?.toLocaleString()}</div>

                  <h4 className="avail-section-title">Current Status ({date.toLocaleDateString()})</h4>
                  <div className="status-grid">
                    <div className="status-mini-card">
                      <span>Status Today</span>
                      <p className={`status-value ${modalStatus === 'Rented' ? 'danger' : 'success'}`}>
                        {modalStatus}
                      </p>
                    </div>

                    <div className="status-mini-card">
                      <span>Stock Available</span>
                      <p className="status-value dark">{selectedGown.stock || 0} available</p>
                    </div>
                  </div>

                  <h4 className="avail-section-title">Current Renter(s)</h4>
                  <div className="reservations-list-container">
                    {currentBookings.length > 0 ? (
                      currentBookings.map((b) => (
                        <div key={b.id} className="reservation-item">
                          <div className="reservation-left">
                            <span className="reservation-name"><User size={13} /> {b.name}</span>
                            <span className="reservation-sub">Booking: {b.bookingDate || "N/A"}</span>
                          </div>
                          <div className="reservation-right">
                            <span className="return-badge">Return: {b.returnDate || 'N/A'}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="empty-reservations-text">No active renter for this date.</p>
                    )}
                  </div>

                  <hr className="section-divider" />
                  <h4 className="avail-section-title with-icon">
                    <CalendarDays size={16} /> Reservation Schedules List
                  </h4>

                  <div className="reservations-list-container">
                    {gownReservations.length > 0 ? (
                      gownReservations.map((res) => (
                        <div key={res.id} className="reservation-item">
                          <div className="reservation-left">
                            <span className="reservation-name"><User size={13} /> {res.name}</span>
                            <span className="reservation-sub">Booking: {res.bookingDate || "N/A"}</span>
                          </div>
                          <div className="reservation-right">
                            <span className="return-badge">Return: {res.returnDate}</span>
                            <span className="sched-text">Sched: {res.reservationDate}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="empty-reservations-text">No active or upcoming reservations found for this gown.</p>
                    )}
                  </div>

                  <button className="update-schedule-btn">Update Schedule</button>
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