import Link from "next/link";

export function ErrorNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="setup">
      <p className="eyebrow">Otoma Account Cheat Sheet</p>
      <h1>{title}</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{detail}</pre>
      <p>
        <Link href="/">← Back to accounts</Link>
      </p>
    </main>
  );
}
