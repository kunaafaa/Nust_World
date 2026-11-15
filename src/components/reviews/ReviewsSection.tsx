'use client';
/**
 * Reviews block of a place card (loaded with a dynamic import from InfoCard). Text is always rendered as plain
 * text: React escapes it, and nothing here uses innerHTML.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { cachedRead, write } from '@/lib/reviews/client';
import { textViolation, VIOLATION_MESSAGE } from '@/lib/reviews/textCheck';
import {
  REVIEW_LIMITS,
  REVIEW_POLICY,
  ReviewError,
  type Review,
  type Summary,
} from '@/lib/reviews/types';
import { ensureReviewAuth, useReviewAuth } from '@/lib/reviews/useReviewAuth';
import { SignIn } from './SignIn';
import { StarInput, Stars, useReviewVars } from './Stars';

const NAME_KEY = 'nw-review-name';
const SHOWN = 5;

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
/** navigator.onLine, re-rendering when it changes. */
function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const errText = (e: unknown) =>
  e instanceof ReviewError ? e.message : 'Something went wrong. Try again later.';

interface Data {
  summary: Summary | null;
  reviews: Review[];
  stale: boolean;
}

function Editor({
  placeId,
  existing,
  onDone,
}: {
  placeId: string;
  existing: Review | null;
  onDone: (msg: string) => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [name, setName] = useState(existing?.displayName ?? readName());
  const [body, setBody] = useState(existing?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const live = textViolation(name) ?? textViolation(body);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!rating) return setError('Pick 1 to 5 stars.');
    if (name.trim().length < REVIEW_LIMITS.nameMin)
      return setError('Add a display name (2 to 40 characters).');
    if (live) return setError(VIOLATION_MESSAGE[live]);
    setBusy(true);
    try {
      await write(
        (s) => s.saveReview({ placeId, displayName: name, rating, body }),
        `rv:${placeId}:`,
      );
      saveName(name.trim());
      onDone(existing ? 'Review updated' : 'Thanks, your review is up');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="rv-editor" onSubmit={submit} aria-label="Write a review">
      <StarInput value={rating} onChange={setRating} label="Your rating" disabled={busy} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={REVIEW_LIMITS.nameMax}
        placeholder="Display name (shown with your review)"
        aria-label="Display name"
        className="rv-input"
        autoComplete="nickname"
        data-nodrag
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={REVIEW_LIMITS.bodyMax}
        rows={3}
        placeholder="What is it like? (optional)"
        aria-label="Review text"
        className="rv-input rv-textarea"
        data-nodrag
      />
      <div className="rv-row rv-between">
        <span className="rv-count">
          {body.length}/{REVIEW_LIMITS.bodyMax}
        </span>
        <span className="rv-row">
          <button type="button" className="rv-btn" onClick={() => onDone('')} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="rv-btn rv-btn-main" disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save' : 'Post review'}
          </button>
        </span>
      </div>
      {(error || live) && (
        <p className="rv-error" role="alert">
          {error || VIOLATION_MESSAGE[live!]}
        </p>
      )}
    </form>
  );
}

function Item({
  r,
  signedIn,
  onEdit,
  onChanged,
}: {
  r: Review;
  signedIn: boolean;
  onEdit: () => void;
  onChanged: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'report' | 'delete'>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const act = async (fn: () => Promise<void>, msg: string) => {
    setError('');
    try {
      await fn();
      setMode('idle');
      onChanged(msg);
    } catch (err) {
      setError(errText(err));
    }
  };
  return (
    <li className="rv-item" data-review={r.id}>
      <div className="rv-row rv-between">
        <span className="rv-name">{r.displayName}</span>
        <span className="rv-date">{fmtDate(r.createdAt)}</span>
      </div>
      <Stars value={r.rating} />
      {r.body && <p className="rv-body">{r.body}</p>}
      {signedIn && mode === 'idle' && (
        <div className="rv-row rv-actions">
          {r.mine ? (
            <>
              <button className="rv-link" onClick={onEdit}>
                Edit
              </button>
              <button className="rv-link" onClick={() => setMode('delete')}>
                Delete
              </button>
            </>
          ) : (
            <button className="rv-link" onClick={() => setMode('report')}>
              Report
            </button>
          )}
        </div>
      )}
      {mode === 'delete' && (
        <div className="rv-row rv-actions">
          <span className="rv-note">Delete your review?</span>
          <button
            className="rv-btn"
            onClick={() =>
              act(() => write((s) => s.deleteReview(r.id), `rv:${r.placeId}:`), 'Review deleted')
            }
          >
            Delete
          </button>
          <button className="rv-btn" onClick={() => setMode('idle')}>
            Keep
          </button>
        </div>
      )}
      {mode === 'report' && (
        <div className="rv-report">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REVIEW_LIMITS.reasonMax}
            placeholder="What is wrong? (optional)"
            aria-label="Report reason"
            className="rv-input"
            data-nodrag
          />
          <div className="rv-row rv-actions">
            <button
              className="rv-btn"
              onClick={() =>
                act(
                  () => write((s) => s.reportReview(r.id, reason), `rv:${r.placeId}:`),
                  'Thanks, the review was reported',
                )
              }
            >
              Send report
            </button>
            <button className="rv-btn" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="rv-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function Account({ email, onChanged }: { email: string; onChanged: (msg: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="rv-account">
      <p className="rv-note">
        Signed in as {email} ·{' '}
        <button
          className="rv-link"
          onClick={async () => {
            const { getStore } = await import('@/lib/reviews/client');
            await (await getStore())?.signOut();
          }}
        >
          Sign out
        </button>{' '}
        ·{' '}
        <button className="rv-link" onClick={() => setConfirm(true)}>
          Delete my data
        </button>
      </p>
      {confirm && (
        <div className="rv-row rv-actions">
          <span className="rv-note">Delete every review and rating you have made?</span>
          <button
            className="rv-btn"
            onClick={async () => {
              setError('');
              try {
                await write((s) => s.deleteMyData(), 'rv:', 'food:');
                setConfirm(false);
                onChanged('Your reviews and ratings were deleted');
              } catch (err) {
                setError(errText(err));
              }
            }}
          >
            Delete all
          </button>
          <button className="rv-btn" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p className="rv-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function ReviewsSection({ placeId }: { placeId: string }) {
  const vars = useReviewVars();
  const { user, ready } = useReviewAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(false);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => ensureReviewAuth(), []);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        cachedRead(`rv:${placeId}:sum`, (st) => st.placeSummary(placeId), { persist: true }),
        cachedRead(`rv:${placeId}:list:${user?.id ?? ''}`, (st) => st.placeReviews(placeId), {
          persist: !user,
        }),
      ]);
      setData({
        summary: s?.value ?? null,
        reviews: r?.value ?? [],
        stale: !!(s?.stale || r?.stale),
      });
      setError('');
    } catch (err) {
      setError(errText(err));
    }
  }, [placeId, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, tick]);

  const changed = (msg: string) => {
    setNotice(msg);
    setEditing(false);
    setTick((t) => t + 1);
  };

  const mine = data?.reviews.find((r) => r.mine) ?? null;
  const list = data?.reviews ?? [];
  const shown = all ? list : list.slice(0, SHOWN);
  const online = useOnline();
  const offline = !online || !!data?.stale;

  return (
    <section className="rv" style={vars} aria-label="Reviews" data-reviews={placeId}>
      <div className="rv-row rv-between">
        <h3 className="rv-title">Reviews</h3>
        {data?.summary ? (
          <span className="rv-summary">
            <Stars value={data.summary.avg} />
            <span>
              {data.summary.avg.toFixed(1)} · {data.summary.count} review
              {data.summary.count === 1 ? '' : 's'}
            </span>
          </span>
        ) : (
          data && <span className="rv-note">No reviews yet</span>
        )}
      </div>
      {!data && !error && <div className="menu-skel rv-skel" aria-label="Loading reviews" />}
      {error && <p className="rv-note">{error}</p>}
      {offline && data && <p className="rv-note">Offline: showing saved reviews, read-only.</p>}
      {notice && (
        <p className="rv-note" role="status">
          {notice}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="rv-list">
          {shown.map((r) => (
            <Item
              key={r.id}
              r={r}
              signedIn={!!user && !offline}
              onEdit={() => setEditing(true)}
              onChanged={changed}
            />
          ))}
        </ul>
      )}
      {list.length > SHOWN && !all && (
        <button className="rv-link" onClick={() => setAll(true)}>
          Show all {list.length} reviews
        </button>
      )}

      {ready && !offline && user && !editing && (
        <button className="rv-btn rv-btn-main rv-write" onClick={() => setEditing(true)}>
          {mine ? 'Edit your review' : 'Write a review'}
        </button>
      )}
      {user && editing && <Editor placeId={placeId} existing={mine} onDone={changed} />}
      {ready && !offline && !user && (
        <SignIn prompt="Sign in with your university email to review and rate." />
      )}
      {user && <Account email={user.email} onChanged={changed} />}
      <p className="rv-policy">{REVIEW_POLICY}</p>
    </section>
  );
}
