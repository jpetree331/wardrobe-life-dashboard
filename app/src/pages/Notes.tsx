import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link } from 'react-router-dom';
import {
  type Board,
  type Card,
  type CardType,
  type SwatchKey,
  type TodoItem,
  type TrashEntry,
  SWATCHES,
  createBoardWithTile,
  createCard,
  getBoardAncestry,
  getOrCreateRootBoard,
  hardDeleteCardRow,
  hardDeleteEmptyBoard,
  insertCardRow,
  listCards,
  listTrash,
  removeTrashEntry,
  renameBoard,
  restoreTrash,
  softDeleteCard,
  softDeleteColumn,
  softDeleteTodoItem,
  updateCard,
} from '../lib/notes';
import type { Arrow, ColumnPayload } from '../lib/notes';
import {
  createArrow,
  hardDeleteArrowRow,
  insertArrowRow,
  listArrows,
  softDeleteArrow,
  updateArrow,
} from '../lib/notes';
import { insertAt, insertionIndexFromY } from '../lib/notesColumns';
import { arrowPath, bestEdgePair, bezierPoint, type RectLike } from '../lib/notesArrows';
import type { CommentPayload, SwatchCardPayload } from '../lib/notes';
import { extractPalette, normalizeHex } from '../lib/notesPalette';
import { BoardHistory, BurstCoalescer, hasUserContent, type Command } from '../lib/notesHistory';
import type { FilePayload, ImagePayload, LinkPayload } from '../lib/notes';
import { domainOf, embedUrlFor, isProbablyUrl, type LinkMeta } from '../lib/notesLinkMeta';
import { fetchLinkMeta } from '../lib/notesLinkClient';
import {
  aspectResize,
  fanOutOffsets,
  initialCardSize,
  isImageFile,
} from '../lib/notesImages';
import { fileGroup, humanSize, truncateMiddle } from '../lib/notesFiles';
import {
  removeStorageObjects,
  signedDownloadUrl,
  signedMediaUrl,
  uploadFile,
  uploadImage,
} from '../lib/notesMedia';
import {
  fitView,
  type View,
  viewCenteredOnContent,
  wrapperToCanvas,
  zoomAroundCursor,
} from '../lib/notesPanZoom';
import {
  detectMarkdownSentinel,
  extractTitleFromHtml,
  isTypingContext,
  shouldOfferConvert,
} from '../lib/notesShortcuts';
import { loadSavedView, saveSavedView } from '../lib/notesViewStore';
import { marqueeHits, normalizeRect, type Rect } from '../lib/notesMarquee';
import { useFavicon } from '../hooks/useFavicon';
import './Notes.css';

const TOOLBAR_TYPES: Array<{
  type: CardType;
  label: string;
  hint: string;
}> = [
  { type: 'note',     label: 'Note',     hint: 'Drag onto canvas' },
  { type: 'todo',     label: 'To-do',    hint: 'Drag onto canvas' },
  { type: 'link',     label: 'Link',     hint: 'Drag onto canvas' },
  { type: 'heading',  label: 'Heading',  hint: 'Drag onto canvas' },
  { type: 'board',    label: 'Board',    hint: 'Drag onto canvas (folder)' },
  { type: 'document', label: 'Document', hint: 'Drag onto canvas' },
  { type: 'image',    label: 'Image',    hint: 'Click to pick, or drop image files on the canvas' },
  { type: 'file',     label: 'File',     hint: 'Click to pick, or drop any file on the canvas' },
  { type: 'column',   label: 'Column',   hint: 'Drag onto canvas — a list container for cards' },
  { type: 'swatch',   label: 'Swatch',   hint: 'Drag onto canvas — a color chip for palettes' },
  { type: 'comment',  label: 'Comment',  hint: 'Drag onto canvas — an annotation sticky' },
];

const DEFAULT_W: Record<CardType, number> = {
  note: 240,
  todo: 240,
  heading: 280,
  link: 240,
  document: 140,
  board: 130,
  image: 240,
  file: 250,
  column: 260,
  swatch: 120,
  comment: 230,
};
const DEFAULT_H: Record<CardType, number> = {
  note: 140,
  todo: 200,
  heading: 50,
  link: 90,
  document: 110,
  board: 130,
  image: 180,
  file: 96,
  column: 120, // columns auto-size; this is only the drop footprint
  swatch: 150,
  comment: 110,
};

