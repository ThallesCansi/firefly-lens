import katex from "katex";
import "katex/dist/katex.min.css";

export function Equation({
  id,
  title,
  expression,
  variables,
  children,
}: {
  id: string;
  title: string;
  expression: string;
  variables: { symbol: string; meaning: string }[];
  children: React.ReactNode;
}) {
  const html = katex.renderToString(expression, {
    displayMode: true,
    output: "htmlAndMathml",
    throwOnError: true,
    trust: false,
    strict: "error",
  });
  return (
    <section className="equation-card" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{title}</h3>
      <div
        className="equation-scroll"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <dl className="equation-variables">
        {variables.map((v) => (
          <div key={v.symbol}>
            <dt>{v.symbol}</dt>
            <dd>{v.meaning}</dd>
          </div>
        ))}
      </dl>
      <div className="equation-note">{children}</div>
    </section>
  );
}
