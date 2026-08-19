import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface PaymentClaim {
  _id: string;
  user?: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  month: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected";
  reportedAt: string;
  ledgerId: string | null;
}

export default function PaymentClaims({ token, refreshKey }: { token: string; refreshKey: number }) {
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    const fetchClaims = async () => {
      if (!token) {
        setError("Admin token is missing.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await api("/api/admin/payment-claims", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClaims(data || []);
      } catch (err: any) {
        console.error("Full API Error:", err);
        setError(err.message || "Failed to fetch payment claims.");
      } finally {
        setLoading(false);
      }
    };

    fetchClaims();
  }, [token, refreshKey, localRefresh]);

  // Handle Reverse: Deletes the Ledger if it exists, then reverts claim to reported
  const handleReverse = async (claim: PaymentClaim) => {
    if (!window.confirm(`Are you sure you want to reverse the payment for ${claim.user?.firstName || 'this member'}? This will reset the claim to "reported" so they can pay again.`)) {
      return;
    }

    try {
      // If we have a ledgerId, call the DELETE endpoint
      if (claim.ledgerId) {
        await api('/api/admin/payments/' + claim.ledgerId, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        // If no ledgerId exists, use the new unconfirm endpoint
        await api('/api/admin/payment-claims/' + claim._id + '/unconfirm', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setLocalRefresh(k => k + 1);
    } catch (err: any) {
      alert('Failed to reverse payment: ' + (err.message || 'Unknown error'));
    }
  };

  // Handle Reopen: Only for rejected claims
  const handleReopen = async (claim: PaymentClaim) => {
    if (!window.confirm(`Are you sure you want to reopen the rejected claim for ${claim.user?.firstName || 'this member'}?`)) {
      return;
    }

    try {
      await api('/api/admin/payment-claims/' + claim._id + '/revert', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setLocalRefresh(k => k + 1);
    } catch (err: any) {
      alert('Failed to reopen claim: ' + (err.message || 'Unknown error'));
    }
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border dark:border-slate-700">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Payment Claims</h2>
        <p className="text-slate-500 dark:text-slate-400">Loading claims...</p>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border border-red-200 dark:border-red-900">
        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Error Loading Claims</h2>
        <p className="text-slate-600 dark:text-slate-300">{error}</p>
      </div>
    );
  }

  // --- Empty State ---
  if (claims.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border dark:border-slate-700">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Payment Claims</h2>
        <p className="text-slate-500 dark:text-slate-400">No payment claims have been reported yet.</p>
      </div>
    );
  }

  // --- Data Display State ---
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow border dark:border-slate-700">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-5">Payment Claims</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Month</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Reported At</th>
              <th className="px-4 py-3 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-700">
            {claims.map((claim) => {
              const fullName = claim.user 
                ? `${claim.user.firstName || ''} ${claim.user.lastName || ''}`.trim() 
                : '';
              const displayName = fullName || claim.user?.username || 'Unknown';

              return (
                <tr key={claim._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    {displayName}
                  </td>
                  <td className="px-4 py-3">{claim.month}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                    ₦{claim.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                      claim.status === 'confirmed' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
                        : claim.status === 'rejected' 
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' 
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    }`}>
                      {claim.status ? claim.status.charAt(0).toUpperCase() + claim.status.slice(1) : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(claim.reportedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {/* Button for ALL confirmed claims */}
                    {claim.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => handleReverse(claim)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-100 rounded hover:bg-red-200 dark:text-red-300 dark:bg-red-900/30 transition"
                      >
                        Reverse
                      </button>
                    )}
                    {/* Reopen button for rejected claims */}
                    {claim.status === 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handleReopen(claim)}
                        className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-100 rounded hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/30 transition"
                      >
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}