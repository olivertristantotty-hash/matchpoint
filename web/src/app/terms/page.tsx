export default function TermsOfService() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "60px 20px 80px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", color: "var(--text)" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, marginBottom: "8px" }}>Terms of Service</h1>
        <p style={{ color: "var(--text-muted-dark)", fontSize: "14px", marginBottom: "48px" }}>
          Last updated: April 14, 2026
        </p>

        {/* 1. Acceptance of Terms */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            1. Acceptance of Terms
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            By accessing or using the MATCHPOINT platform, including our website, Discord bot, and any related services,
            you agree to be bound by these Terms of Service. If you do not agree to all of these terms, you must not use
            the platform. Your continued use of MATCHPOINT after any modifications to these terms constitutes your
            acceptance of the updated terms.
          </p>
        </section>

        {/* 2. Eligibility */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            2. Eligibility
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            You must be at least 18 years of age to create an account and participate in any real-money competitions on
            MATCHPOINT. By registering, you confirm that you meet this age requirement and that skill-based gaming
            competitions are permitted in your jurisdiction.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Real-money competitions are not available to residents of the following U.S. states where skill-based
            competitions for prizes may be restricted by law:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px", marginBottom: "16px" }}>
            <li>Arizona</li>
            <li>Arkansas</li>
            <li>Connecticut</li>
            <li>Delaware</li>
            <li>Louisiana</li>
            <li>Montana</li>
            <li>South Carolina</li>
            <li>South Dakota</li>
            <li>Tennessee</li>
          </ul>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            Residents of restricted states may still participate in Free Play (FP) competitions at no cost.
            It is your responsibility to determine whether participation is lawful in your jurisdiction.
          </p>
        </section>

        {/* 3. Platform Description */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            3. Platform Description
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT is a skill-based competitive gaming platform. All competitions on MATCHPOINT are contests of
            skill where the outcome is determined entirely by the participants&apos; ability in the chosen video game.
            MATCHPOINT does not offer, facilitate, or promote games of chance, lotteries, or casino-style gambling.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Players challenge each other to head-to-head matches in supported video game titles. Each player stakes an
            equal entry amount, and the winner of the match receives the prize pool minus the platform fee. This
            skill-based competition model is the same framework used by established platforms across the competitive
            gaming industry.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            MATCHPOINT also offers a Free Play mode using FP (Free Points), which allows players to compete without
            any financial risk.
          </p>
        </section>

        {/* 4. Account Rules */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            4. Account Rules
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            By creating an account on MATCHPOINT, you agree to the following:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>You may only maintain one account. Creating multiple accounts (alt accounts) is strictly prohibited and will result in a permanent ban of all associated accounts.</li>
            <li>You must provide accurate information when linking your game accounts. Misrepresenting your identity or skill level is a violation of these terms.</li>
            <li>Account sharing is prohibited. Your MATCHPOINT account is personal to you and may not be used by or transferred to any other person.</li>
            <li>A Discord account is required to use MATCHPOINT. Authentication is handled through Discord OAuth, and your Discord identity is tied to your MATCHPOINT profile.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
          </ul>
        </section>

        {/* 5. Competitions & Match Rules */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            5. Competitions &amp; Match Rules
          </h2>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            5.1 How Competitions Work
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Players challenge each other to skill-based matches in supported video game titles. Each player stakes an
            equal entry amount in MP (Matchpoints) or FP (Free Points). The combined stakes form the prize pool. The
            winner of the match receives the prize pool minus the applicable platform fee.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            5.2 Escrow System
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            When both players click &quot;Ready&quot; to confirm a match, the staked amounts are placed into escrow.
            Funds remain in escrow until the match result is settled. This protects both players and ensures the winner
            receives their prize.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            5.3 Result Reporting
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            After a match concludes, both players independently report the result (blind reporting). If both players
            report the same outcome, the match is automatically settled and the prize pool is distributed. If the
            reported results conflict, a dispute is opened.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            5.4 Dispute Process
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            When a dispute occurs, both players are required to provide screenshot or video evidence of the match
            result. A MATCHPOINT moderator will review the evidence and make a final determination. The moderator&apos;s
            decision is final and binding. Players who submit fabricated or altered evidence will be permanently banned.
          </p>
        </section>

        {/* 6. Financial Terms */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            6. Financial Terms
          </h2>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.1 Currency
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT uses an internal currency called MP (Matchpoints). The exchange rate is fixed at 100 MP = $1.00 USD.
            Free Play competitions use FP (Free Points), which have no monetary value and cannot be withdrawn.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.2 Deposits
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Deposits are made via cryptocurrency (USDC) through our payment processor, NOWPayments. Deposited funds
            are converted to MP at the fixed exchange rate and credited to your MATCHPOINT wallet. Minimum deposit
            amounts may apply.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.3 Withdrawals
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Withdrawals are processed to your linked Solana wallet address. MP is converted back to USDC at the fixed
            exchange rate. Minimum withdrawal amounts may apply. Withdrawals are subject to result verification and
            fraud checks.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.4 Platform Fee
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT charges a 7% fee on the total prize pool of every settled real-money competition. This fee is
            deducted before the prize is distributed to the winner. Free Play competitions do not incur any fees.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.5 No Refunds
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Once both players click &quot;Ready&quot; and funds are placed into escrow, the entry stake is
            non-refundable. Refunds are only issued in cases where a moderator determines that foul play (such as
            cheating or exploits) affected the outcome of the match.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            6.6 Escrow Protection
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            All staked funds are held in escrow during the match and are only released upon settlement. This ensures
            that the winner always receives their prize and that funds cannot be withdrawn mid-match.
          </p>
        </section>

        {/* 7. Prohibited Conduct */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            7. Prohibited Conduct
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            The following actions are strictly prohibited on MATCHPOINT. Violations will result in penalties up to and
            including permanent account termination:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Cheating — using hacks, aimbots, exploits, macros, or any unauthorized software to gain an unfair advantage in a competition.</li>
            <li>Collusion — coordinating with another player to manipulate match outcomes, including intentional losing or win-trading.</li>
            <li>Fake Results — submitting false, fabricated, or altered match results or evidence. This is a zero-tolerance offense resulting in an instant permanent ban.</li>
            <li>Alt Accounts — creating or using multiple MATCHPOINT accounts. All linked accounts will be permanently banned.</li>
            <li>Harassment — threatening, abusing, or harassing other players, moderators, or staff through any platform channel.</li>
            <li>Underage Use — using the platform if you are under 18 years of age. Accounts found to belong to minors will be locked immediately.</li>
            <li>Exploiting Bugs — intentionally exploiting platform bugs or vulnerabilities for personal gain instead of reporting them.</li>
            <li>Money Laundering — using the platform to launder money or engage in any form of financial fraud.</li>
          </ul>
        </section>

        {/* 8. Dispute Resolution */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            8. Dispute Resolution
          </h2>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            8.1 Match Disputes
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            When both players report conflicting results, a dispute is automatically opened. Both players must provide
            screenshot or video evidence (such as a Medal.tv clip or a screenshot of the final score screen) within the
            designated timeframe. A MATCHPOINT moderator will review all submitted evidence and render a final decision.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            8.2 Evidence Standards
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Players are strongly encouraged to screenshot or record every match. The player who fails to provide
            evidence in a dispute will lose the dispute. MATCHPOINT has zero tolerance for fabricated or altered
            evidence — submitting fake evidence results in an instant permanent ban.
          </p>

          <h3 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", marginTop: "20px", color: "var(--text)" }}>
            8.3 Arbitration
          </h3>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            Any disputes arising from or relating to these Terms of Service or your use of MATCHPOINT that cannot be
            resolved through the platform&apos;s internal dispute process shall be resolved through binding arbitration
            in accordance with applicable rules. You agree to waive any right to a jury trial or to participate in a
            class action lawsuit against MATCHPOINT.
          </p>
        </section>

        {/* 9. Intellectual Property */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            9. Intellectual Property
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT is not endorsed by, directly affiliated with, maintained, or sponsored by Electronic Arts,
            Activision Blizzard, Riot Games, Epic Games, Psyonix, Valve, Microsoft, Xbox, Sony, PlayStation, Nintendo,
            Discord, or Medal.tv.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            All game titles, trade names, trademarks, logos, and associated imagery referenced on the platform are the
            property of their respective owners. MATCHPOINT uses these references solely for the purpose of identifying
            the games available for competition on the platform.
          </p>
        </section>

        {/* 10. Limitation of Liability */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            10. Limitation of Liability
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT provides a platform for skill-based competition between players. The platform is not responsible
            for any losses incurred as a result of participating in competitions. There is always a risk of loss when
            competing for real-money stakes, and no guarantee of winnings is made or implied.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            You participate in all competitions at your own risk. Never stake more than you can afford to lose. Past
            performance does not guarantee future results.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            To the maximum extent permitted by law, MATCHPOINT and its operators, employees, and affiliates shall not
            be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use
            of the platform, including but not limited to loss of funds, data, or profits.
          </p>
        </section>

        {/* 11. Termination */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            11. Termination
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT reserves the right to suspend or permanently terminate any account at its sole discretion,
            with or without notice, for any violation of these Terms of Service.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT operates a 3-strike system for certain offenses (such as no-shows). After three strikes, your
            account will be automatically and permanently banned. Certain offenses — including fraud, fake evidence,
            collusion, and alt accounts — result in an instant permanent ban without prior warning.
          </p>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            Upon termination, any pending competitions will be resolved according to the platform&apos;s standard
            dispute process. Remaining balances may be forfeited in cases of fraud or Terms of Service violations.
          </p>
        </section>

        {/* 12. Modifications */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            12. Modifications
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            MATCHPOINT reserves the right to modify these Terms of Service at any time. Material changes will be
            communicated through the platform (via Discord announcement or website notice). Your continued use of
            MATCHPOINT after any modifications constitutes your acceptance of the updated terms. It is your
            responsibility to review these terms periodically.
          </p>
        </section>

        {/* 13. Contact */}
        <section style={{ marginBottom: "0" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            13. Contact
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            For legal inquiries regarding these Terms of Service, please contact us at{" "}
            <a href="mailto:legal@matchpoint.gg" style={{ color: "var(--accent)" }}>legal@matchpoint.gg</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
