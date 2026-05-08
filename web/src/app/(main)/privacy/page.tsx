export default function PrivacyPolicy() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "60px 20px 80px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", color: "var(--text)" }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, marginBottom: "8px" }}>Privacy Policy</h1>
        <p style={{ color: "var(--text-muted-dark)", fontSize: "14px", marginBottom: "48px" }}>
          Last updated: April 14, 2026
        </p>

        {/* 1. Information We Collect */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            1. Information We Collect
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            When you use MATCHPOINT, we collect the following types of information:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Discord ID and username (provided through Discord OAuth authentication)</li>
            <li>Linked game account identifiers (e.g., Riot ID, EA ID, Steam ID, Epic Games ID)</li>
            <li>Transaction history, including deposits, withdrawals, and competition results</li>
            <li>Cryptocurrency wallet addresses used for deposits and withdrawals</li>
            <li>IP address and general location data</li>
            <li>Competition history, match results, and dispute records</li>
            <li>Reputation score and platform activity data</li>
          </ul>
        </section>

        {/* 2. How We Use Your Information */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            2. How We Use Your Information
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            We use the information we collect for the following purposes:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Account management — creating and maintaining your MATCHPOINT profile, authenticating your identity, and linking your game accounts.</li>
            <li>Match processing — facilitating competitions, processing stakes, settling results, and distributing prizes.</li>
            <li>Fraud prevention — detecting and preventing cheating, collusion, alt accounts, and other prohibited conduct through behavioral analysis and cross-referencing linked accounts.</li>
            <li>Dispute resolution — reviewing evidence, investigating reported issues, and resolving match disputes.</li>
            <li>Platform improvement — analyzing usage patterns to improve features, fix bugs, and enhance the overall user experience.</li>
            <li>Communication — sending important account notifications, policy updates, and platform announcements.</li>
          </ul>
        </section>

        {/* 3. Information Sharing */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            3. Information Sharing
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT does not sell your personal data to third parties. We may share limited information in the
            following circumstances:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Payment processor — we share necessary transaction data with NOWPayments to process cryptocurrency deposits and withdrawals. NOWPayments operates under its own privacy policy.</li>
            <li>Law enforcement — we may disclose information if required by law, subpoena, court order, or other legal process, or if we believe disclosure is necessary to protect the rights, safety, or property of MATCHPOINT or its users.</li>
            <li>Fraud investigations — we may share account data with other skill-based competition platforms to investigate cross-platform fraud or collusion when necessary.</li>
          </ul>
        </section>

        {/* 4. Data Security */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            4. Data Security
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            We take reasonable measures to protect your information from unauthorized access, alteration, disclosure,
            or destruction. These measures include:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Encryption of data in transit using TLS/SSL.</li>
            <li>Secure database storage with access controls and monitoring.</li>
            <li>No plaintext password storage — MATCHPOINT uses Discord OAuth for authentication, so we never handle or store your password directly.</li>
            <li>Regular security reviews and updates to our infrastructure.</li>
          </ul>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginTop: "16px" }}>
            While we strive to protect your data, no method of electronic transmission or storage is 100% secure. We
            cannot guarantee absolute security.
          </p>
        </section>

        {/* 5. Data Retention */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            5. Data Retention
          </h2>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Account data (Discord ID, linked game accounts, reputation) is retained for as long as your account is active.</li>
            <li>Transaction records (deposits, withdrawals, competition results) are retained for a minimum period as required for financial compliance and fraud prevention, even after account deletion.</li>
            <li>Dispute records and evidence are retained for compliance and audit purposes.</li>
            <li>Upon request, we will delete your account data, subject to exceptions for legal obligations, ongoing disputes, or compliance requirements.</li>
          </ul>
        </section>

        {/* 6. Your Rights */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            6. Your Rights
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            Depending on your jurisdiction, you may have the following rights regarding your personal data:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Access — you have the right to request a copy of the personal data we hold about you.</li>
            <li>Correction — you have the right to request correction of inaccurate or incomplete data.</li>
            <li>Deletion — you have the right to request deletion of your personal data, subject to legal retention requirements.</li>
            <li>Data portability — you have the right to request your data in a structured, commonly used, machine-readable format (GDPR compliance).</li>
            <li>Objection — you have the right to object to certain types of data processing.</li>
          </ul>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginTop: "16px" }}>
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:privacy@matchpoint.gg" style={{ color: "var(--accent)" }}>privacy@matchpoint.gg</a>.
            We will respond to your request within 30 days.
          </p>
        </section>

        {/* 7. Cookies & Tracking */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            7. Cookies &amp; Tracking
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginBottom: "16px" }}>
            MATCHPOINT uses cookies strictly for essential platform functionality:
          </p>
          <ul style={{ color: "var(--text-muted-dark)", lineHeight: 2, fontSize: "15px", paddingLeft: "24px" }}>
            <li>Session cookies — used to maintain your authenticated session after signing in with Discord. These are necessary for the platform to function.</li>
            <li>Security cookies — used to prevent cross-site request forgery and other security threats.</li>
          </ul>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px", marginTop: "16px" }}>
            MATCHPOINT does not use third-party advertising trackers, analytics cookies, or any form of cross-site
            tracking. We do not serve ads and do not share browsing data with advertisers.
          </p>
        </section>

        {/* 8. Children's Privacy */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            8. Children&apos;s Privacy
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            MATCHPOINT is not intended for use by anyone under the age of 18. We do not knowingly collect personal
            information from minors. If we become aware that a user is under 18, their account will be immediately
            terminated and all associated data will be deleted. If you believe a minor is using the platform, please
            contact us at{" "}
            <a href="mailto:privacy@matchpoint.gg" style={{ color: "var(--accent)" }}>privacy@matchpoint.gg</a>.
          </p>
        </section>

        {/* 9. Changes to Policy */}
        <section style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            9. Changes to This Policy
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            We may update this Privacy Policy from time to time. Material changes will be communicated through the
            platform (via Discord announcement or website notice). The &quot;Last updated&quot; date at the top of this
            page reflects the most recent revision. Your continued use of MATCHPOINT after changes are posted
            constitutes your acceptance of the updated policy.
          </p>
        </section>

        {/* 10. Contact */}
        <section style={{ marginBottom: "0" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--accent)" }}>
            10. Contact
          </h2>
          <p style={{ color: "var(--text-muted-dark)", lineHeight: 1.8, fontSize: "15px" }}>
            For privacy-related inquiries, data requests, or concerns about how your information is handled, please
            contact us at{" "}
            <a href="mailto:privacy@matchpoint.gg" style={{ color: "var(--accent)" }}>privacy@matchpoint.gg</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
