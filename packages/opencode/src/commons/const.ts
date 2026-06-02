/**
 * Commons fork constants.
 *
 * Override during dev:
 *   COMMONS_GATEWAY_URL=http://localhost:8787 \
 *   COMMONS_WEB_URL=http://localhost:5174 \
 *   bun dev
 */

const DEFAULT_PROD_GATEWAY_URL = "https://gateway.commonsmade.com"
const DEFAULT_PROD_WEB_URL = "https://commonsmade.com"

/** The Commons gateway — LLM API endpoint. Used as provider baseURL. */
export const COMMONS_GATEWAY_URL = process.env.COMMONS_GATEWAY_URL ?? DEFAULT_PROD_GATEWAY_URL

/** The Commons web app. Used as the destination for browser-based CLI auth. */
export const COMMONS_WEB_URL = process.env.COMMONS_WEB_URL ?? DEFAULT_PROD_WEB_URL