export default function Notes() {
  useFavicon('/icons/papers3.png', 'Notes · Wardrobe');

  const [rootBoard, setRootBoard] = useState<Board | null>(null);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [ancestry, setAncestry] = useState<Board[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Marquee rectangle while drag-selecting, in wrapper (screen) space.
  const [marquee, setMarquee] = useState<Rect | null>(null);
  // Space held = pan mode on the canvas (Milanote model: plain drag on
  // empty canvas selects; Space+drag or middle-mouse pans).
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Live column drop target while dragging cards (highlight + indicator).
  const [colDrop, setColDrop] = useState<{ colId: string; index: number } | null>(null);
  // Member row being dragged out of / within a column (styling).
  const [memberDragId, setMemberDragId] = useState<string | null>(null);
  // Arrows (Sprint 9).
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);
  const [arrowMenu, setArrowMenu] = useState<{ x: number; y: number; arrowId: string } | null>(null);
  const [arrowDraft, setArrowDraft] = useState<{ fromId: string; cursor: { x: number; y: number } } | null>(null);
  const [arrowLabelEditId, setArrowLabelEditId] = useState<string | null>(null);
  const arrowsRef = useRef<Arrow[]>([]);
  useEffect(() => { arrowsRef.current = arrows; }, [arrows]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; cardId: string } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [docOverlayId, setDocOverlayId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  // In-flight image uploads, shown as shimmer placeholders on the canvas.
  const [uploads, setUploads] = useState<Array<{ id: string; x: number; y: number; w: number; h: number }>>([]);
  const [statusMsg, setStatusMsg] = useState('Drag a card type onto the canvas. Scroll to pan, ⌘+scroll to zoom.');
  // Theme: parchment (default) or the Milanote skin. Device-local choice.
  const [theme, setTheme] = useState<'parchment' | 'milanote'>(() => {
    try {
      return window.localStorage.getItem('notes-theme') === 'milanote' ? 'milanote' : 'parchment';
    } catch {
      return 'parchment';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('notes-theme', theme);
    } catch { /* best-effort */ }
  }, [theme]);
  // Floating format toolbar over text selection inside a Note body.
  const [fmtToolbar, setFmtToolbar] = useState<{ top: number; left: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Latest cards, readable inside timers/commands without stale closures.
  const cardsRef = useRef<Card[]>([]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  // ── Undo/redo (see lib/notesHistory.ts for the API contract) ──────────
  // One history per board, session-scoped. historyTick re-renders the
  // ribbon buttons when a stack changes.
  const historiesRef = useRef(new Map<string, BoardHistory>());
  const [, setHistoryTick] = useState(0);
  const getHistory = useCallback((boardId: string | null): BoardHistory | null => {
    if (!boardId) return null;
    let h = historiesRef.current.get(boardId);
    if (!h) {
      h = new BoardHistory();
      h.onChange = () => setHistoryTick((t) => t + 1);
      historiesRef.current.set(boardId, h);
    }
    return h;
  }, []);

  const patchCardLocal = useCallback((id: string, patch: Partial<Card>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const upsertCardLocal = useCallback((card: Card) => {
    setCards((prev) => {
      const i = prev.findIndex((c) => c.id === card.id);
      if (i === -1) return [...prev, card];
      const next = prev.slice();
      next[i] = card;
      return next;
    });
  }, []);
  const removeCardsLocal = useCallback((ids: Set<string>) => {
    setCards((prev) => prev.filter((c) => !ids.has(c.id)));
  }, []);
  const upsertArrowLocal = useCallback((arrow: Arrow) => {
    setArrows((prev) => {
      const i = prev.findIndex((a) => a.id === arrow.id);
      if (i === -1) return [...prev, arrow];
      const next = prev.slice();
      next[i] = arrow;
      return next;
    });
  }, []);
  const removeArrowLocal = useCallback((id: string) => {
    setArrows((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const doUndo = useCallback(async () => {
    const cmd = await getHistory(currentBoardId)?.undo();
    if (cmd) setStatusMsg(`Undid: ${cmd.label.toLowerCase()}`);
  }, [getHistory, currentBoardId]);
  const doRedo = useCallback(async () => {
    const cmd = await getHistory(currentBoardId)?.redo();
    if (cmd) setStatusMsg(`Redid: ${cmd.label.toLowerCase()}`);
  }, [getHistory, currentBoardId]);

  // ── Selection helpers ─────────────────────────────────────────────────
  const selectOnly = useCallback((id: string) => setSelectedIds(new Set([id])), []);
  const clearSelection = useCallback(
    () => setSelectedIds((prev) => (prev.size ? new Set<string>() : prev)),
    [],
  );
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Bootstrap: ensure root board, load it ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const root = await getOrCreateRootBoard();
        setRootBoard(root);
        setCurrentBoardId(root.id);
      } catch (err) {
        console.error(err);
        setStatusMsg('Could not load Notes. Have you run migration 0004?');
      }
    })();
  }, []);

  // ── Load board contents on board change ────────────────────────────────
  // Guards the view-save debounce: we must not persist the view for a board
  // until its own saved view has been restored, or the pre-restore default
  // would clobber the stored one while the board is still loading.
  const viewRestoredFor = useRef<string | null>(null);

  const loadBoard = useCallback(async (boardId: string) => {
    try {
      const [cardList, chain, arrowList] = await Promise.all([
        listCards(boardId),
        getBoardAncestry(boardId),
        listArrows(boardId).catch((err) => {
          // Arrows table may not exist yet (migration 0012 pending).
          console.error(err);
          return [] as Arrow[];
        }),
      ]);
      setCards(cardList);
      setArrows(arrowList);
      setAncestry(chain);
      setSelectedIds(new Set());
      setSelectedArrowId(null);
      setArrowMenu(null);
      setArrowLabelEditId(null);
      // Restore this board's saved view; else fit its cards; else identity.
      const saved = loadSavedView(boardId);
      if (saved) {
        setView(saved);
      } else {
        const r = wrapRef.current?.getBoundingClientRect();
        if (cardList.length > 0 && r) {
          setView(fitView(cardList.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })), r.width, r.height));
        } else {
          setView({ x: 0, y: 0, k: 1 });
        }
      }
      viewRestoredFor.current = boardId;
      const cur = chain[chain.length - 1];
      setStatusMsg(
        `${cardList.length} item${cardList.length === 1 ? '' : 's'} on "${cur?.name || 'Home'}"`,
      );
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load board.');
    }
  }, []);

  useEffect(() => {
    if (currentBoardId) loadBoard(currentBoardId);
  }, [currentBoardId, loadBoard]);

  // ── Persist view per board (300ms after pan/zoom settles) ─────────────
  useEffect(() => {
    if (!currentBoardId || viewRestoredFor.current !== currentBoardId) return;
    const handle = window.setTimeout(() => saveSavedView(currentBoardId, view), 300);
    return () => window.clearTimeout(handle);
  }, [view, currentBoardId]);

  // ── Pan/zoom ──────────────────────────────────────────────────────────
  // ctrl/cmd + wheel = zoom, ordinary wheel = pan.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = wrap.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        setView((v) => zoomAroundCursor(v, factor, cx, cy));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  // Track Space for pan mode. preventDefault stops the page scrolling on
  // Space while the canvas has focus; typing contexts keep their space.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code !== 'Space' || isTypingContext(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function up(e: KeyboardEvent) {
      if (e.code === 'Space') setSpaceHeld(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Empty-canvas gestures: plain drag = marquee select; Space+drag or
  // middle-mouse drag = pan (Milanote model).
  function onCanvasMouseDown(e: React.MouseEvent) {
    const pan = e.button === 1 || (e.button === 0 && spaceHeld);
    if (!pan && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.nt-card')) return;
    if ((e.target as HTMLElement).closest('.nt-ctx')) return;
    if ((e.target as HTMLElement).closest('.nt-arrow-hit')) return;
    if ((e.target as HTMLElement).closest('.nt-arrow-label')) return;
    setCtxMenu(null);
    setArrowMenu(null);
    setSelectedArrowId(null);
    if (pan) startPanGesture(e);
    else startMarqueeGesture(e);
  }

  function startPanGesture(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startView = view;
    wrapRef.current?.classList.add('panning');
    const onMove = (ev: MouseEvent) => {
      setView({
        x: startView.x + (ev.clientX - startX),
        y: startView.y + (ev.clientY - startY),
        k: startView.k,
      });
    };
    const onUp = () => {
      wrapRef.current?.classList.remove('panning');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startMarqueeGesture(e: React.MouseEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x1 = e.clientX - r.left;
    const y1 = e.clientY - r.top;
    // View and cards are stable for the duration of the gesture (no pan or
    // edits mid-marquee), so capturing them from this render is safe.
    // Only free cards live on the canvas plane — members aren't marqueeable.
    const gestureView = view;
    const gestureCards = cards.filter((c) => !c.parent_column);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const baseSelection = additive ? new Set(selectedIds) : new Set<string>();
    if (!additive) clearSelection();
    let dragging = false;
    const onMove = (ev: MouseEvent) => {
      const rect = normalizeRect(x1, y1, ev.clientX - r.left, ev.clientY - r.top);
      if (!dragging && rect.w < 4 && rect.h < 4) return; // click, not drag
      dragging = true;
      setMarquee(rect);
      const hits = marqueeHits(rect, gestureView, gestureCards);
      setSelectedIds(new Set([...baseSelection, ...hits]));
    };
    const onUp = () => {
      setMarquee(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function doFit() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    setView(
      fitView(
        cards.filter((c) => !c.parent_column).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
        r.width,
        r.height,
      ),
    );
  }

  // ── Card drag (single or whole selection) ─────────────────────────────
  function startCardDrag(card: Card, e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[contenteditable]') || target.closest('input') || target.closest('button') || target.closest('a')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);

    // Shift/Cmd/Ctrl+click toggles membership instead of dragging.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      toggleSelect(card.id);
      return;
    }

    // Dragging a card inside the current selection moves the whole group;
    // dragging an unselected card selects it alone first.
    const movingIds = selectedIds.has(card.id) ? selectedIds : new Set([card.id]);
    if (!selectedIds.has(card.id)) selectOnly(card.id);

    const startPositions = new Map<string, { x: number; y: number }>();
    for (const c of cards) {
      if (movingIds.has(c.id)) startPositions.set(c.id, { x: c.x, y: c.y });
    }
    // Columns can't nest, so a drag containing a column never targets one.
    const canJoinColumn = ![...movingIds].some(
      (id) => cards.find((c) => c.id === id)?.type === 'column',
    );
    const startX = e.clientX;
    const startY = e.clientY;
    const k = view.k;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      setCards((prev) =>
        prev.map((c) => {
          const p = startPositions.get(c.id);
          return p ? { ...c, x: p.x + dx, y: p.y + dy } : c;
        }),
      );
      setColDrop(canJoinColumn ? computeColumnDrop(ev.clientX, ev.clientY) : null);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColDrop(null);
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return;

      // Dropped over a column → the whole selection joins it, ordered by
      // its current vertical position.
      const drop = canJoinColumn ? computeColumnDrop(ev.clientX, ev.clientY) : null;
      if (drop) {
        // Restore the original free positions first so lastFreeX/Y (and an
        // undo) reflect where the drag STARTED, not the drop pixel.
        setCards((prev) =>
          prev.map((c) => {
            const p = startPositions.get(c.id);
            return p ? { ...c, x: p.x, y: p.y } : c;
          }),
        );
        const ordered = [...startPositions.keys()].sort((a, b) => {
          const ca = startPositions.get(a)!;
          const cb = startPositions.get(b)!;
          return ca.y - cb.y || ca.x - cb.x;
        });
        placeCards(ordered, drop, ordered.length > 1 ? `Move ${ordered.length} cards to column` : 'Move to column');
        return;
      }

      // Plain move: persist; one history command per gesture for the group.
      const moves = [...startPositions].map(([id, p]) => ({
        id,
        from: p,
        to: { x: p.x + dx, y: p.y + dy },
      }));
      for (const m of moves) updateCard(m.id, m.to).catch(console.error);
      getHistory(currentBoardId)?.push({
        label: moves.length > 1 ? `Move ${moves.length} cards` : 'Move',
        undo: async () => {
          for (const m of moves) {
            patchCardLocal(m.id, m.from);
            await updateCard(m.id, m.from);
          }
        },
        do: async () => {
          for (const m of moves) {
            patchCardLocal(m.id, m.to);
            await updateCard(m.id, m.to);
          }
        },
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Media cards: shared upload pipeline (Sprints 5–6) ─────────────────
  // Images → image cards; everything else → file cards. Same bucket, same
  // trash rule (storage objects survive soft-delete).
  const fileInputRef = useRef<HTMLInputElement>(null);      // image picker
  const anyFileInputRef = useRef<HTMLInputElement>(null);   // any-file picker
  const pendingImagePointRef = useRef<{ x: number; y: number } | null>(null);

  /** Canvas-space point at the middle of the viewport (paste target). */
  function centerCanvasPoint(): { x: number; y: number } {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 200, y: 200 };
    const r = wrap.getBoundingClientRect();
    const pt = wrapperToCanvas(view, r.width / 2, r.height / 2);
    return { x: Math.round(pt.x - 140), y: Math.round(pt.y - 100) };
  }

  /**
   * Upload files and create media cards fanned out from `at` — image
   * cards for images, file cards for everything else. Optimistic shimmer
   * placeholders while uploading; a failed upload (or a failed card
   * insert, whose storage objects get removed) leaves no orphans. One
   * composite history command for the whole batch.
   */
  async function createMediaCards(files: File[], at: { x: number; y: number }) {
    if (!currentBoardId || files.length === 0) return;
    const offsets = fanOutOffsets(files.length);
    const created: Card[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isImg = isImageFile(f);
      const ph = {
        id: `up-${i}-${Date.now()}`,
        x: at.x + offsets[i].dx,
        y: at.y + offsets[i].dy,
        w: 240,
        h: isImg ? 180 : DEFAULT_H.file,
      };
      setUploads((prev) => [...prev, ph]);
      try {
        let card: Card;
        if (isImg) {
          const up = await uploadImage(f);
          const size = initialCardSize(up.naturalW, up.naturalH);
          try {
            card = await createCard({
              board_id: currentBoardId,
              type: 'image',
              x: ph.x, y: ph.y, w: size.w, h: size.h,
              payload: {
                storagePath: up.storagePath,
                thumbPath: up.thumbPath,
                naturalW: up.naturalW,
                naturalH: up.naturalH,
              },
            });
          } catch (err) {
            // Card row failed after upload → remove the objects (no orphans).
            const paths = [up.storagePath, ...(up.thumbPath ? [up.thumbPath] : [])];
            await removeStorageObjects(paths).catch(() => {});
            throw err;
          }
        } else {
          const up = await uploadFile(f);
          try {
            card = await createCard({
              board_id: currentBoardId,
              type: 'file',
              x: ph.x, y: ph.y, w: DEFAULT_W.file, h: DEFAULT_H.file,
              payload: up,
            });
          } catch (err) {
            await removeStorageObjects([up.storagePath]).catch(() => {});
            throw err;
          }
        }
        created.push(card);
        upsertCardLocal(card);
      } catch (err) {
        console.error(err);
        setStatusMsg(`Could not add "${f.name}".`);
      } finally {
        setUploads((prev) => prev.filter((u) => u.id !== ph.id));
      }
    }
    if (created.length > 0) {
      setSelectedIds(new Set(created.map((c) => c.id)));
      const allImages = created.every((c) => c.type === 'image');
      const label = created.length === 1
        ? (allImages ? 'Add image' : 'Add file')
        : (allImages ? 'Add images' : 'Add files');
      getHistory(currentBoardId)?.push(makeCreateCommand(created, label));
      setStatusMsg(created.length > 1 ? `Added ${created.length} cards.` : label + '.');
    }
  }
  // Stable handle for the document-level paste listener.
  const createMediaCardsRef = useRef(createMediaCards);
  createMediaCardsRef.current = createMediaCards;
  const centerCanvasPointRef = useRef(centerCanvasPoint);
  centerCanvasPointRef.current = centerCanvasPoint;

  // ── Link cards: metadata (Sprint 7) ───────────────────────────────────

  /**
   * Merge fetched metadata into a link card. NEVER overwrites a manually
   * entered title. Applied outside history — metadata arrival is a system
   * fill-in, not an undoable user edit.
   */
  const applyLinkMeta = useCallback(
    async (cardId: string, meta: LinkMeta) => {
      const cur = cardsRef.current.find((c) => c.id === cardId);
      if (!cur || cur.type !== 'link') return;
      const p = cur.payload as LinkPayload;
      const payload: LinkPayload = {
        ...p,
        title: p.title?.trim() ? p.title : meta.title ?? '',
        description: meta.description,
        image: meta.image,
        favicon: meta.favicon,
        siteName: meta.siteName,
        fetchedAt: new Date().toISOString(),
      };
      patchCardLocal(cardId, { payload });
      await updateCard(cardId, { payload }).catch(console.error);
    },
    [patchCardLocal],
  );

  const refreshLinkMeta = useCallback(
    async (card: Card) => {
      const url = (card.payload as LinkPayload).url;
      if (!url) return;
      setStatusMsg('Fetching link details…');
      const meta = await fetchLinkMeta(url);
      if (meta) {
        await applyLinkMeta(card.id, meta);
        setStatusMsg('Link details updated.');
      } else {
        setStatusMsg('Could not fetch link details.');
      }
    },
    [applyLinkMeta],
  );

  /** Paste-to-create: a bare URL becomes a link card + metadata fetch. */
  async function createLinkFromUrl(url: string) {
    if (!currentBoardId) return;
    const at = centerCanvasPoint();
    try {
      const card = await createCard({
        board_id: currentBoardId,
        type: 'link',
        x: at.x, y: at.y, w: DEFAULT_W.link, h: DEFAULT_H.link,
        payload: { title: '', url },
      });
      upsertCardLocal(card);
      selectOnly(card.id);
      getHistory(currentBoardId)?.push(makeCreateCommand([card], 'Add link'));
      setStatusMsg('Link card created — fetching details…');
      const meta = await fetchLinkMeta(url);
      if (meta) await applyLinkMeta(card.id, meta);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not create link card.');
    }
  }
  const createLinkFromUrlRef = useRef(createLinkFromUrl);
  createLinkFromUrlRef.current = createLinkFromUrl;

  // Paste routing (canvas scope only — typing keeps its native paste):
  // clipboard files → media cards; a bare URL → link card with metadata.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTypingContext(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length > 0) {
        e.preventDefault();
        createMediaCardsRef.current(files, centerCanvasPointRef.current());
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (isProbablyUrl(text)) {
        e.preventDefault();
        createLinkFromUrlRef.current(text.trim());
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  // ── Toolbar drag (drop on canvas creates a card) ──────────────────────
  const dropDataRef = useRef<CardType | null>(null);
  function onToolbarDragStart(type: CardType, e: React.DragEvent) {
    dropDataRef.current = type;
    e.dataTransfer.setData('text/plain', type);
    e.dataTransfer.effectAllowed = 'copy';
    wrapRef.current?.classList.add('adding');
  }
  function onToolbarDragEnd() {
    dropDataRef.current = null;
    wrapRef.current?.classList.remove('adding');
  }
  function onCanvasDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  async function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    wrapRef.current?.classList.remove('adding');
    if (!currentBoardId) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const wrapperPt = { x: e.clientX - r.left, y: e.clientY - r.top };
    const pt = wrapperToCanvas(view, wrapperPt.x, wrapperPt.y);

    // Desktop file drop → media cards at the drop point (images become
    // image cards, everything else file cards).
    const droppedFiles = [...e.dataTransfer.files];
    if (droppedFiles.length > 0) {
      dropDataRef.current = null;
      createMediaCards(droppedFiles, { x: Math.round(pt.x - 120), y: Math.round(pt.y - 90) });
      return;
    }

    const type = (dropDataRef.current ||
      (e.dataTransfer.getData('text/plain') as CardType)) as CardType;
    if (!type) return;
    // Center the card around the drop point
    const w = DEFAULT_W[type];
    const h = DEFAULT_H[type];
    const x = Math.round(pt.x - w / 2);
    const y = Math.round(pt.y - h / 2);
    // The Image/File tools open a picker; cards appear on file selection.
    if (type === 'image' || type === 'file') {
      pendingImagePointRef.current = { x, y };
      (type === 'image' ? fileInputRef : anyFileInputRef).current?.click();
      return;
    }
    try {
      if (type === 'board') {
        const name = window.prompt('Board name', 'New board') || 'New board';
        const parentId = currentBoardId;
        const created = await createBoardWithTile({
          parent_board_id: parentId,
          name,
          x, y,
        });
        setCards((prev) => [...prev, created.tile]);
        selectOnly(created.tile.id);
        // Undo only while the board is still empty; a board with content
        // must go through the trash (divergence rule 1). Ids are mutable
        // closure state because redo re-creates with fresh ids.
        let boardId = created.board.id;
        let tileId = created.tile.id;
        getHistory(parentId)?.push({
          label: 'Create board',
          undo: async () => {
            const contents = await listCards(boardId);
            if (contents.length > 0) {
              setStatusMsg('Board has content — delete its tile to send it to the trash instead.');
              throw new Error('cannot undo: board is not empty');
            }
            removeCardsLocal(new Set([tileId]));
            await hardDeleteEmptyBoard(boardId);
          },
          do: async () => {
            const again = await createBoardWithTile({ parent_board_id: parentId, name, x, y });
            boardId = again.board.id;
            tileId = again.tile.id;
            upsertCardLocal(again.tile);
          },
        });
      } else {
        const payload = defaultPayloadFor(type);
        const card = await createCard({
          board_id: currentBoardId,
          type,
          x, y, w, h,
          payload,
        });
        setCards((prev) => [...prev, card]);
        selectOnly(card.id);
        getHistory(currentBoardId)?.push(makeCreateCommand([card], 'Create card'));
      }
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not create card.');
    }
  }

  /**
   * Command for cards that were just created (drop, duplicate, paste…).
   * Undo removes them — hard-remove only if still contentless at undo
   * time, otherwise soft-delete through the trash (divergence rule 1).
   * Redo re-inserts the rows with their original ids and retracts any
   * trash entries the undo created.
   */
  function makeCreateCommand(created: Card[], label: string): Command {
    const snapshots = created.slice();
    const trashIds: (string | null)[] = snapshots.map(() => null);
    // For created COLUMNS: members present at undo time, kept for redo.
    const memberSnapshots: Card[][] = snapshots.map(() => []);
    return {
      label: snapshots.length > 1 ? `${label} (${snapshots.length})` : label,
      undo: async () => {
        for (let i = 0; i < snapshots.length; i++) {
          // Use the card's CURRENT state — it may have gained content.
          const cur = cardsRef.current.find((c) => c.id === snapshots[i].id) ?? snapshots[i];
          snapshots[i] = cur;
          if (cur.type === 'column') {
            // A column may have gained members since creation — they must
            // ride along in a composite snapshot (divergence rule 1).
            const members = cardsRef.current
              .filter((c) => c.parent_column === cur.id)
              .sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0));
            memberSnapshots[i] = members;
            removeCardsLocal(new Set([cur.id, ...members.map((m) => m.id)]));
            if (members.length > 0 || hasUserContent(cur)) {
              trashIds[i] = await softDeleteColumn(cur, members);
            } else {
              trashIds[i] = null;
              await hardDeleteCardRow(cur.id);
            }
            continue;
          }
          removeCardsLocal(new Set([cur.id]));
          if (hasUserContent(cur)) {
            trashIds[i] = await softDeleteCard(cur);
          } else {
            trashIds[i] = null;
            await hardDeleteCardRow(cur.id);
          }
        }
        clearSelection();
      },
      do: async () => {
        for (let i = 0; i < snapshots.length; i++) {
          const row = await insertCardRow(snapshots[i]);
          upsertCardLocal(row);
          for (const m of memberSnapshots[i]) {
            const mRow = await insertCardRow(m);
            upsertCardLocal(mRow);
          }
          const t = trashIds[i];
          if (t) {
            await removeTrashEntry(t);
            trashIds[i] = null;
          }
        }
      },
    };
  }

  // ── Per-card payload edit (debounced save + coalesced history) ────────
  const saveTimers = useRef<Map<string, number>>(new Map());
  // One editing burst per card: the first edit snapshots the pre-burst
  // card; the debounce flush pairs it with the post-burst card to push a
  // single history command for the whole burst.
  const burstRef = useRef(new BurstCoalescer<Card>());

  const pushBurstCommand = useCallback(
    (before: Card, after: Card) => {
      const persistable = (c: Card) => ({
        x: c.x, y: c.y, w: c.w, h: c.h, z: c.z,
        color: c.color, type: c.type, payload: c.payload,
      });
      const b = persistable(before);
      const a = persistable(after);
      if (JSON.stringify(b) === JSON.stringify(a)) return; // no-op burst
      const label =
        before.type !== after.type ? 'Convert to document'
        : before.color !== after.color ? 'Change color'
        : before.z !== after.z ? 'Reorder'
        : before.x !== after.x || before.y !== after.y ? 'Move'
        : before.w !== after.w || before.h !== after.h ? 'Resize'
        : 'Edit';
      getHistory(after.board_id)?.push({
        label,
        undo: async () => {
          const cur = cardsRef.current.find((c) => c.id === before.id);
          if (cur) upsertCardLocal({ ...cur, ...b });
          await updateCard(before.id, b as Partial<Card> as any);
        },
        do: async () => {
          const cur = cardsRef.current.find((c) => c.id === after.id);
          if (cur) upsertCardLocal({ ...cur, ...a });
          await updateCard(after.id, a as Partial<Card> as any);
        },
      });
    },
    [getHistory, upsertCardLocal],
  );

  const scheduleCardSave = useCallback(
    (id: string, patch: Partial<Card>, opts?: { delay?: number; history?: boolean }) => {
      const delay = opts?.delay ?? 500;
      const withHistory = opts?.history !== false;
      if (withHistory) {
        const before = cardsRef.current.find((c) => c.id === id);
        if (before) burstRef.current.begin(id, before);
      }
      patchCardLocal(id, patch);
      const existing = saveTimers.current.get(id);
      if (existing) window.clearTimeout(existing);
      const handle = window.setTimeout(async () => {
        saveTimers.current.delete(id);
        const after = cardsRef.current.find((c) => c.id === id);
        const before = burstRef.current.flush(id);
        try {
          await updateCard(id, patch as any);
        } catch (err) {
          console.error(err);
          return;
        }
        if (withHistory && before && after) pushBurstCommand(before, after);
      }, delay);
      saveTimers.current.set(id, handle);
    },
    [patchCardLocal, pushBurstCommand],
  );

  useEffect(() => {
    return () => {
      for (const handle of saveTimers.current.values()) window.clearTimeout(handle);
      saveTimers.current.clear();
      burstRef.current.clear();
    };
  }, []);

  // ── Group actions: delete + duplicate ─────────────────────────────────
  // All context-menu / keyboard card actions operate on the current
  // selection (or the single card they were invoked on when it isn't part
  // of the selection).

  const deleteCards = useCallback(
    async (targets: Card[]) => {
      if (targets.length === 0) return;
      // Deleting a column takes its members with it (composite snapshot).
      const columns = targets.filter((t) => t.type === 'column');
      const columnMembers = new Map<string, Card[]>();
      for (const col of columns) {
        columnMembers.set(
          col.id,
          cardsRef.current
            .filter((c) => c.parent_column === col.id)
            .sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0)),
        );
      }
      const removedIds = new Set(targets.map((t) => t.id));
      for (const members of columnMembers.values()) {
        for (const m of members) removedIds.add(m.id);
      }
      // Arrows attached to any deleted card go to the trash with it and
      // return on undo (matching the Sprint 9 rules).
      const attachedArrows = arrowsRef.current.filter(
        (a) => removedIds.has(a.from_card) || removedIds.has(a.to_card),
      );
      setArrows((prev) => prev.filter((a) => !attachedArrows.some((x) => x.id === a.id)));
      setCards((prev) => prev.filter((c) => !removedIds.has(c.id)));
      setSelectedIds(new Set());
      setCtxMenu(null);
      // Board tiles delete whole subtrees; their restore path is Trash v2
      // (Sprint 18), so they're excluded from undo — trash still has them.
      const plain = targets.filter((t) => t.type !== 'column' && !(t.type === 'board' && t.board_ref));
      const boards = targets.filter((t) => t.type === 'board' && t.board_ref);
      try {
        // Arrows first (their FKs cascade once the cards go).
        const arrowTrashIds: string[] = [];
        for (const a of attachedArrows) arrowTrashIds.push(await softDeleteArrow(a));
        // Each card / column gets its own restorable trash entry.
        const plainTrashIds: string[] = [];
        for (const t of plain) plainTrashIds.push(await softDeleteCard(t));
        const colTrashIds: string[] = [];
        for (const col of columns) {
          colTrashIds.push(await softDeleteColumn(col, columnMembers.get(col.id) ?? []));
        }
        for (const b of boards) await softDeleteCard(b);
        setStatusMsg(
          targets.length === 1
            ? 'Moved 1 card to the trash.'
            : `Moved ${targets.length} cards to the trash.`,
        );
        if (plain.length > 0 || columns.length > 0) {
          const snapshots = plain.slice();
          const tIds = plainTrashIds.slice();
          const colSnapshots = columns.slice();
          const cIds = colTrashIds.slice();
          const arrowSnapshots = attachedArrows.slice();
          const aIds = arrowTrashIds.slice();
          const label =
            targets.length > 1 ? `Delete ${targets.length} cards`
            : columns.length === 1 ? 'Delete column'
            : 'Delete';
          getHistory(currentBoardId)?.push({
            label,
            undo: async () => {
              // Restore rows with original ids AND retract the trash
              // entries so undoing a delete leaves no ghost in the trash.
              for (let i = 0; i < snapshots.length; i++) {
                const row = await insertCardRow(snapshots[i]);
                upsertCardLocal(row);
                await removeTrashEntry(tIds[i]);
              }
              for (let i = 0; i < colSnapshots.length; i++) {
                const col = colSnapshots[i];
                const colRow = await insertCardRow(col);
                upsertCardLocal(colRow);
                for (const m of columnMembers.get(col.id) ?? []) {
                  const mRow = await insertCardRow(m);
                  upsertCardLocal(mRow);
                }
                await removeTrashEntry(cIds[i]);
              }
              // Cards are back — re-attach their arrows.
              for (let i = 0; i < arrowSnapshots.length; i++) {
                const row = await insertArrowRow(arrowSnapshots[i]);
                upsertArrowLocal(row);
                await removeTrashEntry(aIds[i]);
              }
            },
            do: async () => {
              for (let i = 0; i < arrowSnapshots.length; i++) {
                removeArrowLocal(arrowSnapshots[i].id);
                aIds[i] = await softDeleteArrow(arrowSnapshots[i]);
              }
              for (let i = 0; i < snapshots.length; i++) {
                removeCardsLocal(new Set([snapshots[i].id]));
                tIds[i] = await softDeleteCard(snapshots[i]);
              }
              for (let i = 0; i < colSnapshots.length; i++) {
                const col = colSnapshots[i];
                const members = columnMembers.get(col.id) ?? [];
                removeCardsLocal(new Set([col.id, ...members.map((m) => m.id)]));
                cIds[i] = await softDeleteColumn(col, members);
              }
            },
          });
        }
      } catch (err) {
        console.error(err);
        setStatusMsg('Delete failed; refreshing.');
        if (currentBoardId) loadBoard(currentBoardId);
      }
    },
    [currentBoardId, loadBoard, getHistory, upsertCardLocal, removeCardsLocal, upsertArrowLocal, removeArrowLocal],
  );

  const duplicateCards = useCallback(
    async (targets: Card[]) => {
      if (targets.length === 0 || !currentBoardId) return;
      setCtxMenu(null);
      try {
        const dups: Card[] = [];
        const memberDups: Card[] = [];
        // Uniform +16/+16 offset preserves the group's relative layout.
        for (const card of targets) {
          const dup = await createCard({
            board_id: currentBoardId,
            type: card.type,
            x: card.x + 16, y: card.y + 16,
            w: card.w ?? undefined, h: card.h ?? undefined,
            color: card.color,
            payload: structuredClone(card.payload as any),
            board_ref: null, // duplicating a board tile copies its visual, not its target board
          });
          dups.push(dup);
          // Duplicating a column duplicates its contents too.
          if (card.type === 'column') {
            const members = cardsRef.current
              .filter((c) => c.parent_column === card.id)
              .sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0));
            for (let i = 0; i < members.length; i++) {
              const m = members[i];
              const mDup = await createCard({
                board_id: currentBoardId,
                type: m.type,
                x: m.x, y: m.y,
                w: m.w ?? undefined, h: m.h ?? undefined,
                color: m.color,
                payload: structuredClone(m.payload as any),
                board_ref: null,
                parent_column: dup.id,
                column_index: i,
              });
              memberDups.push(mDup);
            }
          }
        }
        setCards((prev) => [...prev, ...dups, ...memberDups]);
        setSelectedIds(new Set(dups.map((d) => d.id)));
        // Member copies ride along via the command's column handling.
        getHistory(currentBoardId)?.push(makeCreateCommand(dups, 'Duplicate'));
      } catch (err) {
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- makeCreateCommand closes over stable refs only
    [currentBoardId, getHistory],
  );

  // ── Column containment (Sprint 8) ─────────────────────────────────────
  // Cards with parent_column render inside their column; only free cards
  // live on the canvas plane.
  const freeCards = cards.filter((c) => !c.parent_column);
  const membersOf = useCallback(
    (colId: string): Card[] =>
      cards
        .filter((c) => c.parent_column === colId)
        .sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0)),
    [cards],
  );

  type PlacementState = {
    id: string;
    parent_column: string | null;
    column_index: number | null;
    x: number;
    y: number;
    payload: Card['payload'];
  };
  const placementOf = (c: Card): PlacementState => ({
    id: c.id,
    parent_column: c.parent_column,
    column_index: c.column_index,
    x: c.x,
    y: c.y,
    payload: c.payload,
  });

  const applyPlacements = useCallback(
    async (states: PlacementState[]) => {
      for (const s of states) {
        patchCardLocal(s.id, {
          parent_column: s.parent_column,
          column_index: s.column_index,
          x: s.x, y: s.y,
          payload: s.payload,
        });
      }
      for (const s of states) {
        await updateCard(s.id, {
          parent_column: s.parent_column,
          column_index: s.column_index,
          x: s.x, y: s.y,
          payload: s.payload,
        });
      }
    },
    [patchCardLocal],
  );

  /**
   * Move cards into a column slot or out to free canvas. Handles join,
   * within-column reorder, and detach in one recomputation; reindexes all
   * affected columns; pushes ONE history command.
   */
  const placeCards = useCallback(
    async (
      ids: string[],
      target: { colId: string; index: number } | { freeAt: { x: number; y: number } },
      label: string,
    ) => {
      const all = cardsRef.current;
      const moving = ids
        .map((id) => all.find((c) => c.id === id))
        .filter((c): c is Card => Boolean(c) && c!.type !== 'column'); // no nesting
      if (moving.length === 0) return;
      const movingSet = new Set(moving.map((m) => m.id));

      const affectedCols = new Set<string>();
      for (const m of moving) if (m.parent_column) affectedCols.add(m.parent_column);
      if ('colId' in target) affectedCols.add(target.colId);

      const affectedMembers = all.filter(
        (c) => c.parent_column && affectedCols.has(c.parent_column),
      );
      const before: PlacementState[] = [...moving, ...affectedMembers]
        .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
        .map(placementOf);

      const after = new Map<string, PlacementState>();
      // Moving cards first.
      if ('colId' in target) {
        for (const m of moving) {
          const p = m.payload as Record<string, unknown>;
          after.set(m.id, {
            ...placementOf(m),
            parent_column: target.colId,
            column_index: 0, // fixed up by the reindex below
            // Remember the free position for future drags back out.
            payload: m.parent_column ? m.payload : { ...p, lastFreeX: m.x, lastFreeY: m.y },
          });
        }
      } else {
        moving.forEach((m, i) => {
          after.set(m.id, {
            ...placementOf(m),
            parent_column: null,
            column_index: null,
            x: target.freeAt.x + i * 24,
            y: target.freeAt.y + i * 24,
          });
        });
      }
      // Recompute order per affected column.
      for (const colId of affectedCols) {
        const currentIds = all
          .filter((c) => c.parent_column === colId)
          .sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0))
          .map((c) => c.id);
        let orderedIds: string[];
        if ('colId' in target && colId === target.colId) {
          // The indicator index counts CURRENT rows (which may include the
          // moving cards during a same-column reorder) — adjust for those
          // sitting above the slot before inserting.
          const aboveSlot = currentIds.slice(0, target.index).filter((id) => movingSet.has(id)).length;
          const without = currentIds.filter((id) => !movingSet.has(id));
          orderedIds = insertAt(without, moving.map((m) => m.id), target.index - aboveSlot);
        } else {
          orderedIds = currentIds.filter((id) => !movingSet.has(id));
        }
        orderedIds.forEach((id, i) => {
          const existing = after.get(id);
          if (existing) {
            existing.column_index = i;
          } else {
            const c = all.find((x) => x.id === id)!;
            if (c.column_index !== i) after.set(id, { ...placementOf(c), column_index: i });
          }
        });
      }

      const afterStates = [...after.values()];
      // Trim before-list to cards that actually change.
      const changedIds = new Set(afterStates.map((s) => s.id));
      const beforeStates = before.filter((s) => changedIds.has(s.id));
      await applyPlacements(afterStates).catch(console.error);
      clearSelection();
      getHistory(currentBoardId)?.push({
        label,
        undo: () => applyPlacements(beforeStates),
        do: () => applyPlacements(afterStates),
      });
    },
    [applyPlacements, clearSelection, currentBoardId, getHistory],
  );

  /** Which column (and slot) the cursor is over, from live DOM geometry. */
  function computeColumnDrop(clientX: number, clientY: number): { colId: string; index: number } | null {
    const els = document.querySelectorAll<HTMLElement>('[data-col-id]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const mids: number[] = [];
      el.querySelectorAll<HTMLElement>('[data-member-id]').forEach((row) => {
        const rr = row.getBoundingClientRect();
        mids.push(rr.top + rr.height / 2);
      });
      return { colId: el.dataset.colId!, index: insertionIndexFromY(mids, clientY) };
    }
    return null;
  }

  /** Drag a column member: reorder, move between columns, or detach. */
  function startMemberDrag(member: Card, e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[contenteditable]') || target.closest('input') || target.closest('button') || target.closest('a')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const onMove = (ev: MouseEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        dragging = true;
        setMemberDragId(member.id);
      }
      if (!dragging) return;
      setColDrop(computeColumnDrop(ev.clientX, ev.clientY));
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setMemberDragId(null);
      setColDrop(null);
      if (!dragging) return;
      const drop = computeColumnDrop(ev.clientX, ev.clientY);
      if (drop) {
        placeCards([member.id], drop, drop.colId === member.parent_column ? 'Reorder column' : 'Move to column');
      } else {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        const pt = wrapperToCanvas(view, ev.clientX - r.left, ev.clientY - r.top);
        placeCards(
          [member.id],
          { freeAt: { x: Math.round(pt.x - 100), y: Math.round(pt.y - 30) } },
          'Remove from column',
        );
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Arrows (Sprint 9) ──────────────────────────────────────────────────

  /** Model-space rect for arrow attachment. */
  const rectOfCard = (c: Card): RectLike => ({
    x: c.x,
    y: c.y,
    w: c.w ?? DEFAULT_W[c.type],
    h: c.h ?? DEFAULT_H[c.type],
  });

  /** Drag from an edge dot; drop on another card creates an arrow. */
  function startArrowDraft(card: Card, e: React.MouseEvent) {
    if (e.button !== 0 || !currentBoardId) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const toCanvas = (cx: number, cy: number) => wrapperToCanvas(view, cx - r.left, cy - r.top);
    setArrowDraft({ fromId: card.id, cursor: toCanvas(e.clientX, e.clientY) });
    const onMove = (ev: MouseEvent) => {
      setArrowDraft({ fromId: card.id, cursor: toCanvas(ev.clientX, ev.clientY) });
    };
    const onUp = async (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setArrowDraft(null);
      const pt = toCanvas(ev.clientX, ev.clientY);
      // Topmost free card under the cursor (excluding the source).
      const target = cardsRef.current
        .filter((c) => !c.parent_column && c.id !== card.id)
        .sort((a, b) => b.z - a.z)
        .find((c) => {
          const cr = rectOfCard(c);
          return pt.x >= cr.x && pt.x <= cr.x + cr.w && pt.y >= cr.y && pt.y <= cr.y + cr.h;
        });
      if (!target) return; // dropped on empty canvas → cancel
      // TODO(Sprint roadmap): Milanote also creates a new note on empty-
      // canvas drop; deliberately skipped for now.
      try {
        const arrow = await createArrow({
          board_id: currentBoardId,
          from_card: card.id,
          to_card: target.id,
        });
        upsertArrowLocal(arrow);
        setSelectedArrowId(arrow.id);
        // Undo: an arrow with a label goes through the trash; a bare
        // arrow never "existed" and may be hard-removed.
        let trashId: string | null = null;
        let snapshot = arrow;
        getHistory(currentBoardId)?.push({
          label: 'Connect cards',
          undo: async () => {
            const cur = arrowsRef.current.find((a) => a.id === snapshot.id) ?? snapshot;
            snapshot = cur;
            removeArrowLocal(cur.id);
            if (cur.label.trim()) trashId = await softDeleteArrow(cur);
            else {
              trashId = null;
              await hardDeleteArrowRow(cur.id);
            }
          },
          do: async () => {
            const row = await insertArrowRow(snapshot);
            upsertArrowLocal(row);
            if (trashId) {
              await removeTrashEntry(trashId);
              trashId = null;
            }
          },
        });
      } catch (err) {
        console.error(err);
        setStatusMsg('Could not create the arrow — has migration 0012 been run?');
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Palette extraction from an image card (Sprint 10) ─────────────────
  async function extractPaletteFromImage(card: Card) {
    setCtxMenu(null);
    if (!currentBoardId) return;
    const p = card.payload as ImagePayload;
    try {
      setStatusMsg('Extracting palette…');
      const url = await signedMediaUrl(p.thumbPath ?? p.storagePath);
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0, size, size);
      bmp.close();
      const hexes = extractPalette(ctx.getImageData(0, 0, size, size).data, 5, 1);
      if (hexes.length === 0) {
        setStatusMsg('Could not extract a palette from this image.');
        return;
      }
      // Stack the swatches beside the image, top-aligned — no overlap.
      const baseX = card.x + (card.w ?? DEFAULT_W.image) + 24;
      const created: Card[] = [];
      for (let i = 0; i < hexes.length; i++) {
        const sw = await createCard({
          board_id: currentBoardId,
          type: 'swatch',
          x: baseX,
          y: card.y + i * (DEFAULT_H.swatch + 14),
          w: DEFAULT_W.swatch, h: DEFAULT_H.swatch,
          payload: { hex: hexes[i], label: '' },
        });
        created.push(sw);
        upsertCardLocal(sw);
      }
      setSelectedIds(new Set(created.map((c) => c.id)));
      getHistory(currentBoardId)?.push(makeCreateCommand(created, 'Extract palette'));
      setStatusMsg(`Extracted ${created.length} swatches.`);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not extract a palette from this image.');
    }
  }

  const deleteArrowCmd = useCallback(
    async (arrow: Arrow) => {
      setArrowMenu(null);
      setSelectedArrowId(null);
      removeArrowLocal(arrow.id);
      try {
        let trashId = await softDeleteArrow(arrow);
        getHistory(currentBoardId)?.push({
          label: 'Delete arrow',
          undo: async () => {
            const row = await insertArrowRow(arrow);
            upsertArrowLocal(row);
            await removeTrashEntry(trashId);
          },
          do: async () => {
            removeArrowLocal(arrow.id);
            trashId = await softDeleteArrow(arrow);
          },
        });
      } catch (err) {
        console.error(err);
      }
    },
    [currentBoardId, getHistory, removeArrowLocal, upsertArrowLocal],
  );

  /** Patch an arrow (label / style / direction) as an undoable command. */
  const patchArrowCmd = useCallback(
    async (arrow: Arrow, patch: Partial<Pick<Arrow, 'label' | 'style' | 'from_card' | 'to_card'>>, label: string) => {
      setArrowMenu(null);
      const before = { from_card: arrow.from_card, to_card: arrow.to_card, label: arrow.label, style: arrow.style };
      const after = { ...before, ...patch };
      upsertArrowLocal({ ...arrow, ...after });
      try {
        await updateArrow(arrow.id, after);
      } catch (err) {
        console.error(err);
        return;
      }
      getHistory(currentBoardId)?.push({
        label,
        undo: async () => {
          const cur = arrowsRef.current.find((a) => a.id === arrow.id);
          if (cur) upsertArrowLocal({ ...cur, ...before });
          await updateArrow(arrow.id, before);
        },
        do: async () => {
          const cur = arrowsRef.current.find((a) => a.id === arrow.id);
          if (cur) upsertArrowLocal({ ...cur, ...after });
          await updateArrow(arrow.id, after);
        },
      });
    },
    [currentBoardId, getHistory, upsertArrowLocal],
  );

  // ── Arrow-nudge coalescing ─────────────────────────────────────────────
  // Rapid arrow presses accumulate locally; 500ms after the last press the
  // whole run persists and becomes ONE composite history command.
  const nudgeRef = useRef<{
    timer: number | null;
    ids: string[];
    before: Map<string, { x: number; y: number }>;
  } | null>(null);

  const flushNudge = useCallback(() => {
    const n = nudgeRef.current;
    if (!n) return;
    if (n.timer) window.clearTimeout(n.timer);
    nudgeRef.current = null;
    const moves = n.ids
      .map((id) => {
        const cur = cardsRef.current.find((c) => c.id === id);
        const from = n.before.get(id);
        if (!cur || !from || (cur.x === from.x && cur.y === from.y)) return null;
        return { id, from, to: { x: cur.x, y: cur.y } };
      })
      .filter((m): m is { id: string; from: { x: number; y: number }; to: { x: number; y: number } } => m !== null);
    if (moves.length === 0) return;
    for (const m of moves) updateCard(m.id, m.to).catch(console.error);
    getHistory(currentBoardId)?.push({
      label: moves.length > 1 ? `Move ${moves.length} cards` : 'Move',
      undo: async () => {
        for (const m of moves) {
          patchCardLocal(m.id, m.from);
          await updateCard(m.id, m.from);
        }
      },
      do: async () => {
        for (const m of moves) {
          patchCardLocal(m.id, m.to);
          await updateCard(m.id, m.to);
        }
      },
    });
  }, [currentBoardId, getHistory, patchCardLocal]);

  // ── Keyboard: canvas shortcuts (see lib/notesShortcutRegistry.ts) ─────
  // All canvas shortcuts are suppressed while typing (input/textarea/
  // contentEditable — the shared isTypingContext helper), except Esc, which
  // exits the typing context. Backspace is intentionally not bound to
  // delete: it's too easy to hit while editing text.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = isTypingContext(e.target);

      // Esc — innermost-first: exit editing, then overlay, context menu,
      // trash drawer, and finally deselect.
      if (e.key === 'Escape') {
        if (typing) {
          (document.activeElement as HTMLElement | null)?.blur();
        } else if (lightboxId) {
          setLightboxId(null);
        } else if (docOverlayId) {
          setDocOverlayId(null);
        } else if (arrowLabelEditId) {
          setArrowLabelEditId(null);
        } else if (ctxMenu) {
          setCtxMenu(null);
        } else if (arrowMenu) {
          setArrowMenu(null);
        } else if (trashOpen) {
          setTrashOpen(false);
        } else if (selectedArrowId) {
          setSelectedArrowId(null);
        } else if (selectedIds.size) {
          clearSelection();
        }
        return;
      }

      if (typing) return;

      // Lightbox open: ←/→ step through the board's image cards.
      if (lightboxId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const imgs = cards.filter((c) => c.type === 'image');
        const i = imgs.findIndex((c) => c.id === lightboxId);
        if (i !== -1 && imgs.length > 1) {
          const step = e.key === 'ArrowRight' ? 1 : imgs.length - 1;
          setLightboxId(imgs[(i + step) % imgs.length].id);
        }
        return;
      }

      // Mod shortcuts: zoom, select-all, duplicate.
      if (e.ctrlKey || e.metaKey) {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setView((v) => zoomAroundCursor(v, 1.15, r.width / 2, r.height / 2));
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setView((v) => zoomAroundCursor(v, 1 / 1.15, r.width / 2, r.height / 2));
          return;
        }
        if (e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          const rects = cards.filter((c) => !c.parent_column).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
          setView(
            e.shiftKey
              ? fitView(rects, r.width, r.height)
              : viewCenteredOnContent(rects, r.width, r.height),
          );
          return;
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          setSelectedIds(new Set(cards.filter((c) => !c.parent_column).map((c) => c.id)));
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          duplicateCards(cards.filter((c) => selectedIds.has(c.id)));
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) doRedo();
          else doUndo();
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          // Windows-style redo.
          e.preventDefault();
          doRedo();
          return;
        }
        return;
      }

      // Arrow nudge: 1px canvas-space, Shift = 10px — whole selection.
      // A run of presses coalesces into one history command (flushNudge).
      if (
        selectedIds.size &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ids = [...selectedIds];
        const open = nudgeRef.current;
        // Selection changed mid-run → close the previous run first.
        if (open && (open.ids.length !== ids.length || !ids.every((id) => open.before.has(id)))) {
          flushNudge();
        }
        if (!nudgeRef.current) {
          const before = new Map<string, { x: number; y: number }>();
          for (const c of cardsRef.current) {
            if (selectedIds.has(c.id)) before.set(c.id, { x: c.x, y: c.y });
          }
          nudgeRef.current = { timer: null, ids, before };
        }
        setCards((prev) =>
          prev.map((c) => (selectedIds.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)),
        );
        const n = nudgeRef.current;
        if (n.timer) window.clearTimeout(n.timer);
        n.timer = window.setTimeout(flushNudge, 500);
        return;
      }

      // Delete sends the selected arrow, or the whole selection, to trash.
      if (e.key === 'Delete') {
        if (selectedArrowId) {
          const arrow = arrows.find((a) => a.id === selectedArrowId);
          if (arrow) {
            e.preventDefault();
            deleteArrowCmd(arrow);
          }
          return;
        }
        if (!selectedIds.size) return;
        e.preventDefault();
        deleteCards(cards.filter((c) => selectedIds.has(c.id)));
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedIds, cards, docOverlayId, ctxMenu, trashOpen, lightboxId, deleteCards, duplicateCards, clearSelection, doUndo, doRedo, flushNudge, selectedArrowId, arrows, arrowMenu, arrowLabelEditId, deleteArrowCmd]);

  // ── Floating format toolbar ───────────────────────────────────────────
  // Show when the user makes a non-collapsed selection inside a Note body
  // (any element marked `data-note-body`). Position 8px above the selection.
  useEffect(() => {
    function update() {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.rangeCount === 0) {
        setFmtToolbar(null);
        return;
      }
      const range = s.getRangeAt(0);
      const noteBody = findClosest(range.commonAncestorContainer, '[data-note-body]');
      if (!noteBody) {
        setFmtToolbar(null);
        return;
      }
      const r = range.getBoundingClientRect();
      // Clamp horizontally so the toolbar stays on screen.
      const left = Math.max(8, Math.min(window.innerWidth - 220, r.left + r.width / 2 - 110));
      const top = Math.max(8, r.top - 42);
      setFmtToolbar({ top, left });
    }
    document.addEventListener('selectionchange', update);
    document.addEventListener('mouseup', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mouseup', update);
    };
  }, []);

  function execFmt(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    // The contentEditable's onInput fires automatically and triggers a save.
    // Refresh toolbar position after the DOM mutates.
    setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.rangeCount === 0 || s.isCollapsed) {
        setFmtToolbar(null);
        return;
      }
      const r = s.getRangeAt(0).getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - 220, r.left + r.width / 2 - 110));
      const top = Math.max(8, r.top - 42);
      setFmtToolbar({ top, left });
    }, 0);
  }

  // ── Bring to front (whole selection, preserving relative z-order) ─────
  function bringToFront(card: Card) {
    setCtxMenu(null);
    const ids = selectedIds.has(card.id) ? selectedIds : new Set([card.id]);
    const maxZ = cards.reduce((acc, c) => Math.max(acc, c.z), 0);
    const group = cards.filter((c) => ids.has(c.id)).sort((a, b) => a.z - b.z);
    if (group.length === 1 && group[0].z >= maxZ) return; // already on top
    const changes = group.map((c, i) => ({ id: c.id, from: c.z, to: maxZ + 1 + i }));
    for (const ch of changes) {
      patchCardLocal(ch.id, { z: ch.to });
      updateCard(ch.id, { z: ch.to }).catch(console.error);
    }
    getHistory(currentBoardId)?.push({
      label: changes.length > 1 ? `Bring ${changes.length} cards to front` : 'Bring to front',
      undo: async () => {
        for (const ch of changes) {
          patchCardLocal(ch.id, { z: ch.from });
          await updateCard(ch.id, { z: ch.from });
        }
      },
      do: async () => {
        for (const ch of changes) {
          patchCardLocal(ch.id, { z: ch.to });
          await updateCard(ch.id, { z: ch.to });
        }
      },
    });
  }

  // ── Resize handle (aspect-locked for image cards) ─────────────────────
  function startResize(card: Card, e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = card.w ?? 240;
    const startH = card.h ?? 140;
    const k = view.k;
    const img = card.type === 'image' ? (card.payload as ImagePayload) : null;
    const aspect = img && img.naturalH > 0 ? img.naturalW / img.naturalH : null;
    // Columns and comments are width-only; their height follows content.
    const widthOnly = card.type === 'column' || card.type === 'comment';
    const sizePatch = (dx: number, dy: number): Partial<Card> => {
      if (aspect !== null) return aspectResize(startW, dx, aspect);
      if (widthOnly) return { w: Math.max(200, startW + dx) };
      return { w: Math.max(140, startW + dx), h: Math.max(60, startH + dy) };
    };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      patchCardLocal(card.id, sizePatch(dx, dy));
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      const patch = sizePatch(dx, dy);
      updateCard(card.id, patch as any).catch(console.error);
      const revert: Partial<Card> = widthOnly ? { w: startW } : { w: startW, h: startH };
      if (patch.w !== startW || (!widthOnly && patch.h !== startH)) {
        getHistory(currentBoardId)?.push({
          label: 'Resize',
          undo: async () => {
            patchCardLocal(card.id, revert);
            await updateCard(card.id, revert as any);
          },
          do: async () => {
            patchCardLocal(card.id, patch);
            await updateCard(card.id, patch as any);
          },
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Note → Document conversion ────────────────────────────────────────
  function convertNoteToDocument(card: Card) {
    const body = (card.payload as any).body || '';
    const title = extractTitleFromHtml(body) || 'Untitled document';
    const newPayload = { title, body, mode: 'preview' as const };
    const w = Math.max(card.w ?? 240, 240);
    const h = Math.max(card.h ?? 200, 200);
    scheduleCardSave(card.id, {
      type: 'document',
      payload: newPayload,
      w, h,
    });
  }
  function dismissConvertPrompt(card: Card) {
    const next = { ...(card.payload as any), dismissedConvert: true };
    scheduleCardSave(card.id, { payload: next });
  }

  // ── Context menu ──────────────────────────────────────────────────────
  function openContextMenu(card: Card, clientX: number, clientY: number) {
    // Right-clicking inside the selection keeps it (menu applies to the
    // group); right-clicking an unselected card selects it alone.
    if (!selectedIds.has(card.id)) selectOnly(card.id);
    setCtxMenu({ x: clientX, y: clientY, cardId: card.id });
  }
  useEffect(() => {
    if (!ctxMenu && !arrowMenu) return;
    function close(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('.nt-ctx')) return;
      setCtxMenu(null);
      setArrowMenu(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu, arrowMenu]);

  /** The cards an action invoked on `card` should apply to. */
  function actionTargets(card: Card): Card[] {
    return selectedIds.has(card.id)
      ? cards.filter((c) => selectedIds.has(c.id))
      : [card];
  }

  function setColour(card: Card, color: SwatchKey) {
    setCtxMenu(null);
    const targets = actionTargets(card);
    const before = targets.map((t) => ({ id: t.id, color: t.color }));
    for (const t of targets) {
      patchCardLocal(t.id, { color });
      updateCard(t.id, { color }).catch(console.error);
    }
    getHistory(currentBoardId)?.push({
      label: targets.length > 1 ? `Color ${targets.length} cards` : 'Change color',
      undo: async () => {
        for (const b of before) {
          patchCardLocal(b.id, { color: b.color });
          await updateCard(b.id, { color: b.color });
        }
      },
      do: async () => {
        for (const t of targets) {
          patchCardLocal(t.id, { color });
          await updateCard(t.id, { color });
        }
      },
    });
  }

  // ── To-do line delete (soft-delete + undoable command) ────────────────
  async function deleteTodoLine(card: Card, item: TodoItem) {
    const itemsBefore: TodoItem[] = (card.payload as any).items ?? [];
    const idx = itemsBefore.findIndex((it) => it.id === item.id);
    let res: { card: Card; trashId: string };
    try {
      res = await softDeleteTodoItem(card, item);
    } catch (err) {
      console.error(err);
      return;
    }
    patchCardLocal(card.id, { payload: res.card.payload });
    let trashId = res.trashId;
    getHistory(currentBoardId)?.push({
      label: 'Delete to-do line',
      undo: async () => {
        const cur = cardsRef.current.find((c) => c.id === card.id);
        if (!cur) return;
        const items = [...(((cur.payload as any).items as TodoItem[]) ?? [])];
        items.splice(idx < 0 || idx > items.length ? items.length : idx, 0, item);
        const payload = { ...(cur.payload as any), items };
        patchCardLocal(card.id, { payload });
        await updateCard(card.id, { payload });
        await removeTrashEntry(trashId);
      },
      do: async () => {
        const cur = cardsRef.current.find((c) => c.id === card.id);
        if (!cur) return;
        const again = await softDeleteTodoItem(cur, item);
        patchCardLocal(card.id, { payload: again.card.payload });
        trashId = again.trashId;
      },
    });
  }

  // ── Trash ─────────────────────────────────────────────────────────────
  async function openTrash() {
    setTrashOpen(true);
    try {
      setTrash(await listTrash());
    } catch (err) {
      console.error(err);
    }
  }
  async function doRestore(entry: TrashEntry) {
    try {
      await restoreTrash(entry);
      setTrash((prev) => prev.filter((t) => t.id !== entry.id));
      if (currentBoardId) loadBoard(currentBoardId);
    } catch (err) {
      console.error(err);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const ctxCard = ctxMenu ? cards.find((c) => c.id === ctxMenu.cardId) : null;
  const docCard = docOverlayId ? cards.find((c) => c.id === docOverlayId) : null;
  const hist = currentBoardId ? getHistory(currentBoardId) : null;
  const undoLabel = hist?.peekUndoLabel();
  const redoLabel = hist?.peekRedoLabel();

  return (
    <div className={`notes-page theme-${theme}`}>
      <header className="nt-ribbon">
        <div className="left">
          <Link className="back" to="/">← hallway</Link>
          <div className="place">Notes</div>
          <nav className="breadcrumbs" aria-label="Boards">
            {ancestry.map((b, i) => {
              const last = i === ancestry.length - 1;
              return (
                <span key={b.id}>
                  <button
                    className={`crumb${last ? ' current' : ''}`}
                    onClick={() => !last && setCurrentBoardId(b.id)}
                    onDoubleClick={async () => {
                      const name = window.prompt('Rename board', b.name);
                      if (name && name.trim() && name.trim() !== b.name) {
                        const prevName = b.name;
                        const nextName = name.trim();
                        await renameBoard(b.id, nextName);
                        if (currentBoardId) loadBoard(currentBoardId);
                        getHistory(currentBoardId)?.push({
                          label: 'Rename board',
                          undo: async () => {
                            await renameBoard(b.id, prevName);
                            if (currentBoardId) loadBoard(currentBoardId);
                          },
                          do: async () => {
                            await renameBoard(b.id, nextName);
                            if (currentBoardId) loadBoard(currentBoardId);
                          },
                        });
                      }
                    }}
                  >
                    {b.name}
                  </button>
                  {!last && <span className="sep">›</span>}
                </span>
              );
            })}
          </nav>
        </div>
        <div className="right">
          <button
            className="btn-quiet"
            disabled={!hist?.canUndo()}
            onClick={doUndo}
            title={undoLabel ? `Undo ${undoLabel.toLowerCase()}` : 'Undo'}
          >
            ↺
          </button>
          <button
            className="btn-quiet"
            disabled={!hist?.canRedo()}
            onClick={doRedo}
            title={redoLabel ? `Redo ${redoLabel.toLowerCase()}` : 'Redo'}
          >
            ↻
          </button>
          <button
            className="btn-quiet"
            onClick={() => setView((v) => zoomAroundCursor(v, 0.85, 0, 0))}
            title="Zoom out"
          >
            −
          </button>
          <span className="zoom-readout">{Math.round(view.k * 100)}%</span>
          <button
            className="btn-quiet"
            onClick={() => setView((v) => zoomAroundCursor(v, 1.15, 0, 0))}
            title="Zoom in"
          >
            +
          </button>
          <button className="btn-quiet" onClick={doFit} title="Fit to view">fit</button>
          <button
            className="btn-quiet"
            onClick={() => setTheme((t) => (t === 'parchment' ? 'milanote' : 'parchment'))}
            title={theme === 'parchment' ? 'Switch to the Milanote skin' : 'Switch to parchment'}
          >
            {theme === 'parchment' ? 'skin: parchment' : 'skin: milanote'}
          </button>
          <button className="btn-quiet" onClick={openTrash} title="Trash">Trash</button>
        </div>
      </header>

      <main className="nt-main">
        <aside className="nt-tools" aria-label="Card types">
          {TOOLBAR_TYPES.map((t) => (
            <button
              key={t.type}
              className="tool"
              draggable
              onDragStart={(e) => onToolbarDragStart(t.type, e)}
              onDragEnd={onToolbarDragEnd}
              onClick={() => {
                if (t.type === 'image' || t.type === 'file') {
                  pendingImagePointRef.current = null; // → viewport center
                  (t.type === 'image' ? fileInputRef : anyFileInputRef).current?.click();
                }
              }}
              title={t.hint}
            >
              <span className="ic">{toolIcon(t.type)}</span>
              <span className="lbl">{t.label}</span>
            </button>
          ))}
        </aside>

        <section
          className={`nt-canvas-wrap${spaceHeld ? ' space-pan' : ''}`}
          ref={wrapRef}
          onMouseDown={onCanvasMouseDown}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
        >
          <div
            ref={canvasRef}
            className="nt-canvas"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
          >
            {freeCards.map((card) => (
              <CardView
                key={card.id}
                card={card}
                selected={selectedIds.has(card.id)}
                members={card.type === 'column' ? membersOf(card.id) : undefined}
                dropIndex={colDrop?.colId === card.id ? colDrop.index : null}
                dropActive={colDrop?.colId === card.id}
                onArrowStart={(e) => startArrowDraft(card, e)}
                renderMember={(m) => (
                  <ColumnMemberRow
                    key={m.id}
                    card={m}
                    selected={selectedIds.has(m.id)}
                    dragging={memberDragId === m.id}
                    onMouseDown={(e) => startMemberDrag(m, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openContextMenu(m, e.clientX, e.clientY);
                    }}
                    onDoubleClick={() => {
                      if (m.type === 'board' && m.board_ref) setCurrentBoardId(m.board_ref);
                      else if (m.type === 'document') setDocOverlayId(m.id);
                      else if (m.type === 'image') setLightboxId(m.id);
                    }}
                  >
                    <CardBody
                      card={m}
                      onPatch={(patch) => scheduleCardSave(m.id, patch)}
                      onConvertNote={() => convertNoteToDocument(m)}
                      onDismissConvert={() => dismissConvertPrompt(m)}
                      onDeleteTodoItem={(item) => deleteTodoLine(m, item)}
                      onOpenLink={() => {
                        const url = (m.payload as any).url;
                        if (url) window.open(url, '_blank', 'noopener');
                      }}
                    />
                  </ColumnMemberRow>
                )}
                onMouseDown={(e) => startCardDrag(card, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(card, e.clientX, e.clientY);
                }}
                onDoubleClick={() => {
                  if (card.type === 'board' && card.board_ref) {
                    setCurrentBoardId(card.board_ref);
                  } else if (card.type === 'document') {
                    setDocOverlayId(card.id);
                  } else if (card.type === 'image') {
                    setLightboxId(card.id);
                  } else if (
                    card.type === 'file' &&
                    fileGroup((card.payload as FilePayload).mimeType, (card.payload as FilePayload).filename) === 'video'
                  ) {
                    setLightboxId(card.id);
                  } else if (
                    card.type === 'link' &&
                    embedUrlFor((card.payload as LinkPayload).url || '')
                  ) {
                    setLightboxId(card.id);
                  }
                }}
                onPatch={(patch) => scheduleCardSave(card.id, patch)}
                onResizeStart={(e) => startResize(card, e)}
                onConvertNote={() => convertNoteToDocument(card)}
                onDismissConvert={() => dismissConvertPrompt(card)}
                onDeleteTodoItem={(item) => deleteTodoLine(card, item)}
                onOpenLink={() => {
                  const url = (card.payload as any).url;
                  if (url) window.open(url, '_blank', 'noopener');
                }}
              />
            ))}
            {/* Arrow overlay: inside the transformed canvas so it pans/zooms
                for free. Only free-card endpoints render. */}
            <svg className="nt-arrows" width={12000} height={8000}>
              <defs>
                <marker
                  id="nt-arrowhead"
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="context-stroke" stroke="none" />
                </marker>
              </defs>
              {arrows.map((a) => {
                const from = freeCards.find((c) => c.id === a.from_card);
                const to = freeCards.find((c) => c.id === a.to_card);
                if (!from || !to) return null;
                const pair = bestEdgePair(rectOfCard(from), rectOfCard(to));
                const d = arrowPath(pair.from, pair.to);
                const isSel = selectedArrowId === a.id;
                return (
                  <g key={a.id} className={`nt-arrow${isSel ? ' selected' : ''}`}>
                    <path
                      className="nt-arrow-hit"
                      d={d}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArrowId(a.id);
                        clearSelection();
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setArrowLabelEditId(a.id);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedArrowId(a.id);
                        setArrowMenu({ x: e.clientX, y: e.clientY, arrowId: a.id });
                      }}
                    />
                    <path
                      className="nt-arrow-line"
                      d={d}
                      markerEnd="url(#nt-arrowhead)"
                      strokeDasharray={a.style?.dashed ? '7 5' : undefined}
                    />
                  </g>
                );
              })}
              {arrowDraft && (() => {
                const from = freeCards.find((c) => c.id === arrowDraft.fromId);
                if (!from) return null;
                const fr = rectOfCard(from);
                const cursorRect: RectLike = { x: arrowDraft.cursor.x, y: arrowDraft.cursor.y, w: 1, h: 1 };
                const pair = bestEdgePair(fr, cursorRect);
                return (
                  <path
                    className="nt-arrow-line draft"
                    d={arrowPath(pair.from, pair.to)}
                    markerEnd="url(#nt-arrowhead)"
                  />
                );
              })()}
            </svg>
            {/* Arrow labels (and the inline label editor) in canvas space */}
            {arrows.map((a) => {
              const from = freeCards.find((c) => c.id === a.from_card);
              const to = freeCards.find((c) => c.id === a.to_card);
              if (!from || !to) return null;
              if (!a.label && arrowLabelEditId !== a.id) return null;
              const pair = bestEdgePair(rectOfCard(from), rectOfCard(to));
              const mid = bezierPoint(pair.from, pair.to, 0.5);
              if (arrowLabelEditId === a.id) {
                return (
                  <input
                    key={a.id}
                    className="nt-arrow-label editing"
                    style={{ left: mid.x, top: mid.y } as CSSProperties}
                    autoFocus
                    defaultValue={a.label}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={(e) => {
                      setArrowLabelEditId(null);
                      const next = e.target.value.trim();
                      if (next !== a.label) patchArrowCmd(a, { label: next }, 'Label arrow');
                    }}
                  />
                );
              }
              return (
                <div
                  key={a.id}
                  className="nt-arrow-label"
                  style={{ left: mid.x, top: mid.y } as CSSProperties}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setArrowLabelEditId(a.id);
                  }}
                >
                  {a.label}
                </div>
              );
            })}
            {uploads.map((u) => (
              <div
                key={u.id}
                className="nt-upload-ph"
                style={{ left: u.x, top: u.y, width: u.w, height: u.h } as CSSProperties}
              />
            ))}
            {cards.length === 0 && (
              <div className="nt-empty">
                <p>This board is empty.</p>
                <p className="hint">Drag a card type from the left toolbar onto the canvas to begin.</p>
              </div>
            )}
          </div>
          {marquee && (
            <div
              className="nt-marquee"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h } as CSSProperties}
            />
          )}
        </section>
      </main>

      <footer className="nt-status">
        <div>{statusMsg}</div>
        <div>
          {ancestry[ancestry.length - 1]?.name} · {cards.length} item{cards.length === 1 ? '' : 's'}
        </div>
      </footer>

      {ctxMenu && ctxCard && (
        <div
          className="nt-ctx"
          style={{ left: ctxMenu.x, top: ctxMenu.y } as CSSProperties}
        >
          <div className="label">Color</div>
          <div className="swatches">
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                className="sw"
                style={{ background: `var(--c-${sw})` } as CSSProperties}
                onClick={() => setColour(ctxCard, sw)}
                title={sw}
              />
            ))}
          </div>
          <div className="sep" />
          <button className="item" onClick={() => duplicateCards(actionTargets(ctxCard))}>
            Duplicate{selectedIds.size > 1 && selectedIds.has(ctxCard.id) ? ` ${selectedIds.size} cards` : ''}
          </button>
          <button className="item" onClick={() => bringToFront(ctxCard)}>
            Bring to front
          </button>
          {ctxCard.type === 'board' && ctxCard.board_ref && (
            <button
              className="item"
              onClick={() => {
                setCurrentBoardId(ctxCard.board_ref!);
                setCtxMenu(null);
              }}
            >
              Open board
            </button>
          )}
          {ctxCard.type === 'document' && (
            <button
              className="item"
              onClick={() => {
                setDocOverlayId(ctxCard.id);
                setCtxMenu(null);
              }}
            >
              Open document
            </button>
          )}
          {ctxCard.type === 'note' && (
            <button
              className="item"
              onClick={() => {
                convertNoteToDocument(ctxCard);
                setCtxMenu(null);
              }}
            >
              Convert to Document
            </button>
          )}
          {ctxCard.type === 'link' && (
            <button
              className="item"
              onClick={() => {
                setCtxMenu(null);
                refreshLinkMeta(ctxCard);
              }}
            >
              Refresh metadata
            </button>
          )}
          {ctxCard.type === 'image' && (
            <button className="item" onClick={() => extractPaletteFromImage(ctxCard)}>
              Extract palette
            </button>
          )}
          <div className="sep" />
          <button className="item delete" onClick={() => deleteCards(actionTargets(ctxCard))}>
            Delete{selectedIds.size > 1 && selectedIds.has(ctxCard.id) ? ` ${selectedIds.size} cards` : ''}
          </button>
        </div>
      )}

      {arrowMenu && (() => {
        const arrow = arrows.find((a) => a.id === arrowMenu.arrowId);
        if (!arrow) return null;
        return (
          <div className="nt-ctx" style={{ left: arrowMenu.x, top: arrowMenu.y } as CSSProperties}>
            <button
              className="item"
              onClick={() => patchArrowCmd(arrow, { from_card: arrow.to_card, to_card: arrow.from_card }, 'Flip arrow')}
            >
              Toggle direction
            </button>
            <button
              className="item"
              onClick={() => patchArrowCmd(arrow, { style: { ...arrow.style, dashed: !arrow.style?.dashed } }, 'Style arrow')}
            >
              {arrow.style?.dashed ? 'Solid line' : 'Dashed line'}
            </button>
            <button
              className="item"
              onClick={() => {
                setArrowMenu(null);
                setArrowLabelEditId(arrow.id);
              }}
            >
              {arrow.label ? 'Edit label' : 'Add label'}
            </button>
            <div className="sep" />
            <button className="item delete" onClick={() => deleteArrowCmd(arrow)}>
              Delete arrow
            </button>
          </div>
        );
      })()}

      {fmtToolbar && (
        <div
          className="nt-fmt-toolbar"
          style={{ top: fmtToolbar.top, left: fmtToolbar.left } as CSSProperties}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="b" onClick={() => execFmt('bold')} title="Bold">B</button>
          <button className="i" onClick={() => execFmt('italic')} title="Italic"><em>I</em></button>
          <button className="u" onClick={() => execFmt('underline')} title="Underline">U</button>
          <span className="sep" />
          <button onClick={() => execFmt('formatBlock', 'h1')} title="Heading">H1</button>
          <button onClick={() => execFmt('formatBlock', 'h2')} title="Subheading">H2</button>
          <span className="sep" />
          <button onClick={() => execFmt('insertUnorderedList')} title="Bullet list">•</button>
          <button onClick={() => execFmt('insertOrderedList')} title="Numbered list">1.</button>
          <button onClick={() => execFmt('formatBlock', 'blockquote')} title="Quote">❝</button>
        </div>
      )}

      {trashOpen && (
        <TrashDrawer
          entries={trash}
          onClose={() => setTrashOpen(false)}
          onRestore={doRestore}
        />
      )}

      {docCard && (
        <DocumentOverlay
          card={docCard}
          onClose={() => setDocOverlayId(null)}
          onPatch={(patch) => scheduleCardSave(docCard.id, patch)}
        />
      )}

      {lightboxId && (() => {
        const lbCard = cards.find((c) => c.id === lightboxId);
        if (!lbCard) return null;
        if (lbCard.type === 'file' || lbCard.type === 'link') {
          // Video / embed lightbox: single item, no stepping.
          return (
            <MediaLightbox
              card={lbCard}
              index={0}
              count={1}
              onClose={() => setLightboxId(null)}
              onNavigate={() => {}}
            />
          );
        }
        const imgs = cards.filter((c) => c.type === 'image');
        const idx = imgs.findIndex((c) => c.id === lightboxId);
        if (idx === -1) return null;
        return (
          <MediaLightbox
            card={imgs[idx]}
            index={idx}
            count={imgs.length}
            onClose={() => setLightboxId(null)}
            onNavigate={(dir) => setLightboxId(imgs[(idx + dir + imgs.length) % imgs.length].id)}
          />
        );
      })()}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length === 0) return;
          const at = pendingImagePointRef.current ?? centerCanvasPoint();
          pendingImagePointRef.current = null;
          createMediaCards(files, at);
        }}
      />
      <input
        ref={anyFileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length === 0) return;
          const at = pendingImagePointRef.current ?? centerCanvasPoint();
          pendingImagePointRef.current = null;
          createMediaCards(files, at);
        }}
      />
    </div>
  );
}

