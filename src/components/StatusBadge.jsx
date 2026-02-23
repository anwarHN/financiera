export default function StatusBadge({ tone = "muted", children }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

