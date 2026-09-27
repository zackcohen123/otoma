import { SalesforceAuthError, SalesforceConfigError } from "./salesforce/auth";
import { SalesforceApiError } from "./salesforce/client";

/** Classify a Salesforce failure into something a rep (or whoever set this up) can act on. */
export function describeSalesforceError(err: unknown): { title: string; detail: string } {
  if (err instanceof SalesforceAuthError) {
    return {
      title: "Salesforce rejected the app’s credentials",
      detail: `${err.message}\n\nCheck the consumer key/secret (or JWT certificate), that the Client Credentials / JWT flow is enabled, and that the Run As / integration user is active and pre-authorized. See docs/salesforce-setup.md.`,
    };
  }
  if (err instanceof SalesforceApiError) {
    return {
      title: "Salesforce returned an error",
      detail: `${err.errorCode}: ${err.message}\n\nIf this mentions a field or object, the integration user may lack read access to it.`,
    };
  }
  return { title: "Something went wrong", detail: err instanceof Error ? err.message : String(err) };
}

export { SalesforceConfigError };
