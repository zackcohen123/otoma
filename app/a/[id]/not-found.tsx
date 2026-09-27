import { ErrorNotice } from "@/components/ErrorNotice";

export default function NotFound() {
  return (
    <ErrorNotice
      title="Account not found"
      detail="No Salesforce Account with that ID is visible to the integration user. It may have been deleted or merged, or the user may lack access."
    />
  );
}
