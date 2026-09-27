"use server";

import { revalidatePath } from "next/cache";
import { setPrimaryContact } from "@/lib/salesforce/accounts";

export async function togglePrimary(accountId: string, contactId: string, isPrimary: boolean) {
  try {
    await setPrimaryContact(accountId, contactId, isPrimary);
  } catch (err) {
    console.error("[togglePrimary]", err);
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not update Salesforce" };
  }
  revalidatePath(`/a/${accountId}`);
  return { ok: true as const };
}