// ── Card renderer ───────────────────────────────────────────────────────

function CardView({
  card,
  selected,
  members,
  dropIndex,
  dropActive,
  renderMember,
  onArrowStart,
  onMouseDown,
  onContextMenu,
  onDoubleClick,
  onPatch,
  onResizeStart,
  onConvertNote,
  onDismissConvert,
  onDeleteTodoItem,
  onOpenLink,
}: {
  card: Card;
  selected: boolean;
  members?: Card[];
  dropIndex?: number | null;
  dropActive?: boolean;
  renderMember?: (m: Card) => JSX.Element;
  onArrowStart?: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onPatch: (patch: Partial<Card>) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onConvertNote: () => void;
  onDismissConvert: () => void;
  onDeleteTodoItem: (item: TodoItem) => void;
  onOpenLink: () => void;
}) {
  const chromeless = card.type === 'heading' || card.type === 'board';
  const baseStyle: CSSProperties = {
    left: card.x,
    top: card.y,
    width: card.w ?? undefined,
    // Heading/board auto-size; columns auto-height from their members.
    height: chromeless || card.type === 'column' ? undefined : card.h ?? undefined,
    background: chromeless || card.type === 'column' ? undefined : `var(--c-${card.color})`,
    zIndex: card.z || undefined,
  };

  // Heading and Board cards don't get resize handles — heading auto-sizes
  // to its text, Board has a fixed-shape tile, Swatch is a fixed chip.
  // Columns and comments resize width-only (handled in startResize).
  const showResize = card.type !== 'heading' && card.type !== 'board' && card.type !== 'swatch';
  const resolved = card.type === 'comment' && Boolean((card.payload as CommentPayload).resolved);

  return (
    <div
      className={`nt-card type-${card.type}${selected ? ' selected' : ''}${dropActive ? ' col-drop-active' : ''}${resolved ? ' resolved' : ''}`}
      style={baseStyle}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <div className="nt-drag-handle" />
      <div className="typetag">{card.type}</div>
      {card.type === 'column' ? (
        <ColumnBody
          card={card}
          onPatch={onPatch}
          members={members ?? []}
          dropIndex={dropIndex ?? null}
          renderMember={renderMember ?? (() => <></>)}
        />
      ) : (
        <CardBody
          card={card}
          onPatch={onPatch}
          onConvertNote={onConvertNote}
          onDismissConvert={onDismissConvert}
          onDeleteTodoItem={onDeleteTodoItem}
          onOpenLink={onOpenLink}
        />
      )}
      {showResize && (
        <div
          className="nt-resize-se"
          onMouseDown={onResizeStart}
          title="Drag to resize"
        />
      )}
      {onArrowStart &&
        (['n', 's', 'e', 'w'] as const).map((side) => (
          <div
            key={side}
            className={`nt-edge-dot dot-${side}`}
            onMouseDown={onArrowStart}
            title="Drag to another card to connect"
          />
        ))}
    </div>
  );
}

