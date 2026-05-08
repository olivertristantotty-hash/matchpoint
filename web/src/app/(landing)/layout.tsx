import "./landing.css";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
