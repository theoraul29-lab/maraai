import React, { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import { LanguageSelector } from './components/LanguageSelector';
import { GlobalSearch } from './components/GlobalSearch';
import axios from 'axios';
import './styles/Nav.css';
import './styles/GlobalSearch.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const linkKeys = [
	{ to: '/', key: 'home', icon: '🏠' },
	{ to: '/reels', key: 'reels', icon: '🎬' },
	{ to: '/trading-academy', key: 'trading', icon: '📈' },
	{ to: '/membership', key: 'vip', icon: '👑' },
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
				<NotificationBell />
				<LanguageSelector compact />
			</div>

			{/* Mobile Nav */}
			<div className="nav-mobile">
				<div className="nav-brand">{t('nav.brandMobile')}</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<NotificationBell />
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