/** The type-specific interior of a card — shared by canvas cards and
    column members. */
function CardBody({
  card,
  onPatch,
  onConvertNote,
  onDismissConvert,
  onDeleteTodoItem,
  onOpenLink,
}: {
  card: Card;
  onPatch: (patch: Partial<Card>) => void;
  onConvertNote: () => void;
  onDismissConvert: () => void;
  onDeleteTodoItem: (item: TodoItem) => void;
  onOpenLink: () => void;
}) {
  return (
    <>
      {card.type === 'note' && (
        <NoteBody card={card} onPatch={onPatch} onConvert={onConvertNote} onDismissConvert={onDismissConvert} />
      )}
      {card.type === 'todo' && (
        <TodoBody card={card} onPatch={onPatch} onDeleteItem={onDeleteTodoItem} />
      )}
      {card.type === 'heading' && <HeadingBody card={card} onPatch={onPatch} />}
      {card.type === 'link' && (
        <LinkBody card={card} onPatch={onPatch} onOpen={onOpenLink} />
      )}
      {card.type === 'document' && <DocumentTile card={card} onPatch={onPatch} />}
      {card.type === 'board' && <BoardTile card={card} />}
      {card.type === 'image' && <ImageBody card={card} onPatch={onPatch} />}
      {card.type === 'file' && <FileBody card={card} />}
      {card.type === 'swatch' && <SwatchBody card={card} onPatch={onPatch} />}
      {card.type === 'comment' && <CommentBody card={card} onPatch={onPatch} />}
    </>
  );
}

