import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Shirt, CalendarCheck, Users,
  FileBarChart, ChevronLeft, Box
} from 'lucide-react';
import '../styles/Sidebar.css';

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {

  const menuItems = [
    { name: 'Dashboard',      icon: LayoutDashboard, path: '/admin/dashboard'   },
    { name: 'Gown Inventory', icon: Shirt,            path: '/admin/inventory'   },
    { name: 'Availability',   icon: CalendarCheck,    path: '/admin/availability'},
    { name: 'Customers',      icon: Users,            path: '/admin/customers'   },
    { name: '3D Mannequin',   icon: Box,             path: '/admin/mannequin'    },
    { name: 'Reports',        icon: FileBarChart,     path: '/admin/reports'     },
  ];

  return (
    <>
      {/* ── DESKTOP SIDEBAR (left panel) ── */}
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>

        <button
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="sidebar-logo">
          <span className="logo-icon-g">G</span>
          <span className="logos-text">
            Mrs G.<span className="accent-gold-text"> Rental gown</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => isActive ? 'active' : ''}
                  title={isCollapsed ? item.name : ''}
                >
                  <item.icon size={20} className="nav-icon" />
                  <span className="nav-text">{item.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="mobile-bottom-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `mobile-nav-item ${isActive ? 'mobile-nav-active' : ''}`
            }
          >
            <item.icon size={22} className="mobile-nav-icon" />
            <span className="mobile-nav-label">{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;