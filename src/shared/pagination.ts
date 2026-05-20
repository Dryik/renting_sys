export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PageRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export type PageResult<TRecord, TSummary = undefined> = {
  rows: TRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary?: TSummary;
};

export type PageRange = {
  from: number;
  to: number;
};

export function getPageRange(result: Pick<PageResult<unknown>, "page" | "pageSize" | "total">): PageRange {
  if (result.total <= 0) {
    return { from: 0, to: 0 };
  }

  const from = (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return { from, to };
}