// ── Swatch card body ────────────────────────────────────────────────────

function SwatchBody({ card, onPatch }: { card: Card; onPatch: (p: Partial<Card>) => void }) {
  const payload = card.payload as SwatchCardPayload;
  const hex = normalizeHex(payload.hex) ?? '#cccccc';
  const [copied, setCopied] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (labelRef.current && document.activeElement !== labelRef.current) {
      labelRef.current.textContent = payload.label || '';
    }
  }, [payload.label]);
  return (
    <div className="swatch-body">
      <label className="swatch-block" style={{ background: hex } as CSSProperties} title="Click to pick a color">
        <input
          type="color"
          value={hex}
          onChange={(e) => onPatch({ payload: { ...payload, hex: e.target.value } })}
        />
        <button
          className="swatch-copy"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard?.writeText(hex).catch(() => {});
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          title="Copy hex"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </label>
      <input
        className="swatch-hex"
        key={hex}
        defaultValue={hex}
        spellCheck={false}
        onBlur={(e) => {
          const n = normalizeHex(e.target.value);
          if (n && n !== hex) onPatch({ payload: { ...payload, hex: n } });
          else e.target.value = hex;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <div
        ref={labelRef}
        className="swatch-label"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="name"
        onInput={(e) =>
          onPatch({ payload: { ...payload, label: (e.target as HTMLDivElement).textContent || '' } })
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          }
        }}
      />
    </div>
  );
}

