export type DefaultTabKey = "overview";

export interface DefaultSessionTabProps {
  session?: { id: string; title?: string } | null;
  data?: unknown;
}
