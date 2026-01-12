import React from 'react';
import { NavLink } from 'react-router-dom';
import { navConfig } from '../../config/nav.config';
import styles from './Sidebar.module.css';
import classNames from 'classnames';

const Sidebar = () => {
    return (
        <aside className={styles.sidebar}>
            <div className={styles.brand}>
                Dashboard Yann
            </div>
            <nav className={styles.nav}>
                {navConfig.map((item) => {
                    // Determine the target URL with the default first tab if available
                    const defaultTab = item.tabs && item.tabs.length > 0 ? item.tabs[0].id : null;
                    const targetPath = defaultTab ? `${item.path}?tab=${defaultTab}` : item.path;

                    return (
                        <NavLink
                            key={item.id}
                            to={targetPath}
                            className={({ isActive }) =>
                                classNames(styles.navLink, { [styles.active]: isActive })
                            }
                        >
                            <span className={styles.icon}>{item.icon}</span>
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>
        </aside>
    );
};

export default Sidebar;