// ── Comment card body (single-user annotation sticky) ──────────────────

function CommentBody({ card, onPatch }: { card: Card; onPatch: (p: Partial<Card>) => void }) {
  const payload = card.payload as CommentPayload;
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current && document.activeElement !== bodyRef.current) {
      bodyRef.current.textContent = payload.body || '';
    }
  }, [payload.body]);
  const when = new Date(card.created_at);
  return (
    <>
      <div className="comment-meta">
        <span className="comment-time">
          {when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <button
          className="comment-resolve"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ payload: { ...payload, resolved: !payload.resolved } });
          }}
        >
          {payload.resolved ? 'reopen' : 'resolve'}
        </button>
      </div>
      <div
        ref={bodyRef}
        className="comment-text"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Annotation…"
        onInput={(e) =>
          onPatch({ payload: { ...payload, body: (e.target as HTMLDivElement).textContent || '' } })
        }
      />
    </>
  );
}

// ── Column container body + member rows ─────────────────────────────────

function ColumnBody({
  card,
  onPatch,
  members,
  dropIndex,
  renderMember,
}: {
  card: Card;
  onPatch: (p: Partial<Card>) => void;
  members: Card[];
  dropIndex: number | null;
  renderMember: (m: Card) => JSX.Element;
}) {
  const payload = card.payload as ColumnPayload;
  const collapsed = Boolean(payload.collapsed);
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.textContent = payload.title || '';
    }
  }, [payload.title]);
  return (
    <div className="col-container" data-col-id={card.id}>
      <header className="col-head">
        <button
          className="col-caret"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ payload: { ...payload, collapsed: !collapsed } });
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div
          ref={titleRef}
          className="col-title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Column"
          onInput={(e) =>
            onPatch({ payload: { ...payload, title: (e.target as HTMLDivElement).textContent || '' } })
          }
        />
        <span className="col-count">{members.length}</span>
      </header>
      {collapsed ? (
        <div className="col-collapsed-note">
          {members.length} card{members.length === 1 ? '' : 's'}
        </div>
      ) : (
        <div className="col-members">
          {members.map((m, i) => (
            <div key={m.id} className="col-slot">
              {dropIndex === i && <div className="col-indicator" />}
              {renderMember(m)}
            </div>
          ))}
          {dropIndex === members.length && <div className="col-indicator" />}
          {members.length === 0 && dropIndex === null && (
            <div className="col-empty">drag cards here</div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnMemberRow({
  card,
  selected,
  dragging,
  onMouseDown,
  onContextMenu,
  onDoubleClick,
  children,
}: {
  card: Card;
  selected: boolean;
  dragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  children: React.ReactNode;
}) {
  const chromeless = card.type === 'heading' || card.type === 'board';
  return (
    <div
      className={`col-member type-${card.type}${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
      data-member-id={card.id}
      style={chromeless ? undefined : ({ background: `var(--c-${card.color})` } as CSSProperties)}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

function NoteBody({
  card,
  onPatch,
  onConvert,
  onDismissConvert,
}: {
  card: Card;
  onPatch: (p: Partial<Card>) => void;
  onConvert: () => void;
  onDismissConvert: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string>('');
  const payload = card.payload as { body?: string; dismissedConvert?: boolean };
  useEffect(() => {
    if (!ref.current) return;
    if (lastIdRef.current === card.id && document.activeElement === ref.current) return;
    ref.current.innerHTML = payload.body || '';
    lastIdRef.current = card.id;
  }, [card.id, payload.body]);

  // Markdown shortcuts: when the user types one of the supported sentinels
  // followed by space at the start of a block, transform the block. The
  // sentinel and the trailing space are consumed (no literal characters
  // left behind in the document).
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== ' ') return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    if (!ref.current) return;
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.startContainer)) return;

    // Read the text from the start of the current block to the caret. If
    // it matches a sentinel exactly, we trigger the transform.
    const block = findBlockAncestor(range.startContainer, ref.current);
    if (!block) return;
    const blockRange = document.createRange();
    blockRange.setStart(block, 0);
    blockRange.setEnd(range.startContainer, range.startOffset);
    const prefix = blockRange.toString();
    const action = detectMarkdownSentinel(prefix);
    if (!action) return;

    e.preventDefault();
    // Remove the sentinel characters from the block (they're at its start).
    blockRange.deleteContents();
    if (action.kind === 'h1' || action.kind === 'h2' || action.kind === 'h3' || action.kind === 'blockquote') {
      document.execCommand('formatBlock', false, action.kind);
    } else if (action.kind === 'ul') {
      document.execCommand('insertUnorderedList');
    } else if (action.kind === 'ol') {
      document.execCommand('insertOrderedList');
    }
    onPatch({ payload: { ...payload, body: ref.current.innerHTML } });
  }

  return (
    <>
      <div
        ref={ref}
        className="body"
        contentEditable
        suppressContentEditableWarning
        data-note-body=""
        data-placeholder="Note"
        onInput={(e) =>
          onPatch({
            payload: { ...payload, body: (e.target as HTMLDivElement).innerHTML },
          })
        }
        onKeyDown={onKeyDown}
      />
      {shouldOfferConvert(payload.body || '', payload.dismissedConvert) && (
        <div className="nt-convert-prompt" contentEditable={false}>
          <span>This note has grown — convert it into a Document?</span>
          <div className="actions">
            <button onClick={onConvert}>Convert</button>
            <button className="ghost" onClick={onDismissConvert}>Keep as note</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Walk up from `node` to find the closest block-level child of `root`. */
function findBlockAncestor(node: Node | null, root: Element): Element | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as Element).parentElement === root) {
      return n as Element;
    }
    n = n.parentNode;
  }
  // If the caret is in a text node directly inside `root` (no wrapping
  // <p>), return the root itself.
  return root;
}

function HeadingBody({ card, onPatch }: { card: Card; onPatch: (p: Partial<Card>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.textContent = (card.payload as any).body || '';
    }
  }, [card.payload]);
  return (
    <div
      ref={ref}
      className="body"
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Heading"
      onInput={(e) => onPatch({ payload: { body: (e.target as HTMLDivElement).textContent || '' } })}
    />
  );
}

function TodoBody({
  card,
  onPatch,
  onDeleteItem,
}: {
  card: Card;
  onPatch: (p: Partial<Card>) => void;
  onDeleteItem: (item: TodoItem) => void;
}) {
  const payload = card.payload as { title: string; items: TodoItem[] };
  const items = payload.items ?? [];

  function patchItems(next: TodoItem[]) {
    onPatch({ payload: { ...payload, items: next } });
  }
  function patchTitle(title: string) {
    onPatch({ payload: { ...payload, title } });
  }
  function toggle(idx: number) {
    patchItems(items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)));
  }
  function setText(idx: number, text: string) {
    patchItems(items.map((it, i) => (i === idx ? { ...it, text } : it)));
  }
  function addLine() {
    const id = cryptoRandomId();
    patchItems([...items, { id, text: '', done: false }]);
    focusItemAfterRender(id);
  }
  function insertAfter(idx: number) {
    const id = cryptoRandomId();
    const next = items.slice();
    next.splice(idx + 1, 0, { id, text: '', done: false });
    patchItems(next);
    focusItemAfterRender(id);
  }
  function focusItemAfterRender(id: string) {
    // Wait one frame for React to render the new <li>, then move the
    // caret into its text div.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-todo-item-id="${id}"]`,
      );
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }

  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.textContent = payload.title || '';
    }
  }, [payload.title]);

  return (
    <>
      <div
        ref={titleRef}
        className="todo-title"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="To-do"
        onInput={(e) => patchTitle((e.target as HTMLDivElement).textContent || '')}
      />
      <ol>
        {items.map((it, i) => (
          <TodoLine
            key={it.id}
            item={it}
            onToggle={() => toggle(i)}
            onText={(t) => setText(i, t)}
            onDelete={() => onDeleteItem(it)}
            onEnter={() => insertAfter(i)}
          />
        ))}
      </ol>
      <button className="add" onClick={addLine}>+ add line</button>
    </>
  );
}

function TodoLine({
  item,
  onToggle,
  onText,
  onDelete,
  onEnter,
}: {
  item: TodoItem;
  onToggle: () => void;
  onText: (text: string) => void;
  onDelete: () => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.textContent = item.text;
    }
  }, [item.text]);
  return (
    <li className={item.done ? 'done' : ''}>
      <input type="checkbox" checked={item.done} onChange={onToggle} />
      <div
        ref={ref}
        className="text"
        contentEditable
        suppressContentEditableWarning
        data-todo-item-id={item.id}
        onInput={(e) => onText((e.target as HTMLDivElement).textContent || '')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Enter creates a new empty item below this one and moves the
            // caret into it. Default would just insert a <br> inside this
            // contenteditable, which isn't what a checklist wants.
            e.preventDefault();
            onEnter();
          } else if (
            e.key === 'Backspace' &&
            !((e.target as HTMLDivElement).textContent || '')
          ) {
            e.preventDefault();
            onDelete();
          }
        }}
      />
      <button className="x" onClick={onDelete} title="Delete line">×</button>
    </li>
  );
}

