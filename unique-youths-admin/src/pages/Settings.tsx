import React, { useEffect, useState } from 'react';
import { api } from '../lib/api'; // adjust import based on your project

const Settings = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api('/api/admin/settings/payment-reporting');
        setIsOpen(res.open);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStatus();
  }, []);

  const toggleStatus = async () => {
    setLoading(true);
    try {
      const res = await api('/api/admin/settings/payment-reporting', {
        method: 'POST',
        body: JSON.stringify({ open: !isOpen }),
      });
      setIsOpen(res.open);
    } catch (err) {
      console.error(err);
      alert('Failed to update payment window status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">
        Payment Window
      </h1>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Status: {isOpen ? 'Open' : 'Closed'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              When closed, members will see "Payment reporting is currently closed" and the button will be disabled.
            </p>
          </div>
          <button
            onClick={toggleStatus}
            disabled={loading}
            className={`px-6 py-3 rounded-xl font-bold text-white shadow-md transition ${
              isOpen
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? 'Updating...' : isOpen ? 'Close Window' : 'Open Window'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;