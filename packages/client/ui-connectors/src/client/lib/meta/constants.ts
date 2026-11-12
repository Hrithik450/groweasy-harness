/**
 * Official Meta Campaign Objectives (ODAX + Legacy)
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#fields
 */
export enum MetaCampaignObjective {
  OUTCOME_AWARENESS = "OUTCOME_AWARENESS",
  OUTCOME_TRAFFIC = "OUTCOME_TRAFFIC",
  OUTCOME_ENGAGEMENT = "OUTCOME_ENGAGEMENT",
  OUTCOME_LEADS = "OUTCOME_LEADS",
  OUTCOME_APP_PROMOTION = "OUTCOME_APP_PROMOTION",
  OUTCOME_SALES = "OUTCOME_SALES",

  APP_INSTALLS = "APP_INSTALLS",
  BRAND_AWARENESS = "BRAND_AWARENESS",
  CONVERSIONS = "CONVERSIONS",
  EVENT_RESPONSES = "EVENT_RESPONSES",
  LEAD_GENERATION = "LEAD_GENERATION",
  LINK_CLICKS = "LINK_CLICKS",
  LOCAL_AWARENESS = "LOCAL_AWARENESS",
  MESSAGES = "MESSAGES",
  OFFER_CLAIMS = "OFFER_CLAIMS",
  PAGE_LIKES = "PAGE_LIKES",
  POST_ENGAGEMENT = "POST_ENGAGEMENT",
  PRODUCT_CATALOG_SALES = "PRODUCT_CATALOG_SALES",
  REACH = "REACH",
  STORE_VISITS = "STORE_VISITS",
  VIDEO_VIEWS = "VIDEO_VIEWS",
}

/**
 * Official Meta Campaign Statuses (configured_status)
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#fields
 */
export enum MetaCampaignStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  DELETED = "DELETED",
  ARCHIVED = "ARCHIVED",
}

/**
 * Official Meta Special Ad Categories
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#fields
 */
export enum MetaSpecialAdCategory {
  NONE = "NONE",
  EMPLOYMENT = "EMPLOYMENT",
  HOUSING = "HOUSING",
  CREDIT = "CREDIT",
  ISSUES_ELECTIONS_POLITICS = "ISSUES_ELECTIONS_POLITICS",
}

/**
 * Official Meta Buying Types
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#fields
 */
export enum MetaBuyingType {
  AUCTION = "AUCTION",
  RESERVED = "RESERVED",
}

/**
 * Official Meta (Facebook) Graph API Ad Account Statuses
 * https://developers.facebook.com/docs/marketing-api/reference/ad-account/
 */
export enum MetaAdAccountStatus {
  ACTIVE = 1,
  DISABLED = 2,
  UNSETTLED = 3,
  PENDING_RISK_REVIEW = 7,
  PENDING_SETTLEMENT = 8,
  IN_GRACE_PERIOD = 9,
  PENDING_CLOSURE = 100,
  CLOSED = 101,
  ANY_ACTIVE = 201,
  ANY_CLOSED = 202,
}

/**
 * Official Meta Ad Set Billing Events
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign#fields
 */
export enum MetaBillingEvent {
  APP_INSTALLS = "APP_INSTALLS",
  CLICKS = "CLICKS",
  IMPRESSIONS = "IMPRESSIONS",
  LINK_CLICKS = "LINK_CLICKS",
  OFFER_CLAIMS = "OFFER_CLAIMS",
  PAGE_LIKES = "PAGE_LIKES",
  POST_ENGAGEMENT = "POST_ENGAGEMENT",
  THRUPLAY = "THRUPLAY",
  PURCHASE = "PURCHASE",
  LISTING_INTERACTION = "LISTING_INTERACTION",
}

/**
 * Official Meta Ad Set Optimization Goals
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign#fields
 */