function LinkBody({
  card,
  onPatch,
  onOpen,
}: {
  card: Card;
  onPatch: (p: Partial<Card>) => void;
  onOpen: () => void;
}) {
  const payload = card.payload as LinkPayload;
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.textContent = payload.title || '';
    }
  }, [payload.title]);
  const domain = domainOf(payload.url || '');
  const embeddable = payload.url ? embedUrlFor(payload.url) !== null : false;
  return (
    <>
      {payload.image && (
        <div className="link-thumb">
          <img src={payload.image} alt="" draggable={false} loading="lazy" />
        </div>
      )}
      <div className="link-head">
        {payload.favicon && (
          <img
            className="link-favicon"
            src={payload.favicon}
            alt=""
            draggable={false}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div
          ref={titleRef}
          className="title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Link title"
          onInput={(e) => onPatch({ payload: { ...payload, title: (e.target as HTMLDivElement).textContent || '' } })}
        />
      </div>
      {(domain || payload.siteName) && (
        <div className="link-domain">{payload.siteName || domain}{embeddable ? ' · double-click to play' : ''}</div>
      )}
      <input
        className="url-input"
        type="url"
        placeholder="https://…"
        defaultValue={payload.url || ''}
        onBlur={(e) => onPatch({ payload: { ...payload, url: e.target.value } })}
      />
      {payload.url && (
        <button className="open" onClick={onOpen} title="Open in new tab">visit ↗</button>
      )}
    </>
  );
}

function DocumentTile({
  card,
  onPatch,
}: {
  card: Card;
  onPatch: (p: Partial<Card>) => void;
}) {
  const payload = card.payload as { title: string; body: string; mode: 'icon' | 'preview' };
  const mode = payload.mode || 'icon';
  function toggleMode(e: React.MouseEvent) {
    e.stopPropagation();
    const nextMode = mode === 'icon' ? 'preview' : 'icon';
    onPatch({
      payload: { ...payload, mode: nextMode },
      w: nextMode === 'icon' ? 140 : 240,
      h: nextMode === 'icon' ? 110 : 200,
    });
  }
  return (
    <div className={`doc ${mode}-mode`}>
      <button className="doc-mode-toggle" onClick={toggleMode}>
        {mode === 'icon' ? 'preview' : 'icon'}
      </button>
      {mode === 'icon' ? (
        <>
          <div className="doc-glyph" />
          <div className="doc-title">{payload.title || 'Untitled document'}</div>
        </>
      ) : (
        <>
          <div className="doc-title">{payload.title || 'Untitled document'}</div>
          <div
            className="doc-preview"
            dangerouslySetInnerHTML={{ __html: payload.body || '<p style="color:var(--ink-faint);font-style:italic">Empty</p>' }}
          />
        </>
      )}
    </div>
  );
}

function BoardTile({ card }: { card: Card }) {
  const payload = card.payload as { name?: string };
  return (
    <>
      <div className="board-tile" style={{ background: `var(--c-${card.color})` } as CSSProperties}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      </div>
      <div className="board-label">{payload.name || 'Untitled'}</div>
      <div className="board-meta">double-click to enter</div>
    </>
  );
}

// ── Image card body + lightbox ──────────────────────────────────────────

function ImageBody({ card, onPatch }: { card: Card; onPatch: (p: Partial<Card>) => void }) {
  const payload = card.payload as ImagePayload;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedMediaUrl(payload.thumbPath ?? payload.storagePath)
      .then((u) => { if (alive) setUrl(u); })
      .catch(console.error);
    return () => { alive = false; };
  }, [payload.thumbPath, payload.storagePath]);

  const captionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (captionRef.current && document.activeElement !== captionRef.current) {
      captionRef.current.textContent = payload.caption || '';
    }
  }, [payload.caption]);

  return (
    <div className="img-wrap">
      {url ? (
        <img src={url} alt={payload.caption || ''} draggable={false} />
      ) : (
        <div className="img-loading" />
      )}
      <div
        ref={captionRef}
        className={`img-caption${payload.caption ? '' : ' empty'}`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="add a caption"
        onInput={(e) =>
          onPatch({ payload: { ...payload, caption: (e.target as HTMLDivElement).textContent || '' } })
        }
        onKeyDown={(e) => {
          // Single-line caption: Enter commits instead of inserting breaks.
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          }
        }}
      />
    </div>
  );
}

