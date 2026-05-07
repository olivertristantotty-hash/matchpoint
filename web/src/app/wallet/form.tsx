"use client";

import { useState } from "react";

export default function DepositWithdrawForm({ available }: { available: number }) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/wallet/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseInt(amount) }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Something went wrong");
      } else {
        setMessage(data.message);
        setAmount("");
        // Refresh the page to show updated balance
        window.location.reload();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  };

  const tokenAmount = parseInt(amount) || 0;
  const dollarValue = (tokenAmount / 100).toFixed(2);

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "24px",
    }}>
      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMessage(""); }}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: mode === m ? "var(--accent)" : "transparent",
              color: mode === m ? "white" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", color: "var(--text-muted)", fontSize: "13px", marginBottom: "6px" }}>
          {mode === "deposit" ? "Amount to deposit" : "Amount to withdraw"}
        </label>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500"
            min={1}
            max={mode === "withdraw" ? available : undefined}
            required
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "16px",
            }}
          />
          <span style={{ color: "var(--text-muted)", fontSize: "14px", minWidth: "80px" }}>
            ≈ ${dollarValue}
          </span>
        </div>

        {mode === "withdraw" && (
          <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "8px" }}>
            Max: {available} MP (${(available / 100).toFixed(2)})
          </div>
        )}

        <button
          type="submit"
          disabled={loading || tokenAmount <= 0}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "none",
            background: mode === "deposit" ? "var(--green)" : "var(--accent)",
            color: "white",
            fontSize: "15px",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Processing..." : mode === "deposit" ? `Deposit ${tokenAmount} MP` : `Withdraw ${tokenAmount} MP`}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: "16px",
          padding: "12px",
          borderRadius: "8px",
          background: "var(--bg)",
          color: message.includes("error") || message.includes("Insufficient") ? "var(--red)" : "var(--green)",
          fontSize: "14px",
        }}>
          {message}
        </div>
      )}

      <div style={{
        marginTop: "24px",
        padding: "16px",
        borderRadius: "8px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6 }}>
          {mode === "deposit" ? (
            <>
              Deposits are processed via USDC on Base network. Send USDC to your deposit address
              and MP will be credited automatically. 100 MP = $1.00 USDC.
            </>
          ) : (
            <>
              Withdrawals are sent as USDC to your linked wallet address.
              Processing time: usually under 5 minutes. Minimum withdrawal: 100 MP ($1.00).
            </>
          )}
        </div>
      </div>
    </div>
  );
}
