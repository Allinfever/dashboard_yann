import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Rocket, Target, Bug, ClipboardList, ChartColumn, ChartLine, CalendarRange, FolderKanban, BookOpen, Download, FolderOpen, Sun, Moon, ChevronRight, Circle
} from 'lucide-react';
import { navConfig, navGroups } from '../../config/nav.config';
import styles from './Sidebar.module.css';
import classNames from 'classnames';

const isInSection = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`);

// Icons referenced by name in nav.config.js
const ICONS = { Rocket, Target, Bug, ClipboardList, ChartColumn, ChartLine, CalendarRange, FolderKanban, BookOpen, Download, FolderOpen, Sun, Moon };

const NavIcon = ({ name }) => {
    const Icon = ICONS[name] || Circle;
    return <span className={styles.icon}><Icon size={16} strokeWidth={1.75} aria-hidden="true" /></span>;
};

const renderNavLink = (item, nested = false) => {
    // Determine the target URL with the default first tab if available
    const defaultTab = item.tabs && item.tabs.length > 0 ? item.tabs[0].id : null;
    const targetPath = defaultTab ? `${item.path}?tab=${defaultTab}` : item.path;

    return (
        <NavLink
            key={item.id}
            to={targetPath}
            className={({ isActive }) =>
                classNames(styles.navLink, { [styles.active]: isActive, [styles.nested]: nested })
            }
        >
            <NavIcon name={item.icon} />
            {item.label}
        </NavLink>
    );
};

const NavGroup = ({ group, items }) => {
    const location = useLocation();
    const containsActive = items.some(item => isInSection(location.pathname, item.path));
    const [open, setOpen] = useState(containsActive);

    // Keep the group expanded when navigating to one of its entries
    const [prevContainsActive, setPrevContainsActive] = useState(containsActive);
    if (containsActive !== prevContainsActive) {
        setPrevContainsActive(containsActive);
        if (containsActive) setOpen(true);
    }

    return (
        <div className={styles.group}>
            <button
                type="button"
                className={classNames(styles.navLink, styles.groupToggle, { [styles.groupActive]: containsActive && !open })}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <NavIcon name={group.icon} />
                {group.label}
                <span className={classNames(styles.chevron, { [styles.chevronOpen]: open })}><ChevronRight size={14} aria-hidden="true" /></span>
            </button>
            {open && (
                <div className={styles.groupItems}>
                    {items.map(item => renderNavLink(item, true))}
                </div>
            )}
        </div>
    );
};

const ThemeToggle = () => {
    const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem('theme', theme);
        } catch {
            // Storage unavailable: the theme simply isn't remembered
        }
    }, [theme]);

    const isLight = theme === 'light';
    return (
        <button
            type="button"
            className={classNames(styles.navLink, styles.themeToggle)}
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
            title={isLight ? 'Passer en mode sombre' : 'Passer en mode clair'}
        >
            <NavIcon name={isLight ? 'Moon' : 'Sun'} />
            {isLight ? 'Mode sombre' : 'Mode clair'}
        </button>
    );
};

const Sidebar = () => {
    const topLevel = navConfig.filter(item => !item.group);

    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                Dashboard Yann
            </div>
            <nav className={styles.nav}>
                {topLevel.map(item => renderNavLink(item))}
                {navGroups.map(group => {
                    const items = navConfig.filter(item => item.group === group.id);
                    return items.length > 0 && <NavGroup key={group.id} group={group} items={items} />;
                })}
            </nav>
            <div className={styles.footer}>
                <ThemeToggle />
            </div>
        </aside>
    );
};

export default Sidebar;
