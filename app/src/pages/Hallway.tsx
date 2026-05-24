import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavicon } from '../hooks/useFavicon';
import './Hallway.css';

/** Per-room metadata: which spheres exist, where they go, and what's beneath them. */
interface RoomDoor {
  key: 'notes' | 'timeline' | 'data' | 'treasury' | 'daybook' | 'sanctuary';
  name: string;
  sub: string;
  size: 'big' | 'small';
  /** Path to navigate after threshold settles. null = "coming soon" (no nav). */
  route: string | null;
}

const DOORS: RoomDoor[] = [
  { key: 'notes',     name: 'Notes',     sub: 'cards on a table',     size: 'small', route: '/notes' },
  { key: 'timeline',  name: 'Timeline',  sub: 'life, in a line',      size: 'small', route: '/timeline' },
  { key: 'data',      name: 'Data',      sub: 'reading & scripture',  size: 'small', route: '/data' },
  { key: 'treasury',  name: 'Treasury',  sub: 'verses kept',          size: 'small', route: '/treasury' },
  { key: 'daybook',   name: 'Daybook',   sub: 'hours given shape',    size: 'small', route: '/daybook' },
  { key: 'sanctuary', name: 'Sanctuary', sub: 'scripture & prayer',   size: 'big',   route: '/sanctuary' },
];

const PROX_RADIUS = 280;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function Hallway() {
  useFavicon('/icons/wardrobe1.png', 'Wardrobe');
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement>(null);
  const sphereRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [entering, setEntering] = useState<RoomDoor | null>(null);
  const [thresholdVisible, setThresholdVisible] = useState(false);
  const navTimerRef = useRef<number | null>(null);

  const today = new Date();

  // Cursor-proximity warmth: each sphere lights as cursor approaches.
  // Done outside of React state for performance — we set a CSS variable directly.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      for (const door of DOORS) {
        const el = sphereRefs.current[door.key];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        const t = Math.max(0, 1 - d / PROX_RADIUS);
        el.style.setProperty('--prox', (t * t).toFixed(3));
      }
    };
    const onLeave = () => {
      for (const door of DOORS) {
        const el = sphereRefs.current[door.key];
        if (el) el.style.setProperty('--prox', '0');
      }
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Esc returns to hallway during threshold.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && thresholdVisible) returnToHallway();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholdVisible]);

  function enterRoom(door: RoomDoor) {
    if (entering) return;
    const sphere = sphereRefs.current[door.key];
    if (!sphere) return;

    setEntering(door);

    // Compute viewport-fill scale: target = diagonal × 1.1
    const r = sphere.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = vw / 2 - cx;
    const dy = vh / 2 - cy;
    const targetSize = Math.hypot(vw, vh) * 1.1;
    const scale = targetSize / r.width;

    sphere.style.transition =
      'transform 5200ms cubic-bezier(.25,.5,.2,1), box-shadow 4000ms ease, ' +
      'background 3600ms ease, border-color 3000ms ease';
    sphere.style.transformOrigin = 'center center';
    sphere.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    // Threshold fade-in begins after 3200ms (per the design's pacing)
    window.setTimeout(() => setThresholdVisible(true), 3200);

    // For routed rooms, auto-navigate after the threshold has been visible
    // for a contemplative beat. Esc still aborts.
    if (door.route) {
      navTimerRef.current = window.setTimeout(() => {
        navigate(door.route!);
      }, 3200 + 2400); // threshold visible + 2.4s of room-name presence
    }
  }

  function returnToHallway() {
    if (navTimerRef.current) {
      window.clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    setThresholdVisible(false);

    // Clear the inline transform so the CSS-defined positioning reasserts.
    if (entering) {
      const sphere = sphereRefs.current[entering.key];
      if (sphere) {
        sphere.style.removeProperty('transform');
        sphere.style.removeProperty('transition');
        sphere.style.removeProperty('transform-origin');
      }
    }

    window.setTimeout(() => {
      setEntering(null);
    }, 900);
  }

  return (
    <div className={`hallway${entering ? ' entering' : ''}`}>
      <aside className="seal" aria-label="Today's date">
        <div className="m">{MONTHS[today.getMonth()]}</div>
        <div className="d">{String(today.getDate()).padStart(2, '0')}</div>
        <div className="y">{`A·D ${today.getFullYear()}`}</div>
      </aside>

      <main className="stage">
        <div className="stage-inner" ref={stageRef}>
          <svg className="archline" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M120 196 Q 500 30 880 196"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeDasharray="3 6"
              opacity="0.5"
              style={{ color: 'var(--ink-faint)' }}
            />
          </svg>

          {DOORS.map((door) => (
            <a
              key={door.key}
              ref={(el) => { sphereRefs.current[door.key] = el; }}
              href={door.route || '#'}
              className={`sphere ${door.size} s-${door.key}${entering?.key === door.key ? ' is-entering' : ''}`}
              onClick={(e) => { e.preventDefault(); enterRoom(door); }}
            >
              <div className="inner">
                <div className="label">{door.name}</div>
                <span className="sub">{door.sub}</span>
              </div>
            </a>
          ))}
        </div>
      </main>

      <div className="epigraph">&ldquo;Be still, and know.&rdquo;</div>

      <div
        className={`threshold${thresholdVisible ? ' visible' : ''}`}
        aria-hidden={!thresholdVisible}
      >
        <div className="entering-word">Entering</div>
        <h1 className="room-name">{entering?.name ?? ''}</h1>
        <div className="room-sub">{entering?.sub ?? ''}</div>
        {entering?.route ? (
          <button
            type="button"
            className="enter-room"
            onClick={() => {
              if (navTimerRef.current) window.clearTimeout(navTimerRef.current);
              navigate(entering.route!);
            }}
          >
            enter →
          </button>
        ) : (
          <div className="coming-soon">Coming soon</div>
        )}
        <button type="button" className="return" onClick={returnToHallway}>
          ← return to the hallway
        </button>
      </div>
    </div>
  );
}
