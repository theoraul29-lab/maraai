import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector';
import { GlobalSearch } from './components/GlobalSearch';
import './styles/Nav.css';
import './styles/GlobalSearch.css';

const linkKeys = [
	{ to: '/', key: 'home', icon: '🏠' },
	{ to: '/reels', key: 'reels', icon: '🎬' },
	{ to: '/trading-academy', key: 'trading', icon: '📈' },
	{ to: '/membership', key: 'vip', icon: '👑' },
	{ to: '/creator-panel', key: 'creator', icon: '✨' },
	{ to: '/writers-hub', key: 'writers', icon: '✍️' },
	{ to: '/you', key: 'profile', icon: '👤' },
];

const Nav: React.FC = () => {
	const [menuOpen, setMenuOpen] = useState(false);
	const { t } = useTranslation();

	return (
		<nav className="nav-container" role="navigation">
			{/* Desktop Nav */}
			<div className="nav-desktop">
				<div className="nav-brand">{t('nav.brand')}</div>
				<div className="nav-links-desktop">
					{linkKeys.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
						>
							{t(`nav.${item.key}`)}
						</NavLink>
					))}
				</div>
				<GlobalSearch />
				<LanguageSelector compact />
			</div>

			{/* Mobile Nav */}
			<div className="nav-mobile">
				<div className="nav-brand">{t('nav.brandMobile')}</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<LanguageSelector compact />
					<button
						className="hamburger-btn"
						onClick={() => setMenuOpen(!menuOpen)}
						aria-label={t('nav.toggleMenu')}
						aria-expanded={menuOpen}
					>
						<span className="hamburger-line"></span>
						<span className="hamburger-line"></span>
						<span className="hamburger-line"></span>
					</button>
				</div>
			</div>

			{/* Mobile Menu Dropdown */}
			{menuOpen && (
				<div className="nav-mobile-menu">
					{linkKeys.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => `nav-mobile-link ${isActive ? 'active' : ''}`}
							onClick={() => setMenuOpen(false)}
						>
							<span className="mobile-link-icon">{item.icon}</span>
							<span className="mobile-link-label">{t(`nav.${item.key}`)}</span>
						</NavLink>
					))}
				</div>
			)}
		</nav>
	);
};

export default Nav;