export enum MetaOptimizationGoal {
  NONE = "NONE",
  AD_RECALL_LIFT = "AD_RECALL_LIFT",
  APP_INSTALLS = "APP_INSTALLS",
  APP_INSTALLS_AND_OFFSITE_CONVERSIONS = "APP_INSTALLS_AND_OFFSITE_CONVERSIONS",
  CONVERSATIONS = "CONVERSATIONS",
  DERIVED_EVENTS = "DERIVED_EVENTS",
  ENGAGED_PAGE_VIEWS = "ENGAGED_PAGE_VIEWS",
  ENGAGED_USERS = "ENGAGED_USERS",
  EVENT_RESPONSES = "EVENT_RESPONSES",
  IMPRESSIONS = "IMPRESSIONS",
  IN_APP_VALUE = "IN_APP_VALUE",
  LANDING_PAGE_VIEWS = "LANDING_PAGE_VIEWS",
  LEAD_GENERATION = "LEAD_GENERATION",
  LINK_CLICKS = "LINK_CLICKS",
  MESSAGING_DEEP_CONVERSATION_AND_FOLLOW = "MESSAGING_DEEP_CONVERSATION_AND_FOLLOW",
  MESSAGING_PURCHASE_CONVERSION = "MESSAGING_PURCHASE_CONVERSION",
  OFFSITE_CONVERSIONS = "OFFSITE_CONVERSIONS",
  PAGE_LIKES = "PAGE_LIKES",
  POST_ENGAGEMENT = "POST_ENGAGEMENT",
  QUALITY_CALL = "QUALITY_CALL",
  QUALITY_LEAD = "QUALITY_LEAD",
  REACH = "REACH",
  SUBSCRIBERS = "SUBSCRIBERS",
  THRUPLAY = "THRUPLAY",
  VALUE = "VALUE",
  VISIT_INSTAGRAM_PROFILE = "VISIT_INSTAGRAM_PROFILE",
}

/**
 * Official Meta Ad Creative Call To Action Types
 * https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action/
 */
export enum MetaCallToActionType {
  APPLY_NOW = "APPLY_NOW",
  BOOK_TRAVEL = "BOOK_TRAVEL",
  BUY_TICKETS = "BUY_TICKETS",
  CALL = "CALL",
  CALL_ME = "CALL_ME",
  CONTACT_US = "CONTACT_US",
  DONATE = "DONATE",
  DOWNLOAD = "DOWNLOAD",
  GET_DIRECTIONS = "GET_DIRECTIONS",
  GET_OFFER = "GET_OFFER",
  GET_OFFER_VIEW = "GET_OFFER_VIEW",
  GET_QUOTE = "GET_QUOTE",
  GET_SHOWTIMES = "GET_SHOWTIMES",
  INSTALL_APP = "INSTALL_APP",
  INTERESTED = "INTERESTED",
  LEARN_MORE = "LEARN_MORE",
  LIKE_PAGE = "LIKE_PAGE",
  LISTEN_MUSIC = "LISTEN_MUSIC",
  LISTEN_NOW = "LISTEN_NOW",
  MESSAGE_PAGE = "MESSAGE_PAGE",
  NO_BUTTON = "NO_BUTTON",
  OPEN_LINK = "OPEN_LINK",
  ORDER_NOW = "ORDER_NOW",
  PLAY_GAME = "PLAY_GAME",
  RECORD_NOW = "RECORD_NOW",
  SEE_MORE = "SEE_MORE",
  SELL_NOW = "SELL_NOW",
  SEND_UPDATES = "SEND_UPDATES",
  SEND_WHATSAPP_MESSAGE = "SEND_WHATSAPP_MESSAGE",
  SHARE = "SHARE",
  SHOP_NOW = "SHOP_NOW",
  SIGN_UP = "SIGN_UP",
  SUBSCRIBE = "SUBSCRIBE",
  USE_APP = "USE_APP",
  VIEW_INSTAGRAM_PROFILE = "VIEW_INSTAGRAM_PROFILE",
  VOTE_NOW = "VOTE_NOW",
  WATCH_MORE = "WATCH_MORE",
  WHATSAPP_MESSAGE = "WHATSAPP_MESSAGE",
}

/**
 * Official Meta Targeting Distance Units
 * https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search/
 */
export enum MetaDistanceUnit {
  KILOMETER = "kilometer",
  MILE = "mile",
}

/**
 * Official Meta Targeting Gender Codes
 * https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting/
 */
export enum MetaGender {
  MALE = 1,
  FEMALE = 2,
}
