/**
 * Generic standard response returned by all domain service operations.
 */
export type Response<TData = unknown> = {
  success?: boolean;
  data?: TData;
  error?: string;
};
