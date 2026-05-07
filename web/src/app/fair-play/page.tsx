export default function FairPlayPolicy() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "60px 20px 80px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", color: "var(--text)" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, marginBottom: "8px" }}>Fair Play Policy</h1>
        <p style={{ color: "var(--text-muted-dark)", fontSize: "14px", marginBottom: "48px" }}>
          Last updated: April 14, 2026
        </p>

        {/* 1. Our Commitment */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            1. Our Commitment
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            MATCHPOINT is built on the principle that competition should be fair, transparent, and determined entirely
            by skill. Every system on our platform — from result reporting to dispute resolution to reputation scoring —
            is designed to protect honest players and ensure that the best competitor wins. We have zero tolerance for
            cheating, manipulation, or dishonesty of any kind.
          </p>
        </section>

        {/* 2. How Results Work */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            2. How Results Work
          </h2>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Blind Reporting
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            After a match concludes, both players independently report who won. Neither player can see the other&apos;s
            submission until both have reported. This blind reporting system prevents players from being pressured into
            accepting a false result.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Automatic Settlement
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            When both players report the same outcome, the match is automatically settled. The prize pool (minus the
            platform fee) is instantly credited to the winner&apos;s account. No moderator intervention is needed.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Dispute Escalation
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            If the reported results conflict (both players claim they won), the match is automatically escalated to a
            dispute. Both players are notified and asked to provide evidence. A moderator will review the case and make
            a final decision.
          </p>
        </section>

        {/* 3. Evidence & Screenshots */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            3. Evidence &amp; Screenshots
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Evidence is the foundation of fair dispute resolution. We strongly recommend that you capture proof of every
            match result.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            What Counts as Evidence
          </h3>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px", marginBottom: "16px" }}>
            <li>A clear screenshot of the final score screen showing both players&apos; names and the result.</li>
            <li>A video clip (Medal.tv or similar) capturing the end of the match and the final score.</li>
            <li>Game API data (for supported titles where results are automatically verified).</li>
          </ul>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Medal.tv Integration
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            We recommend using Medal.tv to automatically clip your matches. Medal runs in the background and can capture
            the last few minutes of gameplay on demand, giving you reliable evidence without any extra effort.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            No Evidence = You Lose the Dispute
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            If a dispute is opened and you cannot provide evidence of the match result, you will lose the dispute. Always
            screenshot your final score. This is the single most important habit you can build on MATCHPOINT.
          </p>
        </section>

        {/* 4. Dispute Process */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            4. Dispute Process
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Here is exactly what happens when a dispute occurs:
          </p>
          <ol style={{ color: "var(--text-muted-dark)", lineHeight: 2.2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Both players report their result. If the results conflict (both claim victory), a dispute is automatically opened.</li>
            <li>Both players are notified in the match thread and asked to submit evidence (screenshots or video clips).</li>
            <li>A MATCHPOINT moderator reviews all submitted evidence from both sides.</li>
            <li>The moderator makes a final determination based on the evidence. The player with clear, unaltered proof of the result wins the dispute.</li>
            <li>The prize pool is distributed to the rightful winner. The losing party&apos;s reputation score is adjusted accordingly.</li>
            <li>If a player is found to have submitted fake or altered evidence, they are permanently banned immediately.</li>
          </ol>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginTop: "16px" }}>
            Moderator decisions are final. There is no appeal process for match disputes.
          </p>
        </section>

        {/* 5. Prohibited Behavior */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            5. Prohibited Behavior
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            The following actions undermine fair competition and are strictly prohibited:
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Cheating &amp; Exploits
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Using hacks, aimbots, wallhacks, macros, scripts, or any unauthorized third-party software to gain an
            unfair advantage. Intentionally exploiting known game bugs or glitches to influence the outcome of a match.
            Consequence: permanent ban.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Collusion &amp; Win-Trading
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Coordinating with another player to predetermine match outcomes, intentionally losing, or trading wins to
            manipulate reputation or earnings. Our anti-fraud system monitors for alternating-win patterns and other
            indicators of collusion. Consequence: permanent ban of all involved accounts.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Fake Results &amp; Forged Evidence
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Submitting a false match result or providing fabricated, edited, or misleading screenshots or video clips.
            This is the most serious offense on MATCHPOINT. Consequence: instant permanent ban, zero tolerance.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Harassment
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            Threatening, abusing, or harassing other players, moderators, or staff. Trash talk is part of competition,
            but personal attacks, slurs, threats, and targeted harassment are not tolerated. Consequence: warning →
            temporary mute → permanent ban (escalating based on severity).
          </p>
        </section>

        {/* 6. Reputation System */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            6. Reputation System
          </h2>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            How Reputation Works
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Every player on MATCHPOINT has a reputation score that reflects their trustworthiness and history on the
            platform. Your reputation increases when you complete matches honestly and report results accurately. It
            decreases when you no-show, lose disputes, or engage in prohibited behavior.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Reputation Tiers
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Your reputation tier determines the maximum stake you can enter in competitions. New players start at the
            lowest tier and must build their reputation through consistent, fair play before accessing higher-stakes
            matches. This protects the community by ensuring that players with access to large stakes have a proven
            track record.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            Building Your Reputation
          </h3>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Complete matches and report results honestly.</li>
            <li>Provide evidence when disputes arise.</li>
            <li>Use Free Play mode to build rep without financial risk.</li>
            <li>Avoid no-shows — always report your result on time.</li>
            <li>Never submit false results or fake evidence.</li>
          </ul>
        </section>

        {/* 7. Punishment Tiers */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            7. Punishment Tiers
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "20px" }}>
            MATCHPOINT enforces a clear, consistent punishment system. Here is what happens for each type of offense:
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse", fontSize: "14px",
              border: "1px solid var(--border)", borderRadius: "8px",
            }}>
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Offense</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Action</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--text)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>First no-show</td>
                  <td style={{ padding: "12px 16px", color: "var(--yellow)", borderBottom: "1px solid var(--border)" }}>-10 rep + 1 strike</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Failed to report result in time</td>
                </tr>
                <tr style={{ background: "var(--bg-card)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Second no-show</td>
                  <td style={{ padding: "12px 16px", color: "var(--yellow)", borderBottom: "1px solid var(--border)" }}>-10 rep + 1 strike</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Pattern of abandoning matches</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Third no-show</td>
                  <td style={{ padding: "12px 16px", color: "var(--red)", borderBottom: "1px solid var(--border)" }}>Permanent ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>3 strikes = automatic ban</td>
                </tr>
                <tr style={{ background: "var(--bg-card)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Fake result / forged evidence</td>
                  <td style={{ padding: "12px 16px", color: "var(--red)", borderBottom: "1px solid var(--border)" }}>Instant permanent ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Zero tolerance. All linked accounts blacklisted.</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Collusion / win-trading</td>
                  <td style={{ padding: "12px 16px", color: "var(--red)", borderBottom: "1px solid var(--border)" }}>Permanent ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Both accounts permanently banned</td>
                </tr>
                <tr style={{ background: "var(--bg-card)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Alt accounts</td>
                  <td style={{ padding: "12px 16px", color: "var(--red)", borderBottom: "1px solid var(--border)" }}>Permanent ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>All linked accounts permanently banned</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Cheating / exploits</td>
                  <td style={{ padding: "12px 16px", color: "var(--red)", borderBottom: "1px solid var(--border)" }}>Permanent ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)", borderBottom: "1px solid var(--border)" }}>Hacks, aimbots, macros, unauthorized software</td>
                </tr>
                <tr style={{ background: "var(--bg-card)" }}>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)" }}>Harassment</td>
                  <td style={{ padding: "12px 16px", color: "var(--yellow)" }}>Warning → kick → ban</td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted-dark)" }}>Escalating based on severity</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 8. Refund Policy */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            8. Refund Policy
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Once both players click &quot;Ready&quot; and funds are placed into escrow, the entry stake is
            non-refundable. This is a firm policy — by clicking &quot;Ready,&quot; you are committing to the match.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            There is one exception: refunds may be issued if a moderator determines that foul play directly affected
            the outcome of the match. This includes situations where the opponent was found to be cheating (using hacks,
            exploits, or unauthorized software) and the evidence clearly supports this finding.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            Refund requests based on lag, disconnections, or personal circumstances are not eligible. Skill-based
            competition inherently involves risk, and all participants accept this risk when they enter a match.
          </p>
        </section>

        {/* 9. Industry Standard */}
        <section style={{ marginBottom: "0" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            9. Industry Standard
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            The fair play systems and policies described on this page are consistent with the standards used across the
            competitive gaming industry by established skill-based competition platforms. Blind result reporting,
            evidence-based dispute resolution, reputation systems, and tiered punishment structures are proven methods
            for maintaining fair and transparent competition.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            MATCHPOINT is committed to upholding these standards and continuously improving our systems to protect the
            integrity of every competition on the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
