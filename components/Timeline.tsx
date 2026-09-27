import { analyzeActivity, effectiveDate, formatDate, isOverdue, relativeDays } from "@/lib/activity";
import type { Activity } from "@/lib/types";
import { ShowMore } from "./ShowMore";

const VISIBLE = 15;

function Item({ a, upcoming }: { a: Activity; upcoming?: boolean }) {
  const overdue = isOverdue(a);
  const state = overdue ? "overdue" : upcoming ? "upcoming" : a.isClosed ? "done" : "open";
  const date = effectiveDate(a);
  return (
    <li className={`tl-item ${state}`}>
      <div className="tl-date num">
        <span>{formatDate(date)}</span>
        <span>{relativeDays(date)}</span>
        {!a.activityDate && <span title="No due date; showing created date">(created)</span>}
      </div>
      <div className="tl-subject">{a.subject}</div>
      <div className="tl-meta">
        <span className={overdue ? "status-overdue" : !a.isClosed ? "status-open" : ""}>
          {overdue ? `Overdue · ${a.status ?? "Open"}` : (a.status ?? "—")}
        </span>
        {a.type && <span>{a.type}</span>}
        {a.whoName && <span>with {a.whoName}</span>}
        {a.ownerName && <span>by {a.ownerName}</span>}
      </div>
    </li>
  );
}

export function Timeline({ activities }: { activities: Activity[] }) {
  const { past, upcoming, density, daysSinceLastTouch, stale, overdue } = analyzeActivity(activities);

  const callouts = (
    <div className="callouts">
      {density && (
        <span className="callout">
          <strong className="num">{density.count}</strong> touches in the last {density.days} days
        </span>
      )}
      {stale && (
        <span className="callout rust">
          {daysSinceLastTouch === null ? "No logged touches yet" : `No touches in ${daysSinceLastTouch} days`}
        </span>
      )}
      {overdue > 0 && (
        <span className="callout rust">
          <strong className="num">{overdue}</strong> overdue {overdue === 1 ? "task" : "tasks"}
        </span>
      )}
    </div>
  );

  if (!activities.length) {
    return (
      <>
        {callouts}
        <p className="empty">No tasks logged against this account in Salesforce.</p>
      </>
    );
  }

  return (
    <>
      {callouts}
      <ol className="timeline">
        {upcoming.length > 0 && (
          <>
            <li className="tl-divider">Upcoming</li>
            {upcoming.map((a) => (
              <Item key={a.id} a={a} upcoming />
            ))}
            <li className="tl-divider">History</li>
          </>
        )}
        {past.slice(0, VISIBLE).map((a) => (
          <Item key={a.id} a={a} />
        ))}
        {past.length > VISIBLE && (
          <ShowMore count={past.length - VISIBLE}>
            {past.slice(VISIBLE).map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </ShowMore>
        )}
      </ol>
    </>
  );
}
