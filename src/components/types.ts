/** Types shared by the detail-bar components. */

export interface DetailBarComponentProps {
  session?: { id: string; title?: string } | null;
  data?: unknown;
  onClose?: () => void;
}

export interface AdManagerDetailBarData {
  campaigns?: unknown[];
  alerts?: unknown[];
  suggestions?: unknown[];
}
