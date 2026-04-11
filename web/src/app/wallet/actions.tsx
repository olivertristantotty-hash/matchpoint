"use client";

import { useState } from "react";

export default function WalletActions({ available }: { available: number }) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const tokenAmount = parseInt(amount) || 0;
  const dollarValue = (tokenAmount / 100).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenAmount <= 0) return;
    setLoading(true);
    setMessage(null);

    const res = await fetch(`/api/wallet/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: tokenAmount }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage({ text: data.message, ok: true });
      setAmount("");
      setTimeout(() => window.location.reload(), 1000);
    } else {
      setMessage({ text: data.error, ok: false });
    }
  };

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["deposit", "withdraw"] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setMessage(null); }} style={{
            padding: "8px 20px", borderRadius: "8px", border: "1px solid var(--border)",
            background: mode === m ? "var(--accent)" : "transparent",
            color: mode === m ? "white" : "var(--text-muted)",
            cursor: "pointer", fontSize: "14px", fontWeight: 600, textTransform: "capitalize",
          }}>{m}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", color: "var(--text-muted)", fontSize: "12px", marginBottom: "6px" }}>
          {mode === "deposit" ? "Amount to deposit (tokens)" : "Amount to withdraw (tokens)"}
        </label>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="500" min={1} max={mode === "withdraw" ? available : undefined} required
            style={{
              flex: 1, padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)", fontSize: "16px",
            }} />
          <span style={{ color: "var(--text-muted)", fontSize: "14px", minWidth: "70px" }}>≈ ${dollarValue}</span>
        </div>

        {mode === "withdraw" && (
          <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "6px" }}>
            Max: {available} tokens (${(available / 100).toFixed(2)}) · Min: 100 tokens
          </div>
        )}

        <button type="submit" disabled={loading || tokenAmount <= 0} style={{
          marginTop: "14px", width: "100%", padding: "12px", borderRadius: "8px", border: "none",
          background: mode === "deposit" ? "var(--accent)" : "var(--accent)",
          color: "white", fontSize: "15px", fontWeight: 600,
          cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "Processing..." : mode === "deposit" ? `Deposit ${tokenAmount} tokens` : `Withdraw ${tokenAmount} tokens`}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: "12px", padding: "10px 14px", borderRadius: "8px", background: "var(--bg)",
          color: message.ok ? "var(--green)" : "var(--red)", fontSize: "13px",
        }}>{message.text}</div>
      )}

      <div style={{
        marginTop: "20px", padding: "14px", borderRadius: "8px",
        background: "var(--bg)", border: "1px solid var(--border)", fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6,
      }}>
        {mode === "deposit"
          ? "This is a test deposit — tokens are credited instantly. In production, deposits will be processed via USDC on Base network."
          : "This is a test withdrawal — tokens are deducted instantly. In production, withdrawals will send USDC to your linked wallet address."
        }
      </div>
    </div>
  );
}
