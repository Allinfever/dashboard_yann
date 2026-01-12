import React, { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { navConfig } from '../../config/nav.config';
import styles from './TopTabs.module.css';
import classNames from 'classnames';

const TopTabs = () => {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    // Find the current active section config based on the path
    const currentSection = navConfig.find(item => location.pathname.startsWith(item.path));
    const currentTabId = searchParams.get('tab');

    // If no section found or no tabs for this section, render nothing
    if (!currentSection || !currentSection.tabs || currentSection.tabs.length === 0) {
        return null;
    }

    // Handle tab click
    const handleTabClick = (tabId) => {
        setSearchParams({ tab: tabId });
    };

    return (
        <div className={styles.container}>
            <ul className={styles.tabsList}>
                {currentSection.tabs.map((tab) => (
                    <li key={tab.id} className={styles.tabItem}>
                        <button
                            className={classNames(styles.tabButton, {
                                [styles.active]: currentTabId === tab.id
                            })}
                            onClick={() => handleTabClick(tab.id)}
                        >
                            {tab.label}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TopTabs;
