/**
 * Centralized Meta Graph API Versioning and Endpoint Registry.
 *
 * Provides validated version constants, URL builders, and authoritative endpoint
 * metadata across Thabaal's WhatsApp Cloud API client, manual validation,
 * and embedded signup flows.
 */

export const SUPPORTED_GRAPH_VERSIONS = ["v23.0", "v22.0", "v21.0"] as const;
export type SupportedGraphVersion = (typeof SUPPORTED_GRAPH_VERSIONS)[number];

export const DEFAULT_GRAPH_VERSION: SupportedGraphVersion = "v23.0";

/**
 * Validates and normalizes a Graph API version string.
 * Falls back safely to DEFAULT_GRAPH_VERSION ("v23.0") if invalid or unsupported.
 */
export function normalizeGraphVersion(raw?: string | null): SupportedGraphVersion {
  const trimmed = raw?.trim();
  if (trimmed && (SUPPORTED_GRAPH_VERSIONS as readonly string[]).includes(trimmed)) {
    return trimmed as SupportedGraphVersion;
  }
  const envVersion = process.env.META_GRAPH_VERSION?.trim();
  if (envVersion && (SUPPORTED_GRAPH_VERSIONS as readonly string[]).includes(envVersion)) {
    return envVersion as SupportedGraphVersion;
  }
  return DEFAULT_GRAPH_VERSION;
}

/**
 * Builds the base Graph API URL for a given or default version.
 */
export function getGraphBaseUrl(version?: string | null): string {
  const v = normalizeGraphVersion(version);
  return `https://graph.facebook.com/${v}`;
}

/**
 * Metadata for each Meta Graph API endpoint used across Thabaal.
 */
export interface MetaEndpointMeta {
  method: "GET" | "POST" | "DELETE";
  pathPattern: string;
  requiredPermission: string;
  requiredAssetAccess: string;
  description: string;
}

export const META_ENDPOINTS: Record<string, MetaEndpointMeta> = {
  DEBUG_TOKEN: {
    method: "GET",
    pathPattern: "debug_token?input_token={token}",
    requiredPermission: "whatsapp_business_messaging or system user",
    requiredAssetAccess: "Meta Developer App",
    description: "Inspects token validity, app ownership, scopes, and expiration",
  },
  WABA_DETAILS: {
    method: "GET",
    pathPattern: "{waba_id}?fields=id,name,timezone_id,currency,message_template_namespace",
    requiredPermission: "whatsapp_business_management",
    requiredAssetAccess: "WhatsApp Business Account (WABA)",
    description: "Verifies WABA existence, name, and access permissions",
  },
  WABA_PHONE_NUMBERS: {
    method: "GET",
    pathPattern: "{waba_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status",
    requiredPermission: "whatsapp_business_management",
    requiredAssetAccess: "WhatsApp Business Account (WABA)",
    description: "Lists all registered phone numbers under the WABA",
  },
  PHONE_NUMBER_DETAILS: {
    method: "GET",
    pathPattern: "{phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier",
    requiredPermission: "whatsapp_business_messaging",
    requiredAssetAccess: "Phone Number Asset",
    description: "Fetches specific phone number details, verified name, and messaging tier",
  },
  WABA_SUBSCRIBED_APPS: {
    method: "POST",
    pathPattern: "{waba_id}/subscribed_apps",
    requiredPermission: "whatsapp_business_management",
    requiredAssetAccess: "WABA & Meta App",
    description: "Subscribes the Meta Developer App to receive WABA webhook events",
  },
  GET_SUBSCRIBED_APPS: {
    method: "GET",
    pathPattern: "{waba_id}/subscribed_apps",
    requiredPermission: "whatsapp_business_management",
    requiredAssetAccess: "WABA & Meta App",
    description: "Queries active app subscriptions on the WABA",
  },
  SEND_MESSAGE: {
    method: "POST",
    pathPattern: "{phone_number_id}/messages",
    requiredPermission: "whatsapp_business_messaging",
    requiredAssetAccess: "Phone Number Asset",
    description: "Dispatches template, text, interactive, and media WhatsApp messages",
  },
  MEDIA_UPLOAD: {
    method: "POST",
    pathPattern: "{phone_number_id}/media",
    requiredPermission: "whatsapp_business_messaging",
    requiredAssetAccess: "Phone Number Asset",
    description: "Uploads binary media payloads directly to WhatsApp media storage",
  },
};
