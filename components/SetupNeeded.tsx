import { ThemeToggle } from "./ThemeToggle";

export function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <main className="setup">
      <p className="eyebrow">Otoma Account Cheat Sheet</p>
      <h1>Connect Salesforce</h1>
      <p>
        The app can’t reach Salesforce yet. Add these environment variables (in <code>.env.local</code> locally, or in
        Vercel → Settings → Environment Variables), then reload:
      </p>
      <pre>{missing.map((m) => `${m}=`).join("\n")}</pre>
      <p>
        Step-by-step instructions are in <code>docs/salesforce-setup.md</code>. To preview the UI with sample data
        first, set <code>SALESFORCE_MODE=demo</code>.
      </p>
      <ThemeToggle />
    </main>
  );
}
