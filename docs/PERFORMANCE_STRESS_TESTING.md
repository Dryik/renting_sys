# Performance Stress Testing

Use this benchmark after changing report, accounting, search, or database code.
It creates a temporary SQLite database with a large local-shop workload, runs the
known hot paths, and reports p50/min/max timings.

Run the default benchmark:

```powershell
npm run perf:stress
```

Run it as a gate that fails when a budget is exceeded:

```powershell
npm run perf:stress -- --strict
```

The script runs through Electron, not plain Node, because `better-sqlite3` is
rebuilt for Electron in this project. Running it with `node` can fail with a
native module ABI mismatch.

## Default Dataset

The default synthetic dataset is intentionally larger than a normal small-shop
install:

- 1,000 vehicles
- 5,000 customers
- 80,000 rentals
- 160,000 payments
- 40,000 expenses
- 20,000 cash movements
- 20,000 accounting adjustments

The temporary database is removed after the run unless `--keep` or `--db` is
used.

## Benchmarked Paths

The benchmark covers these performance-sensitive workflows:

- Startup rental list load
- Rental form customer and vehicle option load
- Daily closing summary
- Outstanding balances page and Accounting preview
- Deposits page, chunked held-deposits preview, and exact held-deposits total
- Accounting transactions page and source-filtered broad transaction search
- Global search for customer-name and plate-style queries
- Vehicle utilization report

Each row prints `OK` or `WARN`, p50/min/max timings, and the result size. The
default budgets are set for this repository's current optimized baseline on a
local Windows development machine.

## Useful Options

Keep the generated temporary database for inspection:

```powershell
npm run perf:stress -- --keep
```

Write or reuse a specific database path:

```powershell
npm run perf:stress -- --db C:\Temp\rental-stress.db
npm run perf:stress -- --db C:\Temp\rental-stress.db --reuse
```

Scale the default dataset:

```powershell
npm run perf:stress -- --scale 2
```

Use a smaller smoke-test dataset:

```powershell
npm run perf:stress -- --vehicles 100 --customers 200 --rentals 1000 --payments 2000 --expenses 500 --cashMovements 300 --adjustments 300 --iterations 3
```

## When To Run

Run `npm run perf:stress -- --strict` before merging changes that touch:

- `electron/db/*.service.ts`
- report screens
- accounting screens
- global search
- search/list pagination
- SQLite indexes or schema definitions

If a budget fails, compare the changed query to the existing service pattern:
page at the database layer, avoid loading full tables for previews, and keep
exports on explicit full-read paths.
