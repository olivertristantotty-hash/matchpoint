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
  bonusClaimed: boolean;
}

export default function WalletActions({
  depositAddress: initialDepositAddress,
  savedWithdrawalAddress,
  dailyWithdrawalCount,
  balance,
  recentDeposits,
  recentWithdrawals,
  maintenanceMode,
  bonusClaimed,
}: WalletActionsProps) {
  const [tab, setTab] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState(savedWithdrawalAddress ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [depositAddress, setDepositAddress] = useState(initialDepositAddress);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

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
    <div style={{
      background: "var(--bg-card)",
      backdropFilter: "blur(var(--glass-blur))",
      WebkitBackdropFilter: "blur(var(--glass-blur))",
      border: "1px solid var(--border)",
      borderRadius: "var(--card-radius)",
      padding: "1.5rem",
    }}>
      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {(["deposit", "withdrawal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setMessage(null); }}
            style={{
              padding: "0.5rem 1.25rem", borderRadius: "var(--card-radius)",
              border: "1px solid var(--border)",
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--text-muted)",
              fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-wide)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {maintenanceMode && (
        <div style={{
          padding: "0.75rem 1rem", borderRadius: "var(--card-radius)", marginBottom: "1rem",
          background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.3)",
          color: "var(--yellow)", fontSize: "0.8rem", fontWeight: 500,
        }}>
          ⚠ System under maintenance. Deposits and withdrawals are temporarily paused.
        </div>
      )}

      {/* ── Deposit Tab ── */}
      {tab === "deposit" && (
        <div>
          {depositAddress ? (
            <>
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <QRCode value={depositAddress} size={180} />
              </div>

              <label style={{
                display: "block", color: "var(--text-muted)", fontSize: "0.7rem",
                marginBottom: "0.375rem", textTransform: "uppercase",
                letterSpacing: "var(--letter-spacing-wide)", fontWeight: 500,
              }}>
                Your Deposit Address (USDC on Solana)
              </label>
              <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                background: "rgba(10, 15, 40, 0.6)", border: "1px solid var(--border)",
                borderRadius: "var(--card-radius)", padding: "0.625rem 0.875rem",
              }}>
                <code style={{
                  flex: 1, fontSize: "0.8rem", color: "var(--text)",
                  wordBreak: "break-all", fontFamily: "monospace",
                }}>
                  {depositAddress}
                </code>
                <button
                  onClick={copyAddress}
                  style={{
                    padding: "0.375rem 0.875rem", borderRadius: "var(--card-radius)",
                    border: "1px solid var(--border)",
                    background: copied ? "var(--green)" : "transparent",
                    color: copied ? "white" : "var(--text-muted)",
                    fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Minimum deposit notice */}
              <div style={{
                marginTop: "1rem", padding: "0.75rem 0.875rem", borderRadius: "var(--card-radius)",
                background: "rgba(10, 15, 40, 0.6)", border: "1px solid var(--border)",
                fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6,
              }}>
                <div style={{ marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--yellow)", fontWeight: 600 }}>Minimum deposit:</span>{" "}
                  $5.00 (500 MP). Deposits below this amount will not be credited.
                </div>
                <div>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>Supported currencies:</span>{" "}
                  USDC on Solana (primary). BTC, ETH, and SOL deposits are auto-converted to USDC.
                </div>
              </div>

              {/* Buy crypto with card */}
              <div style={{ marginTop: "0.75rem" }}>
                <a
                  href="https://changelly.com/buy/usdc"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block", textAlign: "center",
                    padding: "0.75rem", borderRadius: "var(--card-radius)",
                    background: "rgba(10, 15, 40, 0.6)", border: "1px solid var(--border)",
                    color: "var(--green)", fontSize: "0.8rem", fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Don't have crypto? Buy USDC with card via Changelly →
                </a>
              </div>

              {/* Recent Deposits */}
              {recentDeposits.length > 0 && (
                <div style={{ marginTop: "1.25rem" }}>
                  <div style={{
                    fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)",
                    marginBottom: "0.5rem", textTransform: "uppercase",
                    letterSpacing: "var(--letter-spacing-wide)",
                  }}>
                    Recent Deposits
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {recentDeposits.map((d) => (
                      <div key={d.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "rgba(10, 15, 40, 0.6)", borderRadius: "var(--card-radius)",
                        padding: "0.5rem 0.75rem", fontSize: "0.75rem",
                      }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <StatusBadge status={d.status} />
                          <span style={{ color: "var(--text-muted)" }}>
                            {d.sourceCurrency?.toUpperCase() || "USDC"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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
            <div style={{ textAlign: "center", padding: "2.5rem 1.25rem", color: "var(--text-muted)" }}>
              {addressLoading ? (
                <p style={{ fontSize: "0.875rem" }}>Loading deposit address...</p>
              ) : (
                <>
                  <p style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    Unable to load deposit address.
                  </p>
                  {addressError && (
                    <p style={{ fontSize: "0.75rem", color: "var(--red)", marginBottom: "0.5rem" }}>
                      {addressError}
                    </p>
                  )}
                  <button
                    onClick={() => { setAddressLoading(false); setAddressError(null); setDepositAddress(null); }}
                    style={{
                      padding: "0.5rem 1.25rem", borderRadius: "var(--card-radius)",
                      border: "none",
                      background: "var(--accent)", color: "white",
                      fontSize: "0.8rem", fontWeight: 600,
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
            <label style={{
              display: "block", color: "var(--text-muted)", fontSize: "0.7rem",
              marginBottom: "0.375rem", textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-wide)", fontWeight: 500,
            }}>
              Amount (MP)
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
                min={1000}
                max={balance - fee}
                required
                style={{
                  flex: 1, padding: "0.75rem 1rem", borderRadius: "var(--card-radius)",
                  border: "1px solid var(--border)", background: "rgba(10, 15, 40, 0.6)",
                  color: "var(--text)", fontSize: "1rem",
                }}
              />
              <button
                type="button"
                onClick={() => setAmount(String(Math.max(0, balance - fee)))}
                style={{
                  padding: "0.625rem 1rem", borderRadius: "var(--card-radius)",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--accent)", fontSize: "0.8rem", fontWeight: 700,
                }}
              >
                Max
              </button>
              <span style={{ color: "var(--text-muted)", fontSize: "0.875rem", minWidth: "5rem" }}>
                ≈ ${(tokenAmount / 100).toFixed(2)}
              </span>
            </div>

            <label style={{
              display: "block", color: "var(--text-muted)", fontSize: "0.7rem",
              marginBottom: "0.375rem", textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-wide)", fontWeight: 500,
            }}>
              Solana Wallet Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your Solana wallet address"
              required
              style={{
                width: "100%", padding: "0.75rem 1rem", borderRadius: "var(--card-radius)",
                border: "1px solid var(--border)", background: "rgba(10, 15, 40, 0.6)",
                color: "var(--text)", fontSize: "0.875rem", fontFamily: "monospace",
                marginBottom: "1rem",
              }}
            />

            {/* Fee & limit info */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1rem",
            }}>
              <InfoCard label="Withdrawal Fee" value="50 MP ($0.50)" />
              <InfoCard label="Daily Limit" value={`${remainingWithdrawals}/3 remaining`} color={remainingWithdrawals === 0 ? "var(--red)" : undefined} />
              <InfoCard label="Min Withdrawal" value="1,000 MP ($10.00)" />
              <InfoCard label="Net USDC You Receive" value={tokenAmount >= 1050 ? `${netUsdc} USDC` : "—"} color={tokenAmount >= 1050 ? "var(--green)" : undefined} />
            </div>

            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
              Available: {balance} MP (${(balance / 100).toFixed(2)})
              {tokenAmount > 0 && ` · Total deducted: ${tokenAmount + fee} MP`}
            </div>

            <button
              type="submit"
              disabled={loading || tokenAmount < 1000 || !address || maintenanceMode || remainingWithdrawals === 0}
              style={{
                width: "100%", padding: "0.75rem", borderRadius: "var(--card-radius)",
                border: "none",
                background: "var(--accent)", color: "white",
                fontSize: "0.875rem", fontWeight: 600,
                letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
                cursor: loading ? "wait" : "pointer",
                opacity: (loading || maintenanceMode || remainingWithdrawals === 0) ? 0.5 : 1,
              }}
            >
              {loading ? "Processing..." : `Withdraw ${tokenAmount > 0 ? tokenAmount : ""} MP`}
            </button>
          </form>

          {message && (
            <div style={{
              marginTop: "0.75rem", padding: "0.625rem 0.875rem", borderRadius: "var(--card-radius)",
              background: "rgba(10, 15, 40, 0.6)", fontSize: "0.8rem",
              color: message.ok ? "var(--green)" : "var(--red)",
            }}>
              {message.text}
            </div>
          )}

          {/* Recent Withdrawals */}
          {recentWithdrawals.length > 0 && (
            <div style={{ marginTop: "1.25rem" }}>
              <div style={{
                fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)",
                marginBottom: "0.5rem", textTransform: "uppercase",
                letterSpacing: "var(--letter-spacing-wide)",
              }}>
                Recent Withdrawals
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {recentWithdrawals.map((w) => (
                  <div key={w.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "rgba(10, 15, 40, 0.6)", borderRadius: "var(--card-radius)",
                    padding: "0.5rem 0.75rem", fontSize: "0.75rem",
                  }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <StatusBadge status={w.status} />
                      <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {w.destinationAddress.slice(0, 6)}...{w.destinationAddress.slice(-4)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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

      {/* Promo Code */}
      {!bonusClaimed && (
        <div style={{
          marginTop: "1.25rem", paddingTop: "1rem",
          borderTop: "1px solid var(--border)",
        }}>
          <div style={{
            fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)",
            marginBottom: "0.5rem", textTransform: "uppercase",
            letterSpacing: "var(--letter-spacing-wide)",
          }}>
            Promo Code
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              style={{
                flex: 1, padding: "0.625rem 0.875rem", borderRadius: "var(--card-radius)",
                border: "1px solid var(--border)", background: "rgba(10, 15, 40, 0.6)",
                color: "var(--text)", fontSize: "0.875rem", fontFamily: "monospace",
                letterSpacing: "1px",
              }}
            />
            <button
              onClick={async () => {
                if (!promoCode.trim()) return;
                setPromoLoading(true);
                setPromoMessage(null);
                try {
                  const res = await fetch("/api/promo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: promoCode.trim() }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setPromoMessage({ text: data.message, ok: true });
                    setTimeout(() => window.location.reload(), 1500);
                  } else {
                    setPromoMessage({ text: data.error, ok: false });
                  }
                } catch {
                  setPromoMessage({ text: "Network error", ok: false });
                } finally {
                  setPromoLoading(false);
                }
              }}
              disabled={promoLoading || !promoCode.trim()}
              style={{
                padding: "0.625rem 1.25rem", borderRadius: "var(--card-radius)",
                border: "none",
                background: "var(--green)", color: "white",
                fontSize: "0.8rem", fontWeight: 600,
                opacity: promoLoading ? 0.5 : 1,
              }}
            >
              {promoLoading ? "..." : "Redeem"}
            </button>
          </div>
          {promoMessage && (
            <div style={{
              marginTop: "0.5rem", fontSize: "0.75rem",
              color: promoMessage.ok ? "var(--green)" : "var(--red)",
            }}>
              {promoMessage.text}
            </div>
          )}
        </div>
      )}

      {/* Powered by NOWPayments */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "0.375rem", marginTop: "1.25rem", paddingTop: "1rem",
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
            fontSize: "0.65rem", color: "var(--text-muted)", textDecoration: "none",
            letterSpacing: "var(--letter-spacing-wide)", textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Powered by <span style={{ fontWeight: 700 }}>NOWPayments</span>
        </a>
      </div>
    </div>
  );
}

function InfoCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "rgba(10, 15, 40, 0.6)", borderRadius: "var(--card-radius)",
      padding: "0.625rem 0.75rem", border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "0.125rem",
        textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        {label}
      </div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: color ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(251, 191, 36, 0.12)", text: "var(--yellow)" },
    confirming: { bg: "rgba(251, 191, 36, 0.12)", text: "var(--yellow)" },
    confirmed: { bg: "rgba(52, 211, 153, 0.12)", text: "var(--green)" },
    processing: { bg: "rgba(251, 191, 36, 0.12)", text: "var(--yellow)" },
    completed: { bg: "rgba(52, 211, 153, 0.12)", text: "var(--green)" },
    failed: { bg: "rgba(248, 113, 113, 0.12)", text: "var(--red)" },
  };
  const c = colors[status] || colors.pending;

  return (
    <span style={{
      padding: "0.125rem 0.5rem", borderRadius: "6px", fontSize: "0.65rem",
      fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
      background: c.bg, color: c.text,
    }}>
      {status}
    </span>
  );
}
