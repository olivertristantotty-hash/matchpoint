"use client";

import { useState, useEffect } from "react";
import QRCode from "./qr-code";

interface DepositRecord {
  id: string;
  status: string;
  sourceCurrency: string | null;
  usdValue: string | null;
  tokenAmount: number | null;
  createdAt: string;
}

interface WithdrawalRecord {
  id: string;
  status: string;
  tokenAmount: number;
  withdrawalFee: number;
  usdValue: string;
  destinationAddress: string;
  createdAt: string;
}

interface WalletActionsProps {
  depositAddress: string | null;
  savedWithdrawalAddress: string | null;
  dailyWithdrawalCount: number;
  balance: number;
  recentDeposits: DepositRecord[];
  recentWithdrawals: WithdrawalRecord[];
  maintenanceMode: boolean;
}

export default function WalletActions({
  depositAddress: initialDepositAddress,
  savedWithdrawalAddress,
  dailyWithdrawalCount,
  balance,
  recentDeposits,
  recentWithdrawals,
  maintenanceMode,
}: WalletActionsProps) {
  const [tab, setTab] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState(savedWithdrawalAddress ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [depositAddress, setDepositAddress] = useState(initialDepositAddress);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Auto-provision deposit address if none exists
  useEffect(() => {
    if (depositAddress || addressLoading || addressError) return;
    setAddressLoading(true);
    fetch("/api/wallet/deposit-address")
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.address) {
          setDepositAddress(data.address);
        } else {
          setAddressError(data.error || "Failed to load deposit address");
        }
      })
      .catch(() => setAddressError("Network error. Please try again."))
      .finally(() => setAddressLoading(false));
  }, [depositAddress, addressLoading, addressError]);

  const tokenAmount = parseInt(amount) || 0;
  const fee = 50;
  const netUsdc = ((tokenAmount - fee) / 100).toFixed(2);
  const remainingWithdrawals = Math.max(0, 3 - dailyWithdrawalCount);

  const copyAddress = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenAmount <= 0 || !address) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tokenAmount, destinationAddress: address }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ text: "Withdrawal submitted. Status: Pending.", ok: true });
        setAmount("");
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMessage({ text: data.error || "Withdrawal failed", ok: false });
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px" }}>
      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["deposit", "withdrawal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setMessage(null); }}
            style={{
              padding: "8px 20px", borderRadius: "8px", border: "1px solid var(--border)",
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--text-muted)",
              fontSize: "14px", fontWeight: 600, textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {maintenanceMode && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "16px",
          background: "rgba(243, 156, 18, 0.1)", border: "1px solid var(--yellow)",
          color: "var(--yellow)", fontSize: "13px", fontWeight: 500,
        }}>
          ⚠ System under maintenance. Deposits and withdrawals are temporarily paused.
        </div>
      )}

      {/* ── Deposit Tab ── */}
      {tab === "deposit" && (
        <div>
          {depositAddress ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <QRCode value={depositAddress} size={180} />
              </div>

              <label style={{ display: "block", color: "var(--text-muted)", fontSize: "12px", marginBottom: "6px" }}>
                Your Deposit Address (USDC on Solana)
              </label>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "10px 14px",
              }}>
                <code style={{
                  flex: 1, fontSize: "13px", color: "var(--text)",
                  wordBreak: "break-all", fontFamily: "monospace",
                }}>
                  {depositAddress}
                </code>
                <button
                  onClick={copyAddress}
                  style={{
                    padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border)",
                    background: copied ? "var(--green)" : "transparent",
                    color: copied ? "white" : "var(--text-muted)",
                    fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Minimum deposit notice */}
              <div style={{
                marginTop: "16px", padding: "12px 14px", borderRadius: "8px",
                background: "var(--bg)", border: "1px solid var(--border)",
                fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.6,
              }}>
                <div style={{ marginBottom: "8px" }}>
                  <span style={{ color: "var(--yellow)", fontWeight: 600 }}>Minimum deposit:</span>{" "}
                  $5.00 (500 MP). Deposits below this amount will not be credited.
                </div>
                <div>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>Supported currencies:</span>{" "}
                  USDC on Solana (primary). BTC, ETH, and SOL deposits are auto-converted to USDC.
                </div>
              </div>

              {/* Recent Deposits */}
              {recentDeposits.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "8px" }}>
                    Recent Deposits
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {recentDeposits.map((d) => (
                      <div key={d.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "var(--bg)", borderRadius: "6px", padding: "8px 12px", fontSize: "12px",
                      }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <StatusBadge status={d.status} />
                          <span style={{ color: "var(--text-muted)" }}>
                            {d.sourceCurrency?.toUpperCase() || "USDC"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          {d.usdValue && (
                            <span style={{ color: "var(--text-muted)" }}>${parseFloat(d.usdValue).toFixed(2)}</span>
                          )}
                          {d.tokenAmount != null && d.tokenAmount > 0 && (
                            <span style={{ color: "var(--green)", fontWeight: 600, fontFamily: "monospace" }}>
                              +{d.tokenAmount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
              {addressLoading ? (
                <p style={{ fontSize: "14px" }}>Loading deposit address...</p>
              ) : (
                <>
                  <p style={{ fontSize: "14px", marginBottom: "4px" }}>
                    Unable to load deposit address.
                  </p>
                  {addressError && (
                    <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "8px" }}>
                      {addressError}
                    </p>
                  )}
                  <button
                    onClick={() => { setAddressLoading(false); setAddressError(null); setDepositAddress(null); }}
                    style={{
                      padding: "8px 20px", borderRadius: "8px", border: "1px solid var(--border)",
                      background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600,
                    }}
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Withdrawal Tab ── */}
      {tab === "withdrawal" && (
        <div>
          <form onSubmit={handleWithdraw}>
            {/* Amount input */}
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: "12px", marginBottom: "6px" }}>
              Amount (MP)
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
                min={1000}
                max={balance - fee}
                required
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: "8px",
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", fontSize: "16px",
                }}
              />
              <button
                type="button"
                onClick={() => setAmount(String(Math.max(0, balance - fee)))}
                style={{
                  padding: "10px 16px", borderRadius: "8px",
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--accent)", fontSize: "13px", fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Max
              </button>
              <span style={{ color: "var(--text-muted)", fontSize: "14px", minWidth: "80px" }}>
                ≈ ${(tokenAmount / 100).toFixed(2)}
              </span>
            </div>

            {/* Solana address input */}
            <label style={{ display: "block", color: "var(--text-muted)", fontSize: "12px", marginBottom: "6px" }}>
              Solana Wallet Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your Solana wallet address"
              required
              style={{
                width: "100%", padding: "12px 16px", borderRadius: "8px",
                border: "1px solid var(--border)", background: "var(--bg)",
                color: "var(--text)", fontSize: "14px", fontFamily: "monospace",
                marginBottom: "16px",
              }}
            />

            {/* Fee & limit info */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px",
            }}>
              <div style={{
                background: "var(--bg)", borderRadius: "8px", padding: "10px 12px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Withdrawal Fee</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>50 MP ($0.50)</div>
              </div>
              <div style={{
                background: "var(--bg)", borderRadius: "8px", padding: "10px 12px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Daily Limit</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: remainingWithdrawals === 0 ? "var(--red)" : "var(--text)" }}>
                  {remainingWithdrawals}/3 remaining
                </div>
              </div>
              <div style={{
                background: "var(--bg)", borderRadius: "8px", padding: "10px 12px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Min Withdrawal</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>1,000 MP ($10.00)</div>
              </div>
              <div style={{
                background: "var(--bg)", borderRadius: "8px", padding: "10px 12px",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Net USDC You Receive</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: tokenAmount >= 1050 ? "var(--green)" : "var(--text-muted)" }}>
                  {tokenAmount >= 1050 ? `$${netUsdc} USDC` : "—"}
                </div>
              </div>
            </div>

            <div style={{ color: "var(--text-muted)", fontSize: "12px", marginBottom: "12px" }}>
              Available: {balance} MP (${(balance / 100).toFixed(2)})
              {tokenAmount > 0 && ` · Total deducted: ${tokenAmount + fee} MP`}
            </div>

            <button
              type="submit"
              disabled={loading || tokenAmount < 1000 || !address || maintenanceMode || remainingWithdrawals === 0}
              style={{
                width: "100%", padding: "12px", borderRadius: "8px", border: "none",
                background: "var(--accent)", color: "white", fontSize: "15px", fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                opacity: (loading || maintenanceMode || remainingWithdrawals === 0) ? 0.5 : 1,
              }}
            >
              {loading ? "Processing..." : `Withdraw ${tokenAmount > 0 ? tokenAmount : ""} MP`}
            </button>
          </form>

          {message && (
            <div style={{
              marginTop: "12px", padding: "10px 14px", borderRadius: "8px",
              background: "var(--bg)", fontSize: "13px",
              color: message.ok ? "var(--green)" : "var(--red)",
            }}>
              {message.text}
            </div>
          )}

          {/* Recent Withdrawals */}
          {recentWithdrawals.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "8px" }}>
                Recent Withdrawals
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {recentWithdrawals.map((w) => (
                  <div key={w.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "var(--bg)", borderRadius: "6px", padding: "8px 12px", fontSize: "12px",
                  }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <StatusBadge status={w.status} />
                      <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {w.destinationAddress.slice(0, 6)}...{w.destinationAddress.slice(-4)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ color: "var(--text-muted)" }}>${w.usdValue}</span>
                      <span style={{ color: "var(--red)", fontWeight: 600, fontFamily: "monospace" }}>
                        -{w.tokenAmount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Powered by NOWPayments */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "6px", marginTop: "20px", paddingTop: "16px",
        borderTop: "1px solid var(--border)",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <a
          href="https://nowpayments.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "11px", color: "var(--text-muted)", textDecoration: "none",
            opacity: 0.6, letterSpacing: "0.3px",
          }}
        >
          Powered by <span style={{ fontWeight: 600 }}>NOWPayments</span>
        </a>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(243, 156, 18, 0.15)", text: "var(--yellow)" },
    confirming: { bg: "rgba(243, 156, 18, 0.15)", text: "var(--yellow)" },
    confirmed: { bg: "rgba(39, 174, 96, 0.15)", text: "var(--green)" },
    processing: { bg: "rgba(243, 156, 18, 0.15)", text: "var(--yellow)" },
    completed: { bg: "rgba(39, 174, 96, 0.15)", text: "var(--green)" },
    failed: { bg: "rgba(231, 76, 60, 0.15)", text: "var(--red)" },
  };
  const c = colors[status] || colors.pending;

  return (
    <span style={{
      padding: "2px 8px", borderRadius: "4px", fontSize: "11px",
      fontWeight: 600, textTransform: "capitalize",
      background: c.bg, color: c.text,
    }}>
      {status}
    </span>
  );
}
