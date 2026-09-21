import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { LanguageSelector } from './components/LanguageSelector';
import { GlobalSearch } from './components/GlobalSearch';
import { SettingsModal } from './components/SettingsModal';
import MessengerPanel from './components/MessengerPanel';
import { ORBIT_STRIP_PATHS } from './lib/orbitModules';
import axios from 'axios';
import './styles/Nav.css';
import './styles/GlobalSearch.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const linkKeys = [
	{ to: '/', key: 'home', icon: '🏠' },
	{ to: '/reels', key: 'reels', icon: '🎬' },
	{ to: '/missions', key: 'missions', icon: '🎯' },
	{ to: '/community', key: 'community', icon: '🌐' },
	// Was entirely missing — the lock-icon logic below (`item.key === 'vip'`)
	// already existed and had a real i18n key (nav.vip) waiting, but with no
	// 'vip' entry in this list it could never fire: Membership/VIP was only
	// reachable from the homepage "Programs" orb, never from this nav once
	// you'd left home.
	{ to: '/pricing', key: 'vip', icon: '💎' },
	{ to: '/creator-panel', key: 'creator', icon: '✨' },
	{ to: '/writers-hub', key: 'writers', icon: '✍️' },
	{ to: '/you', key: 'profile', icon: '👤' },
];

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  read: number;
}

