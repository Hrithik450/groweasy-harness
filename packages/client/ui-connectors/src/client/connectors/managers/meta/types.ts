import { Connector } from "../../../lib/registry";
import {
  MetaAdAccount,
  MetaCampaign,
  MetaAdSet,
  MetaAd,
} from "../../../lib/meta";

export type { MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd };
export type MetaConnectedAdAccount = MetaAdAccount;

export type MetaTabId = "adAccounts" | "settings";

export type MetaAdAccountSubTabId = "campaigns" | "adsets" | "ads";

export interface MetaSubTabItem {
  id: MetaAdAccountSubTabId;
  label: string;
  badge?: number | string;
}

export interface CampaignFormData {
  name: string;
  objective: string;
  dailyBudget: string;
  status?: string;
}

export interface AdSetFormData {
  name: string;
  campaignId: string;
  dailyBudget?: string;
  status?: string;
  optimizationGoal?: string;
  billingEvent?: string;
  bidAmount?: string;
}

export interface MetaUserInfo {
  userName: string;
  userId: string;
  businessName?: string;
  businessId?: string;
}

export interface MetaAccountState {
  selectedAccountId: string;
  accounts: MetaAdAccount[];
}

export interface MetaManageModalProps {
  connector: Connector;
  onClose: () => void;
  onUpdate?: (updates: Partial<Connector>) => void;
  onRefresh?: () => Promise<void> | void;
}
