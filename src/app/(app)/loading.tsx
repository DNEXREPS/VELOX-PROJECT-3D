export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6" role="status" aria-label="Loading">
      <div className="h-6 w-48 animate-pulse bg-surface-raised" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse bg-surface" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="aspect-[16/10] animate-pulse bg-surface" />)}
      </div>
    </div>
  );
}
