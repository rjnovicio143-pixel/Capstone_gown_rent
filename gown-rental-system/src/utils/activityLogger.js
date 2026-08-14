import { supabase } from '../supabaseClient';

/**
 * Mag-log sa usa ka activity sa "activity_logs" table sa Supabase.
 * Gamiton ni sa Inventory, Customers, ug uban pang pages aron ma-track
 * ang mga add/edit/delete/booking actions para sa Activity Log page.
 *
 * Kuhaon ang ngalan sa naka-login nga admin gikan sa localStorage
 * (gi-store sa Login.jsx pag-login isip JSON: { id, name, email, role }).
 *
 * @param {string} actionType - e.g. 'gown_added', 'booking_created', 'payment_received'
 * @param {string} description - human-readable nga summary sa nahitabo
 */
export const logActivity = async (actionType, description) => {
  try {
    let performedBy = 'Unknown User';
    try {
      const stored = localStorage.getItem('admin');
      if (stored) {
        const admin = JSON.parse(stored);
        performedBy = admin?.name || admin?.email || 'Unknown User';
      }
    } catch (_) {
      // ignore parse errors, fallback stays 'Unknown User'
    }

    const { error } = await supabase.from('activity_logs').insert([{
      action_type: actionType,
      description,
      performed_by: performedBy,
    }]);

    if (error) console.error("Error logging activity:", error);
  } catch (err) {
    // Dili na nato i-block ang main action kung mapakyas ra ang logging
    console.error("logActivity failed:", err);
  }
};