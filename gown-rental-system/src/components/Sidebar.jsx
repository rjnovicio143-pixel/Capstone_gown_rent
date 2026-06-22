import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Shirt, CalendarCheck, Users, 
  FileBarChart, LogOut, ChevronLeft 
} from 'lucide-react';
import '../styles/Sidebar.css';

// 1. Dawata ang props gikan sa App.jsx
const Sidebar = ({ isCollapsed, setIsCollapsed }) => {

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { name: 'Gown Inventory', icon: Shirt, path: '/admin/inventory' },
    { name: 'Availability', icon: CalendarCheck, path: '/admin/availability' },
    { name: 'Customers', icon: Users, path: '/admin/customers' },
    { name: 'Reports', icon: FileBarChart, path: '/admin/reports' },
  ];

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* 2. Ang button karon mo-trigger na sa state nga naa sa App.jsx */}
      <button className="sidebar-toggle" onClick={() => setIsCollapsed(!isCollapsed)}>
        <ChevronLeft size={16} />
      </button>

      <div className="sidebar-logo">
        <span className="logo-icon-g">G</span>
        {/* 3. Ang logo-text awtomatiko nga mawala/mutago base sa CSS class nga 'collapsed' */}
        <span className="logos-text">
          Mrs G.<span className="accent-gold-text"> Rental gown</span>
        </span>
      </div>
      
      <nav className="sidebar-nav">
        <ul>
          {menuItems.map((item) => (
            <li key={item.name}>
              {/* Gidugangan og 'title' para makita gihapon ang ngalan inig hover maski collapsed */}
              <NavLink 
                to={item.path} 
                className={({ isActive }) => isActive ? 'active' : ''}
                title={isCollapsed ? item.name : ""}
              >
                <item.icon size={20} className="nav-icon" />
                <span className="nav-text">{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

     
    </div>
  );
};

export default Sidebar;