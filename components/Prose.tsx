import { toProse, type ProseLine } from "@/lib/prose";

function Line({ line }: { line: ProseLine }) {
  return line.lead ? (
    <>
      <strong>{line.lead}</strong> {line.text}
    </>
  ) : (
    <>{line.text}</>
  );
}

export function Prose({ text, empty }: { text: string | null; empty: string }) {
  const blocks = toProse(text);
  if (!blocks.length) return <p className="empty">{empty}</p>;
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        if (b.kind === "para") {
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <Line line={l} />
                </span>
              ))}
            </p>
          );
        }
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i}>
            {b.items.map((l, j) => (
              <li key={j}>
                <Line line={l} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
