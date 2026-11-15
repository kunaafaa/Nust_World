'use client';
/**
 * Reviews block of a place card (loaded with a dynamic import from InfoCard). Text is always rendered as plain
 * text: React escapes it, and nothing here uses innerHTML.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { cachedRead, write } from '@/lib/reviews/client';
import { textViolation, VIOLATION_MESSAGE } from '@/lib/reviews/textCheck';
import {
  guestNote,
  REVIEW_LIMITS,
  REVIEW_POLICY,
  ReviewError,
  type Review,
  type Summary,
} from '@/lib/reviews/types';
import {
  canWrite,
  ensureReviewAuth,
  setGuestName,
  useReviewAuth,
} from '@/lib/reviews/useReviewAuth';
import { GuestForm } from './GuestForm';
import { SignIn } from './SignIn';
import { StarInput, Stars, useReviewVars } from './Stars';

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

// The display name is remembered for this page session only (memory, not localStorage): it is personal data.
let lastName = '';
const readName = () => lastName;
function saveName(n: string) {
  lastName = n;
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

/** "NUST" (verified university email) or "Guest". Comes from the database, never from what the client sends. */
export function AuthorBadge({ author }: { author: Review['author'] }) {
  if (author === 'nust')
    return (
      <span className="rv-badge rv-badge-nust" title="Verified NUST email">
        NUST
      </span>
    );
  if (author === 'guest')
    return (
      <span className="rv-badge rv-badge-guest" title="Guest: not verified">
        Guest
      </span>
    );
  return null;
}

function Editor({
  placeId,
  existing,
  guestName,
  onDone,
}: {
  placeId: string;
  existing: Review | null;
  /** set for guests: their reviews always carry this profile name */
  guestName: string | null;
  onDone: (msg: string) => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [typed, setName] = useState(existing?.displayName ?? readName());
  const name = guestName ?? typed;
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
      if (!guestName) saveName(name.trim());
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
      {guestName ? (
        <p className="rv-note">
          Posting as <span className="rv-name">{guestName}</span> <AuthorBadge author="guest" />
        </p>
      ) : (
        <input
          value={typed}
          onChange={(e) => setName(e.target.value)}
          maxLength={REVIEW_LIMITS.nameMax}
          placeholder="Display name (shown with your review)"
          aria-label="Display name"
          className="rv-input"
          autoComplete="nickname"
          data-nodrag
        />
      )}
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
        <span className="rv-row rv-who">
          <span className="rv-name">{r.displayName}</span>
          <AuthorBadge author={r.author} />
        </span>
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

async function signOut() {
  const { getStore } = await import('@/lib/reviews/client');
  await (await getStore())?.signOut();
}

function Account({
  email,
  guest,
  guestName,
  onChanged,
}: {
  email: string;
  guest: boolean;
  guestName: string | null;
  onChanged: (msg: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="rv-account">
      <p className="rv-note">
        {guest ? (
          <>
            {guestName ? (
              <>
                Posting as {guestName} <AuthorBadge author="guest" />
              </>
            ) : (
              'Guest'
            )}
          </>
        ) : (
          <>Signed in as {email}</>
        )}{' '}
        ·{' '}
        <button className="rv-link" onClick={() => (guest ? setLeaving(true) : void signOut())}>
          Sign out
        </button>{' '}
        ·{' '}
        <button className="rv-link" onClick={() => setConfirm(true)}>
          Delete my data
        </button>
      </p>
      {leaving && (
        <div className="rv-row rv-actions">
          <span className="rv-note">
            A guest account cannot be signed back into: you will no longer be able to edit or delete
            what you posted. Sign out anyway?
          </span>
          <button className="rv-btn" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="rv-btn" onClick={() => setLeaving(false)}>
            Stay
          </button>
        </div>
      )}
      {guest && (
        <SignIn prompt="Want the NUST badge? Verify your university email: your reviews stay yours." />
      )}
      {confirm && (
        <div className="rv-row rv-actions">
          <span className="rv-note">Delete every review and rating you have made?</span>
          <button
            className="rv-btn"
            onClick={async () => {
              setError('');
              try {
                await write((s) => s.deleteMyData(), 'rv:', 'food:');
                if (guest) setGuestName(null); // the profile (guest name) went too
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
  const { user, ready, guestName } = useReviewAuth();
  const writer = canWrite({ user, guestName });
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
      {!!data?.summary?.guestCount && (
        <p className="rv-fine rv-guest-note">{guestNote(data.summary.guestCount, 'review')}</p>
      )}
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
              signedIn={writer && !offline}
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

      {ready && !offline && writer && !editing && (
        <button className="rv-btn rv-btn-main rv-write" onClick={() => setEditing(true)}>
          {mine ? 'Edit your review' : 'Write a review'}
        </button>
      )}
      {writer && editing && (
        <Editor
          placeId={placeId}
          existing={mine}
          guestName={user?.guest ? guestName : null}
          onDone={changed}
        />
      )}
      {ready && !offline && !writer && (
        <div className="rv-join">
          <GuestForm />
          {!user && <SignIn prompt="Or sign in with your university email for a NUST badge." />}
        </div>
      )}
      {user && (
        <Account email={user.email} guest={user.guest} guestName={guestName} onChanged={changed} />
      )}
      <p className="rv-policy">{REVIEW_POLICY}</p>
    </section>
  );
}
