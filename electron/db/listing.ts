import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type PageRequest,
  type PageResult,
} from "../../src/shared/pagination";

export type NormalizedPageRequest = {
  page: number;
  pageSize: number;
  search: string;
  offset: number;
};

export function normalizePageRequest(input?: PageRequest | string | null): NormalizedPageRequest {
  const request =
    typeof input === "string"
      ? { search: input }
      : input && typeof input === "object"
        ? input
        : {};

  const pageSize = clampInteger(request.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const page = clampInteger(request.page, 1, 1, Number.MAX_SAFE_INTEGER);

  return {
    page,
    pageSize,
    search: typeof request.search === "string" ? request.search.trim() : "",
    offset: (page - 1) * pageSize,
  };
}

export function createPageResult<TRecord, TSummary = undefined>(
  rows: TRecord[],
  total: number,
  request: NormalizedPageRequest,
  summary?: TSummary,
): PageResult<TRecord, TSummary> {
  return {
    rows,
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: Math.max(1, Math.ceil(total / request.pageSize)),
    ...(summary === undefined ? {} : { summary }),
  };
}

export function toLikeTerm(search: string): string {
  return `%${search}%`;
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
