export default function Loading() {
  return (
    <div className="sheet" aria-busy="true">
      <aside className="rail">
        <div className="skeleton" style={{ height: 12, width: 90, opacity: 0.2 }} />
        <div className="skeleton" style={{ height: 28, width: "80%", opacity: 0.2 }} />
        <div className="skeleton" style={{ height: 160, opacity: 0.1 }} />
      </aside>
      <main className="main">
        <div className="skeleton" style={{ height: 22, width: 220, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 90, marginBottom: 30 }} />
        <div className="skeleton" style={{ height: 22, width: 160, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </main>
    </div>
  );
}
