import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';

const MinimalBillerDashboard = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchitems = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/items`);
                if (res.ok) {
                    const data = await res.json();
                    setItems(data);
                } else {
                    setError("Failed to fetch");
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchitems();
    }, []);

    if (loading) return <div>Loading Minimal...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="p-4">
            <h1>Minimal Dashboard</h1>
            <p>Count: {items.length}</p>
            <ul>
                {items.slice(0, 10).map(i => <li key={i._id}>{i.itemName}</li>)}
            </ul>
        </div>
    );
};

export default MinimalBillerDashboard;
