export function PlaceholderView({ title, testId }: { title: string; testId: string }) {
  return (
    <div data-testid={testId}>
      <h1 className="tm-display text-3xl">{title}</h1>
      <p className="mt-3 text-sm text-white/45">Coming in a later wave.</p>
    </div>
  );
}
