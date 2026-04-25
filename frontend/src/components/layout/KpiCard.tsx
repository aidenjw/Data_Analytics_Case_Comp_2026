export function KpiCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}
