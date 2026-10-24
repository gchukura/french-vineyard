export type Fact = { label: string; value: string };

export function FactStrip({ facts }: { facts: [Fact, Fact, Fact, Fact] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-accent/50 md:grid-cols-4">
      {facts.map((fact, i) => (
        <div
          key={fact.label}
          className={`px-4 py-5 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""} border-accent/50`}
        >
          <dt className="text-xs font-semibold tracking-widest text-muted uppercase">
            {fact.label}
          </dt>
          <dd className="mt-1 font-heading text-xl font-semibold tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
