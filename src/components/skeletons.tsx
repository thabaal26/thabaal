import { Card, Skeleton } from "./ui";

/** Loading placeholders shaped like the real pages, so nothing jumps when the data arrives. */

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

function HeaderSkeleton({ chips = 0, actions = 1 }: { chips?: number; actions?: number }) {
  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="hidden h-4 w-80 max-w-full sm:block" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 sm:h-10" />
          ))}
        </div>
      </div>
      {chips > 0 && (
        <div className="mt-4 flex gap-1.5 overflow-hidden">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-11 w-20 shrink-0 rounded-full sm:h-8" />
          ))}
        </div>
      )}
    </div>
  );
}

function RowsSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          {avatar && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function OverviewSkeleton() {
  return (
    <Loading>
      <div className="mb-5 flex justify-between gap-5 sm:mb-6">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-72" />
        </div>
        <Skeleton className="hidden h-36 w-[22rem] rounded-card lg:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-card sm:h-48" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 xl:grid-cols-12">
        <Card className="h-80 xl:col-span-8" />
        <Card className="h-80 xl:col-span-4" />
      </div>
    </Loading>
  );
}

export function ListPageSkeleton({ chips = 0, actions = 1, search = false }: { chips?: number; actions?: number; search?: boolean }) {
  return (
    <Loading>
      <HeaderSkeleton chips={chips} actions={actions} />
      <Card>
        {search && (
          <div className="grid gap-2 border-b border-line p-3 sm:flex">
            <Skeleton className="h-11 flex-1 sm:h-10" />
            <Skeleton className="h-11 sm:h-10 sm:w-52" />
          </div>
        )}
        <RowsSkeleton />
      </Card>
    </Loading>
  );
}

export function OrdersSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton chips={5} actions={2} />
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-3 p-4 sm:p-5">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-24" />
            <Skeleton className="h-11 sm:h-8 sm:w-56" />
          </Card>
        ))}
      </div>
    </Loading>
  );
}
