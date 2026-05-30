export type ISODate = string;

export type Paginated<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export type ApiError = {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: ISODate;
};
