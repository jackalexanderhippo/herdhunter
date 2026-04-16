"use client";

import { useEffect, useState } from "react";

type AccountData = {
  name: string | null;
  email: string | null;
  providers: string[];
  hasPassword: boolean;
};

export default function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((data) => setAccount(data))
      .finally(() => setLoading(false));
  }, []);

  const updatePassword = async () => {
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to update password.");
      setSaving(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password updated.");
    setAccount((prev) => (prev ? { ...prev, hasPassword: true } : prev));
    setSaving(false);
  };

  if (loading) return <div className="empty-state">Loading…</div>;
  if (!account) return <div className="empty-state">Unable to load account details</div>;

  return (
    <div style={{ maxWidth: "720px", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>Manage sign-in options for your user.</p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Profile</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</div>
            <div>{account.name ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</div>
            <div>{account.email ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Connected Providers</div>
            <div>{account.providers.length > 0 ? account.providers.join(", ") : "None"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
          {account.hasPassword ? "Change Password" : "Set Password"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {account.hasPassword && (
            <div className="form-group">
              <label htmlFor="current-password">Current Password</label>
              <input id="current-password" className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="new-password">New Password</label>
            <input id="new-password" className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">Confirm New Password</label>
            <input id="confirm-password" className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={updatePassword} disabled={saving}>
              {saving ? "Saving…" : account.hasPassword ? "Change Password" : "Set Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
