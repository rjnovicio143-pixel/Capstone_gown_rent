import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Shirt, CalendarCheck, Users,
  FileBarChart, ChevronLeft, Box, HardDrive
} from 'lucide-react';
import '../styles/Sidebar.css';

// `short` is the label used on the mobile bottom bar (7 items need to fit)
const menuItems = [
  { name: 'Dashboard',      short: 'Home',    icon: LayoutDashboard, path: '/admin/dashboard'    },
  { name: 'Gown Inventory', short: 'Gowns',   icon: Shirt,           path: '/admin/inventory'    },
  { name: 'Wedding Events', short: 'Events',  icon: CalendarCheck,   path: '/admin/availability' },
  { name: 'Customers',      short: 'Clients', icon: Users,           path: '/admin/customers'    },
  { name: '3D Mannequin',   short: '3D',      icon: Box,             path: '/admin/mannequin'    },
  { name: 'Storage',        short: 'Storage', icon: HardDrive,       path: '/admin/storage'      },
  { name: 'Reports',        short: 'Reports', icon: FileBarChart,    path: '/admin/reports'      },
];

const Sidebar = ({ isCollapsed, setIsCollapsed }) => (
  <>
    {/* ── DESKTOP SIDEBAR ── */}
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
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
                className={({ isActive }) => (isActive ? 'active' : '')}
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
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'mobile-nav-active' : ''}`}
        >
          <item.icon size={20} className="mobile-nav-icon" />
          <span className="mobile-nav-label">{item.short}</span>
        </NavLink>
      ))}
    </nav>
  </>
);

export default Sidebar;