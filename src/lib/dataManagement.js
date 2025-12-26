import { db } from '../db/db';

export const exportData = async () => {
    try {
        const assets = await db.assets.toArray();
        const transactions = await db.transactions.toArray();
        const watchlist = await db.watchlist.toArray();
        const cash = await db.cash.toArray();

        const data = {
            version: 1,
            timestamp: new Date().toISOString(),
            assets,
            transactions,
            watchlist,
            cash
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `stocktracker_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    } catch (error) {
        console.error("Export failed:", error);
        return false;
    }
};

export const importData = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Validate structure roughly
                if (!data.assets || !data.transactions) {
                    throw new Error("Invalid backup file format");
                }

                await db.transaction('rw', db.assets, db.transactions, db.watchlist, db.cash, async () => {
                    // Clear existing
                    await db.assets.clear();
                    await db.transactions.clear();
                    await db.watchlist.clear();
                    await db.cash.clear();

                    // Add new
                    await db.assets.bulkAdd(data.assets);
                    await db.transactions.bulkAdd(data.transactions);
                    if (data.watchlist) await db.watchlist.bulkAdd(data.watchlist);
                    if (data.cash) await db.cash.bulkAdd(data.cash);
                });

                resolve(true);
            } catch (error) {
                console.error("Import failed:", error);
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};

export const clearData = async () => {
    try {
        await db.transaction('rw', db.assets, db.transactions, db.watchlist, db.cash, async () => {
            await db.assets.clear();
            await db.transactions.clear();
            await db.watchlist.clear();
            await db.cash.clear();
        });
        return true;
    } catch (error) {
        console.error("Clear failed:", error);
        return false;
    }
};