function MediaLightbox({
  card,
  index,
  count,
  onClose,
  onNavigate,
}: {
  card: Card;
  index: number;
  count: number;
  onClose: () => void;
  onNavigate: (dir: 1 | -1) => void;
}) {
  const isVideo = card.type === 'file';
  const isEmbed = card.type === 'link';
  const imgPayload = card.payload as ImagePayload;
  const filePayload = card.payload as FilePayload;
  const linkPayload = card.payload as LinkPayload;
  const embedSrc = isEmbed ? embedUrlFor(linkPayload.url || '') : null;
  const storagePath = isEmbed ? '' : isVideo ? filePayload.storagePath : imgPayload.storagePath;
  const caption = isEmbed
    ? linkPayload.title || domainOf(linkPayload.url || '')
    : isVideo
      ? filePayload.filename
      : imgPayload.caption || '';
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!storagePath) return;
    let alive = true;
    setUrl(null);
    // Lightbox always shows the ORIGINAL, not the canvas rendition.
    signedMediaUrl(storagePath)
      .then((u) => { if (alive) setUrl(u); })
      .catch(console.error);
    return () => { alive = false; };
  }, [storagePath]);
  return (
    <div className="nt-lightbox" onClick={onClose}>
      {count > 1 && (
        <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); onNavigate(-1); }} title="Previous (←)">‹</button>
      )}
      <figure className="lb-inner" onClick={(e) => e.stopPropagation()}>
        {isEmbed ? (
          embedSrc && (
            <iframe
              className="lb-embed"
              src={embedSrc}
              title={caption}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        ) : url ? (
          isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} controls autoPlay />
          ) : (
            <img src={url} alt={caption} />
          )
        ) : (
          <div className="img-loading" />
        )}
        {(caption || count > 1) && (
          <figcaption>
            <span className="lb-caption">{caption}</span>
            {count > 1 && <span className="lb-count">{index + 1} / {count}</span>}
          </figcaption>
        )}
      </figure>
      {count > 1 && (
        <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); onNavigate(1); }} title="Next (→)">›</button>
      )}
      <button className="lb-close" onClick={onClose} title="Close (Esc)">close</button>
    </div>
  );
}

// ── File card body ──────────────────────────────────────────────────────

function FileBody({ card }: { card: Card }) {
  const payload = card.payload as FilePayload;
  const group = fileGroup(payload.mimeType, payload.filename);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Audio cards get an inline player.
  useEffect(() => {
    if (group !== 'audio') return;
    let alive = true;
    signedMediaUrl(payload.storagePath)
      .then((u) => { if (alive) setAudioUrl(u); })
      .catch(console.error);
    return () => { alive = false; };
  }, [group, payload.storagePath]);

  async function download() {
    try {
      const url = await signedDownloadUrl(payload.storagePath, payload.filename);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename;
      a.click();
    } catch (err) {
      console.error(err);
    }
  }
  async function openInTab() {
    try {
      const url = await signedMediaUrl(payload.storagePath);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className={`file-body group-${group}`}>
      <div className="file-row">
        <span className="file-icon">{fileGroupIcon(group)}</span>
        <div className="file-meta">
          <div className="file-name" title={payload.filename}>{truncateMiddle(payload.filename)}</div>
          <div className="file-size">
            {humanSize(payload.sizeBytes)}
            {group === 'video' && <span className="file-hint"> · double-click to play</span>}
          </div>
        </div>
        <div className="file-actions">
          {group === 'pdf' && (
            <button onClick={openInTab} title="Open PDF in a new tab">open</button>
          )}
          <button onClick={download} title="Download">↓</button>
        </div>
      </div>
      {group === 'audio' && audioUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={audioUrl} controls preload="none" />
      )}
    </div>
  );
}

function fileGroupIcon(group: string): JSX.Element {
  switch (group) {
    case 'pdf':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
          <text x="7.5" y="17" fontSize="6.2" stroke="none" fill="currentColor">PDF</text>
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="5" y="4" width="14" height="16" rx="1.5" />
          <line x1="12" y1="4" x2="12" y2="9" /><rect x="10.5" y="9" width="3" height="3" />
        </svg>
      );
    case 'audio':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <circle cx="8" cy="17" r="2.5" /><circle cx="17" cy="15" r="2.5" />
          <path d="M10.5 17V7l9-2v10" />
        </svg>
      );
    case 'video':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <path d="M10 9.5v5l4.5-2.5z" />
        </svg>
      );
    case 'doc':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
          <line x1="8.5" y1="12" x2="15.5" y2="12" /><line x1="8.5" y1="15" x2="15.5" y2="15" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
        </svg>
      );
  }
}

// ── Trash drawer ────────────────────────────────────────────────────────

function TrashDrawer({
  entries,
  onClose,
  onRestore,
}: {
  entries: TrashEntry[];
  onClose: () => void;
  onRestore: (entry: TrashEntry) => void;
}) {
  return (
    <aside className="nt-trash">
      <div className="head">
        <h3>Trash</h3>
        <button className="btn-quiet" onClick={onClose}>close</button>
      </div>
      <div className="body">
        {entries.length === 0 ? (
          <div className="empty">Nothing in the trash.</div>
        ) : (
          entries.map((t) => (
            <div className="row" key={t.id}>
              <div className="info">
                <div className="meta">{t.kind.replace('_', ' ')} · {timeAgo(t.deleted_at)}</div>
                <div className="preview">{trashPreview(t)}</div>
              </div>
              <div className="actions">
                <button onClick={() => onRestore(t)}>Restore</button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ── Document full-page overlay ──────────────────────────────────────────

function DocumentOverlay({
  card,
  onClose,
  onPatch,
}: {
  card: Card;
  onClose: () => void;
  onPatch: (p: Partial<Card>) => void;
}) {
  const payload = card.payload as { title: string; body: string; mode: 'icon' | 'preview' };
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = payload.body || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  function exec(cmd: string, value?: string) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, value);
    onPatch({ payload: { ...payload, body: bodyRef.current?.innerHTML || '' } });
  }

  return (
    <div className="nt-doc-overlay" onClick={onClose}>
      <div className="nt-doc-page" onClick={(e) => e.stopPropagation()}>
        <div className="doc-head">
          <h2>Document</h2>
          <button onClick={onClose}>close</button>
        </div>
        <div className="doc-tlbl">
          <button className="b" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>B</button>
          <button className="i" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><em>I</em></button>
          <button className="u" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>U</button>
          <span className="sep" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h1')}>H1</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h2')}>H2</button>
          <span className="sep" />
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>•</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>1.</button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'blockquote')}>❝</button>
        </div>
        <input
          className="doc-page-title"
          placeholder="Untitled document"
          defaultValue={payload.title || ''}
          onBlur={(e) => onPatch({ payload: { ...payload, title: e.target.value } })}
        />
        <div
          ref={bodyRef}
          className="doc-body"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Begin writing…"
          onInput={(e) => onPatch({ payload: { ...payload, body: (e.target as HTMLDivElement).innerHTML } })}
        />
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function defaultPayloadFor(type: CardType): any {
  switch (type) {
    case 'note':     return { body: '' };
    case 'todo':     return { title: 'To-do', items: [{ id: cryptoRandomId(), text: '', done: false }] };
    case 'heading':  return { body: '' };
    case 'link':     return { title: '', url: '' };
    case 'document': return { title: 'Untitled document', body: '', mode: 'icon' };
    case 'column':   return { title: 'Column' };
    case 'swatch':   return { hex: '#c9a45c', label: '' };
    case 'comment':  return { body: '', resolved: false };
    default:         return {};
  }
}

/** Walk up from `node` to find the closest ancestor matching the selector. */
function findClosest(node: Node | null, selector: string): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.matches?.(selector)) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'i' + Math.random().toString(36).slice(2, 10);
}

function trashPreview(t: TrashEntry): string {
  if (t.kind === 'todo_item') return (t.snapshot as TodoItem).text || '(empty line)';
  if (t.kind === 'card') {
    const c = t.snapshot as Card;
    const p: any = c.payload;
    if (c.type === 'note')     return stripTags(p.body || '') || '(empty note)';
    if (c.type === 'todo')     return p.title || '(to-do)';
    if (c.type === 'heading')  return p.body || '(heading)';
    if (c.type === 'link')     return p.title || p.url || '(link)';
    if (c.type === 'document') return p.title || '(document)';
    if (c.type === 'image')    return p.caption || '(image)';
    if (c.type === 'file')     return p.filename || '(file)';
    if (c.type === 'column')   return p.title || '(column)';
    if (c.type === 'swatch')   return p.label ? `${p.label} · ${p.hex}` : p.hex || '(swatch)';
    if (c.type === 'comment')  return p.body || '(comment)';
    return c.type;
  }
  if (t.kind === 'board') {
    const tile = (t.snapshot as any).tile;
    return tile?.payload?.name || '(board)';
  }
  if (t.kind === 'column') {
    const snap = t.snapshot as any;
    const n = snap?.members?.length ?? 0;
    return `${snap?.column?.payload?.title || '(column)'} · ${n} card${n === 1 ? '' : 's'}`;
  }
  return '(item)';
}
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function timeAgo(iso: string): string {
  const dt = new Date(iso).getTime();
  const ago = Math.floor((Date.now() - dt) / 1000);
  if (ago < 60) return 'just now';
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`;
  return `${Math.floor(ago / 86400)}d ago`;
}

function toolIcon(type: CardType): JSX.Element {
  switch (type) {
    case 'note':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <line x1="7" y1="9" x2="17" y2="9" />
          <line x1="7" y1="13" x2="14" y2="13" />
        </svg>
      );
    case 'todo':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4" y="5" width="5" height="5" rx="0.6" />
          <path d="M5 7.4l1.4 1.4L8.4 6.6" />
          <line x1="11" y1="7.5" x2="20" y2="7.5" />
          <rect x="4" y="13" width="5" height="5" rx="0.6" />
          <line x1="11" y1="15.5" x2="20" y2="15.5" />
        </svg>
      );
    case 'link':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M9 14l6-6" />
          <path d="M11 7.5l1.5-1.5a3.5 3.5 0 014.95 4.95L16 12.5" />
          <path d="M13 16.5L11.5 18a3.5 3.5 0 01-4.95-4.95L8 11.5" />
        </svg>
      );
    case 'heading':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 6v12" />
          <path d="M14 6v12" />
          <line x1="6" y1="12" x2="14" y2="12" />
        </svg>
      );
    case 'board':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 4h8l4 4v12H6z" />
          <path d="M14 4v4h4" />
          <line x1="8.5" y1="12" x2="15.5" y2="12" />
          <line x1="8.5" y1="15" x2="15.5" y2="15" />
          <line x1="8.5" y1="18" x2="13" y2="18" />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M4 17l5-5 4 4 3-3 4 4" />
        </svg>
      );
    case 'file':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      );
    case 'column':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="16" y2="16" />
        </svg>
      );
    case 'swatch':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
          <path d="M4.5 14l5-4 5 5 5-3" />
        </svg>
      );
    case 'comment':
      return (
        <svg viewBox="0 0 24 24" className="ic-svg">
          <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-8l-4 4v-4H6a2 2 0 01-2-2z" />
        </svg>
      );
  }
}
