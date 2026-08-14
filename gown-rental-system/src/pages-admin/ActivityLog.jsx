import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  History, Search, PlusCircle, Edit, Trash2, CalendarCheck,
  Banknote, ShieldAlert, ClipboardX, X, Eraser
} from 'lucide-react';
import Header from '../components/Header';
import '../styles/ActivityLog.css';

// Icon + color per action type, para sayon makit-an sa staff kung unsang lihok kini
const ACTION_META = {
  gown_added: { icon: PlusCircle, color: 'green', label: 'Gown Added' },
  gown_edited: { icon: Edit, color: 'orange', label: 'Gown Edited' },
  gown_deleted: { icon: Trash2, color: 'red', label: 'Gown Deleted' },
  booking_created: { icon: PlusCircle, color: 'green', label: 'Booking Created' },
  booking_updated: { icon: CalendarCheck, color: 'blue', label: 'Booking Updated' },
  booking_deleted: { icon: ClipboardX, color: 'red', label: 'Booking Deleted' },
  payment_received: { icon: Banknote, color: 'green', label: 'Payment Received' },
  penalty_paid: { icon: ShieldAlert, color: 'orange', label: 'Penalty Paid' },
  hold_confirmed: { icon: CalendarCheck, color: 'blue', label: 'Hold Confirmed' },
};

const getActionMeta = (actionType) =>
  ACTION_META[actionType] || { icon: History, color: 'gray', label: actionType || 'Activity' };

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) console.error("Error fetching activity logs:", error);
    else setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.performed_by?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || log.action_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // --- Delete usa ka log entry ---
  const handleDeleteLog = async (id) => {
    if (!window.confirm("Tangtangon ni nga log entry?")) return;
    try {
      const { error } = await supabase.from('activity_logs').delete().eq('id', id);
      if (error) throw error;
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error("Error deleting log:", err);
      alert("Naay sayop sa pag-delete: " + err.message);
    }
  };

  // --- Tangtangon ang mga log nga sobra sa 30 ka adlaw na (para dili padaghan ang table) ---
  const handleClearOld = async () => {
    if (!window.confirm("Tangtangon ang tanang activity log nga sobra na sa 30 ka adlaw?")) return;
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .lt('created_at', cutoff.toISOString());

      if (error) throw error;
      fetchLogs();
    } catch (err) {
      console.error("Error clearing old logs:", err);
      alert("Naay sayop: " + err.message);
    }
  };

  // --- Tangtangon TANAN nga log ---
  const handleClearAll = async () => {
    if (!window.confirm("Tangtangon TANAN nga activity log? Dili na kini ma-undo.")) return;
    try {
      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .gte('created_at', '1970-01-01'); // always-true filter, deletes every row

      if (error) throw error;
      setLogs([]);
    } catch (err) {
      console.error("Error clearing all logs:", err);
      alert("Naay sayop: " + err.message);
    }
  };

  return (
    <>
      <Header />
      <div className="activity-log-container">
        <div className="activity-hero">
          <div>
            <h1><History size={22} /> Activity Log</h1>
            <p>Monitor sa tanang add, edit, ug booking activities sa system</p>
          </div>
          <div className="activity-hero-actions">
            <button className="btn-clear-old" onClick={handleClearOld}>
              <Eraser size={14} /> Clear 30+ Days
            </button>
            <button className="btn-clear-all" onClick={handleClearAll}>
              <Trash2 size={14} /> Clear All
            </button>
          </div>
        </div>

        <div className="activity-toolbar">
          <div className="activity-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by description or staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="activity-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Activities</option>
            {Object.keys(ACTION_META).map(key => (
              <option key={key} value={key}>{ACTION_META[key].label}</option>
            ))}
          </select>
        </div>

        <div className="activity-timeline">
          {loading ? (
            <p className="activity-empty-text">Loading activity log...</p>
          ) : filteredLogs.length > 0 ? (
            filteredLogs.map((log) => {
              const meta = getActionMeta(log.action_type);
              const Icon = meta.icon;
              return (
                <div key={log.id} className="activity-row">
                  <div className={`activity-icon-circle ${meta.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="activity-row-content">
                    <p className="activity-description">{log.description}</p>
                    <span className="activity-meta">
                      {meta.label} • by {log.performed_by || 'Unknown'} • {formatTimestamp(log.created_at)}
                    </span>
                  </div>
                  <button
                    className="activity-delete-btn"
                    onClick={() => handleDeleteLog(log.id)}
                    title="Delete this entry"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="activity-empty-text">Walay activity record nga nakit-an.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default ActivityLog;