export function MethodSection({
  id,
  title,
  status,
  children,
}: {
  id: string;
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="method-section"
      aria-labelledby={`${id}-heading`}
    >
      {status && <p className="method-status">{status}</p>}
      <h2 id={`${id}-heading`}>{title}</h2>
      <div className="method-prose">{children}</div>
    </section>
  );
}
