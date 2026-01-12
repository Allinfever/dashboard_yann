import React from 'react';
import Sidebar from './Sidebar';
import TopTabs from './TopTabs';
import styles from './MainLayout.module.css';

const MainLayout = ({ children }) => {
    return (
        <div className={styles.layout}>
            <Sidebar />
            <main className={styles.mainContent}>
                <div className={styles.scrollableArea}>
                    <div className={styles.contentWrapper}>
                        <TopTabs />
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