const NotificationBell: React.FC = () => {
	const { isAuthenticated } = useAuth();
	const [unread, setUnread] = useState(0);
	const [open, setOpen] = useState(false);
	const [notifications, setNotifications] = useState<NotificationItem[]>([]);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const fetchUnread = async () => {
		try {
			const res = await axios.get<{ count: number }>(`${API_URL}/api/notifications/unread-count`, { withCredentials: true });
			setUnread(res.data.count || 0);
		} catch { /* silent */ }
	};

	const fetchNotifications = async () => {
		try {
			const res = await axios.get<{ items: NotificationItem[] }>(`${API_URL}/api/notifications`, { withCredentials: true });
			setNotifications((res.data.items || []).slice(0, 10));
		} catch { /* silent */ }
	};

	const markAllRead = async () => {
		try {
			await axios.post(`${API_URL}/api/notifications/read-all`, {}, { withCredentials: true });
			setUnread(0);
		} catch { /* silent */ }
	};

	useEffect(() => {
		if (!isAuthenticated) return;
		fetchUnread();
		const interval = setInterval(fetchUnread, 60000);
		return () => clearInterval(interval);
	}, [isAuthenticated]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open]);

	const handleOpen = async () => {
		const next = !open;
		setOpen(next);
		if (next) {
			await fetchNotifications();
			await markAllRead();
		}
	};

	if (!isAuthenticated) return null;

	return (
		<div className="nav-bell-wrap" ref={dropdownRef}>
			<button
				className="nav-bell-btn"
				onClick={handleOpen}
				aria-label="Notifications"
			>
				🔔
				{unread > 0 && <span className="nav-bell-badge">{unread > 99 ? '99+' : unread}</span>}
			</button>
			{open && (
				<div className="nav-bell-dropdown">
					<div className="nav-bell-dropdown-header">
						<strong>Notifications</strong>
					</div>
					{notifications.length === 0 ? (
						<p className="nav-bell-empty">No notifications</p>
					) : (
						notifications.map(n => (
							<div key={n.id} className="nav-bell-item">
								<strong className="nav-bell-item-title">{n.title}</strong>
								<p className="nav-bell-item-msg">{n.message}</p>
								<span className="nav-bell-item-time">
									{new Date(n.createdAt).toLocaleString()}
								</span>
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
};

const Nav: React.FC = () => {
	const [menuOpen, setMenuOpen] = useState(false);
	const [paymentsActive, setPaymentsActive] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [messengerOpen, setMessengerOpen] = useState(false);
	const [messengerUnread, setMessengerUnread] = useState(0);
	const { t } = useTranslation();
	const { user, isAuthenticated } = useAuth();
	const location = useLocation();
	// These 6 pages now carry their own OrbNavStrip (the mini module-orb row
	// added right under each page's header) — showing this bar's full module
	// link row there too duplicated the exact same 7 destinations twice on
	// one screen (reported live: "old top bar" + "new bottom one"). Everywhere
	// else (Community, Admin, …) has no OrbNavStrip, so the links stay here —
	// this only hides them where the replacement already exists. Search,
	// notifications, messenger, settings, language and the admin link are
	// untouched; none of those have an OrbNavStrip equivalent.
	const hasOrbStrip = (ORBIT_STRIP_PATHS as readonly string[]).includes(location.pathname);

	useEffect(() => {
		fetch(`${API_URL}/api/config/features`)
			.then(r => r.json())
			.then(data => setPaymentsActive(!!data.paymentsActive))
			.catch(() => {});
	}, []);

	return (
	<>
		<nav className="nav-container" role="navigation">
			{/* Desktop Nav */}
			<div className="nav-desktop">
				<div className="nav-brand">{t('nav.brand')}</div>
				<div className="nav-links-desktop">
					{!hasOrbStrip && linkKeys.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
						>
							{t(`nav.${item.key}`)}
							{item.key === 'vip' && !paymentsActive && (
								<span className="nav-lock" title={t('nav.availableAfterLaunch', 'Available after launch')}>🔒</span>
							)}
						</NavLink>
					))}
					{user?.isAdmin && (
						<a href="/admin" className="nav-admin-link">
							🧠 Admin
						</a>
					)}
				</div>
				<GlobalSearch />
				<LanguageSelector compact />
				<div className="nav-icon-group">
					<NotificationBell />
					{isAuthenticated && (
						<button
							className="nav-messenger-btn"
							onClick={() => setMessengerOpen(o => !o)}
							aria-label={t('messenger.title')}
						>
							💬
							{messengerUnread > 0 && (
								<span className="nav-messenger-badge">{messengerUnread > 99 ? '99+' : messengerUnread}</span>
							)}
						</button>
					)}
					{isAuthenticated && (
						<button
							className="nav-settings-btn"
							onClick={() => setSettingsOpen(true)}
							aria-label={t('settings.title')}
						>
							⚙️
						</button>
					)}
				</div>
			</div>

			{/* Mobile Nav */}
			<div className="nav-mobile">
				<div className="nav-brand">{t('nav.brandMobile')}</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<LanguageSelector compact />
					<div className="nav-icon-group">
						<NotificationBell />
						{isAuthenticated && (
							<button
								className="nav-messenger-btn"
								onClick={() => setMessengerOpen(o => !o)}
								aria-label={t('messenger.title')}
							>
								💬
								{messengerUnread > 0 && (
									<span className="nav-messenger-badge">{messengerUnread > 99 ? '99+' : messengerUnread}</span>
								)}
							</button>
						)}
						{isAuthenticated && (
							<button
								className="nav-settings-btn"
								onClick={() => setSettingsOpen(true)}
								aria-label={t('settings.title')}
							>
								⚙️
							</button>
						)}
					</div>
					{/* Nothing left to show in the dropdown once the module links
						are hidden here (OrbNavStrip already covers them) unless
						there's an admin link too — hide the toggle itself rather
						than leave a button that opens an empty menu. */}
					{(!hasOrbStrip || user?.isAdmin) && (
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
					)}
				</div>
			</div>

			{/* Mobile Menu Dropdown */}
			{menuOpen && (
				<div className="nav-mobile-menu">
					{!hasOrbStrip && linkKeys.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => `nav-mobile-link ${isActive ? 'active' : ''}`}
							onClick={() => setMenuOpen(false)}
						>
							<span className="mobile-link-icon">{item.icon}</span>
							<span className="mobile-link-label">
								{t(`nav.${item.key}`)}
								{item.key === 'vip' && !paymentsActive && ' 🔒'}
							</span>
						</NavLink>
					))}
					{user?.isAdmin && (
						<a href="/admin" className="nav-admin-link nav-mobile-link" onClick={() => setMenuOpen(false)}>
							<span className="mobile-link-icon">🧠</span>
							<span className="mobile-link-label">Admin</span>
						</a>
					)}
				</div>
			)}
		</nav>

		{settingsOpen && (
			<SettingsModal onClose={() => setSettingsOpen(false)} />
		)}

		{messengerOpen && isAuthenticated && (
			<>
				<div className="nav-messenger-backdrop" onClick={() => setMessengerOpen(false)} />
				<div className="nav-messenger-panel">
					<div className="nav-messenger-panel-header">
						<span>💬 Mesaje</span>
						<button className="nav-messenger-close" onClick={() => setMessengerOpen(false)}>✕</button>
					</div>
					<MessengerPanel
						onUnreadCountChange={setMessengerUnread}
					/>
				</div>
			</>
		)}
	</>
	);

};

export default Nav;
