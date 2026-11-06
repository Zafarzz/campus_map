import {
  CalendarIcon,
  MapNavIcon,
  PackageIcon,
  UsersIcon,
} from '../auth/AuthIcons';

export type CampusNavSection = 'map' | 'crowds' | 'bookings' | 'lostfound';

interface CampusNavRailProps {
  activeSection: CampusNavSection;
  onSelectSection: (section: CampusNavSection) => void;
}

export function CampusNavRail({ activeSection, onSelectSection }: CampusNavRailProps) {
  return (
    <nav className="campus-nav-rail" aria-label="Campus Menu Navigation Rail">
      {/* Main Switcher Pill — docked on the right side */}
      <div className="campus-nav-rail__pill" role="tablist" aria-orientation="vertical">
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'map'}
          className={`campus-nav-rail__btn${activeSection === 'map' ? ' is-active' : ''}`}
          onClick={() => onSelectSection('map')}
          title="Campus Map, Search & Buildings"
          aria-label="Campus Map"
        >
          <MapNavIcon size={18} />
          <span className="campus-nav-rail__tooltip">Campus Map</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'crowds'}
          className={`campus-nav-rail__btn${activeSection === 'crowds' ? ' is-active' : ''}`}
          onClick={() => onSelectSection('crowds')}
          title="Busyness & Crowded Places"
          aria-label="Busyness and Crowds"
        >
          <UsersIcon size={18} />
          <span className="campus-nav-rail__tooltip">Busyness & Crowds</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'bookings'}
          className={`campus-nav-rail__btn${activeSection === 'bookings' ? ' is-active' : ''}`}
          onClick={() => onSelectSection('bookings')}
          title="Space & Facility Booking"
          aria-label="Bookings"
        >
          <CalendarIcon size={18} />
          <span className="campus-nav-rail__tooltip">Space Booking</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'lostfound'}
          className={`campus-nav-rail__btn${activeSection === 'lostfound' ? ' is-active' : ''}`}
          onClick={() => onSelectSection('lostfound')}
          title="Campus Lost & Found Registry"
          aria-label="Lost and Found"
        >
          <PackageIcon size={18} />
          <span className="campus-nav-rail__tooltip">Lost & Found</span>
        </button>
      </div>
    </nav>
  );
}
