"use client";

import type { CategoryDTO } from "@/lib/client";
import { formatCurrency } from "@/lib/money";
import { Money } from "./ui";

const FALLBACK_COLORS = ["#829877", "#9fafa1", "#c69c80", "#8daab1", "#bf919e", "#a59aba", "#c3b270"];

function colorFor(category: CategoryDTO, index: number) {
  return category.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function share(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function percentLabel(part: number, total: number) {
  const pct = share(part, total);
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/** Categories that actually have spending, biggest first. */
function spendingCategories(categories: CategoryDTO[]) {
  return categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
}

export function SpendingCharts({
  categories,
  currency,
}: {
  categories: CategoryDTO[];
  currency: string;
}) {
  const slices = spendingCategories(categories);

  if (slices.length === 0) {
    return (
      <p className="mb-4 rounded-xl border border-dashed border-paper-line bg-paper-base/40 px-4 py-2.5 text-sm text-ink-muted">
        Record spending in Step 2 to see where your money goes.
      </p>
    );
  }

  return (
    <div className="mb-4 grid gap-4 border-b border-paper-line pb-4 sm:grid-cols-2">
      <div>
        <h3 className="label mb-2">Spending mix</h3>
        <CategoryPieChart categories={slices} currency={currency} />
      </div>
      <div>
        <h3 className="label mb-2">Top 5 by spend</h3>
        <TopSpentChart categories={slices} currency={currency} />
      </div>
    </div>
  );
}

function CategoryPieChart({
  categories,
  currency,
}: {
  categories: CategoryDTO[];
  currency: string;
}) {
  const total = categories.reduce((sum, c) => sum + c.spent, 0);

  const OUTER = 82;
  const INNER = 50;
  const CENTER = 90;

  let startAngle = -Math.PI / 2;
  const arcs = categories.map((category, index) => {
    const sweep = (category.spent / total) * Math.PI * 2;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;

    const outerStart = point(CENTER, OUTER, startAngle);
    const outerEnd = point(CENTER, OUTER, endAngle);
    const innerEnd = point(CENTER, INNER, endAngle);
    const innerStart = point(CENTER, INNER, startAngle);

    const d =
      `M ${outerStart.x} ${outerStart.y} ` +
      `A ${OUTER} ${OUTER} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} ` +
      `L ${innerEnd.x} ${innerEnd.y} ` +
      `A ${INNER} ${INNER} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;

    const arc = { category, d, color: colorFor(category, index) };
    startAngle = endAngle;
    return arc;
  });

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 180 180"
        role="img"
        aria-label={`Spending by category, ${formatCurrency(total, currency)} total`}
        className="h-28 w-28 shrink-0"
      >
        {categories.length === 1 ? (
          <>
            <circle cx={CENTER} cy={CENTER} r={OUTER} fill={colorFor(categories[0], 0)}>
              <title>
                {categories[0].name}: {formatCurrency(categories[0].spent, currency)} (100%)
              </title>
            </circle>
            <circle cx={CENTER} cy={CENTER} r={INNER} fill="#fffcf5" />
          </>
        ) : (
          arcs.map(({ category, d, color }) => (
            <path key={category.id} d={d} fill={color} stroke="#fffcf5" strokeWidth="1.5">
              <title>
                {category.name}: {formatCurrency(category.spent, currency)} (
                {percentLabel(category.spent, total)})
              </title>
            </path>
          ))
        )}
        <text
          x={CENTER}
          y={CENTER + 5}
          textAnchor="middle"
          className="fill-slate-400"
          fontSize="15"
        >
          {formatCurrency(total, currency)}
        </text>
      </svg>

      <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] leading-4">
        {categories.map((category, index) => (
          <li
            key={category.id}
            className="flex items-center justify-between gap-1"
            title={`${category.name}: ${formatCurrency(category.spent, currency)} (${percentLabel(category.spent, total)})`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(category, index) }}
              />
              <span className="truncate text-ink-soft">{category.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">
              {percentLabel(category.spent, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopSpentChart({
  categories,
  currency,
}: {
  categories: CategoryDTO[];
  currency: string;
}) {
  const total = categories.reduce((sum, c) => sum + c.spent, 0);
  const top = categories.slice(0, 5);
  const highest = top[0]?.spent ?? 0;

  return (
    <ol className="flex flex-col gap-1.5">
      {top.map((category, index) => {
        const color = colorFor(category, index);
        return (
          <li key={category.id}>
            <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="w-3 shrink-0 tabular-nums text-ink-muted">{index + 1}</span>
                <span className="truncate font-medium text-ink-soft">{category.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">
                <Money amount={category.spent} currency={currency} />{" "}
                <span className="text-ink-muted">{percentLabel(category.spent, total)}</span>
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-inset">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${highest > 0 ? (category.spent / highest) * 100 : 0}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </li>
        );
      })}
      {categories.length > top.length && (
        <li className="text-[11px] leading-4 text-ink-muted">
          +{categories.length - top.length} more with spending
        </li>
      )}
    </ol>
  );
}

function point(center: number, radius: number, angle: number) {
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}
