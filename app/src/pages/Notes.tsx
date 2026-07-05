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
  softDeleteTodoItem,
  updateCard,
} from '../lib/notes';
import { BoardHistory, BurstCoalescer, hasUserContent, type Command } from '../lib/notesHistory';
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
];

const DEFAULT_W: Record<CardType, number> = {
  note: 240,
  todo: 240,
  heading: 280,
  link: 240,
  document: 140,
  board: 130,
};
const DEFAULT_H: Record<CardType, number> = {
  note: 140,
  todo: 200,
  heading: 50,
  link: 90,
  document: 110,
  board: 130,
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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; cardId: string } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [docOverlayId, setDocOverlayId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Drag a card type onto the canvas. Scroll to pan, ⌘+scroll to zoom.');
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
      const [cardList, chain] = await Promise.all([
        listCards(boardId),
        getBoardAncestry(boardId),
      ]);
      setCards(cardList);
      setAncestry(chain);
      setSelectedIds(new Set());
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
    setCtxMenu(null);
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
    const gestureView = view;
    const gestureCards = cards;
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
    setView(fitView(cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })), r.width, r.height));
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
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      // Persist all moved cards if the gesture actually moved; one history
      // command per gesture covering the whole group.
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
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
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

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
    const type = (dropDataRef.current ||
      (e.dataTransfer.getData('text/plain') as CardType)) as CardType;
    if (!type || !currentBoardId) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const wrapperPt = { x: e.clientX - r.left, y: e.clientY - r.top };
    const pt = wrapperToCanvas(view, wrapperPt.x, wrapperPt.y);
    // Center the card around the drop point
    const w = DEFAULT_W[type];
    const h = DEFAULT_H[type];
    const x = Math.round(pt.x - w / 2);
    const y = Math.round(pt.y - h / 2);
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
    return {
      label: snapshots.length > 1 ? `${label} (${snapshots.length})` : label,
      undo: async () => {
        for (let i = 0; i < snapshots.length; i++) {
          // Use the card's CURRENT state — it may have gained content.
          const cur = cardsRef.current.find((c) => c.id === snapshots[i].id) ?? snapshots[i];
          snapshots[i] = cur;
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

  const patchCardLocal = useCallback((id: string, patch: Partial<Card>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

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
      const ids = new Set(targets.map((t) => t.id));
      setCards((prev) => prev.filter((c) => !ids.has(c.id)));
      setSelectedIds(new Set());
      setCtxMenu(null);
      // Board tiles delete whole subtrees; their restore path is Trash v2
      // (Sprint 18), so they're excluded from undo — trash still has them.
      const plain = targets.filter((t) => !(t.type === 'board' && t.board_ref));
      const boards = targets.filter((t) => t.type === 'board' && t.board_ref);
      try {
        // Each card gets its own restorable trash entry.
        const trashIds: string[] = [];
        for (const t of plain) trashIds.push(await softDeleteCard(t));
        for (const b of boards) await softDeleteCard(b);
        setStatusMsg(
          targets.length === 1
            ? 'Moved 1 card to the trash.'
            : `Moved ${targets.length} cards to the trash.`,
        );
        if (plain.length > 0) {
          const snapshots = plain.slice();
          const tIds = trashIds.slice();
          getHistory(currentBoardId)?.push({
            label: snapshots.length > 1 ? `Delete ${snapshots.length} cards` : 'Delete',
            undo: async () => {
              // Restore rows with original ids AND retract the trash
              // entries so undoing a delete leaves no ghost in the trash.
              for (let i = 0; i < snapshots.length; i++) {
                const row = await insertCardRow(snapshots[i]);
                upsertCardLocal(row);
                await removeTrashEntry(tIds[i]);
              }
            },
            do: async () => {
              for (let i = 0; i < snapshots.length; i++) {
                removeCardsLocal(new Set([snapshots[i].id]));
                tIds[i] = await softDeleteCard(snapshots[i]);
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
    [currentBoardId, loadBoard, getHistory, upsertCardLocal, removeCardsLocal],
  );

  const duplicateCards = useCallback(
    async (targets: Card[]) => {
      if (targets.length === 0 || !currentBoardId) return;
      setCtxMenu(null);
      try {
        const dups: Card[] = [];
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
        }
        setCards((prev) => [...prev, ...dups]);
        setSelectedIds(new Set(dups.map((d) => d.id)));
        getHistory(currentBoardId)?.push(makeCreateCommand(dups, 'Duplicate'));
      } catch (err) {
        console.error(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- makeCreateCommand closes over stable refs only
    [currentBoardId, getHistory],
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
        } else if (docOverlayId) {
          setDocOverlayId(null);
        } else if (ctxMenu) {
          setCtxMenu(null);
        } else if (trashOpen) {
          setTrashOpen(false);
        } else if (selectedIds.size) {
          clearSelection();
        }
        return;
      }

      if (typing) return;

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
          const rects = cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
          setView(
            e.shiftKey
              ? fitView(rects, r.width, r.height)
              : viewCenteredOnContent(rects, r.width, r.height),
          );
          return;
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          setSelectedIds(new Set(cards.map((c) => c.id)));
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

      // Delete sends the whole selection to trash.
      if (e.key === 'Delete') {
        if (!selectedIds.size) return;
        e.preventDefault();
        deleteCards(cards.filter((c) => selectedIds.has(c.id)));
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedIds, cards, docOverlayId, ctxMenu, trashOpen, deleteCards, duplicateCards, clearSelection, doUndo, doRedo, flushNudge]);

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

  // ── Resize handle ─────────────────────────────────────────────────────
  function startResize(card: Card, e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = card.w ?? 240;
    const startH = card.h ?? 140;
    const k = view.k;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      const w = Math.max(140, startW + dx);
      const h = Math.max(60, startH + dy);
      patchCardLocal(card.id, { w, h });
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      const w = Math.max(140, startW + dx);
      const h = Math.max(60, startH + dy);
      updateCard(card.id, { w, h }).catch(console.error);
      if (w !== startW || h !== startH) {
        getHistory(currentBoardId)?.push({
          label: 'Resize',
          undo: async () => {
            patchCardLocal(card.id, { w: startW, h: startH });
            await updateCard(card.id, { w: startW, h: startH });
          },
          do: async () => {
            patchCardLocal(card.id, { w, h });
            await updateCard(card.id, { w, h });
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
    if (!ctxMenu) return;
    function close(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('.nt-ctx')) return;
      setCtxMenu(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

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
    <div className="notes-page">
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
            {cards.map((card) => (
              <CardView
                key={card.id}
                card={card}
                selected={selectedIds.has(card.id)}
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
          <div className="sep" />
          <button className="item delete" onClick={() => deleteCards(actionTargets(ctxCard))}>
            Delete{selectedIds.size > 1 && selectedIds.has(ctxCard.id) ? ` ${selectedIds.size} cards` : ''}
          </button>
        </div>
      )}

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
    </div>
  );
}

// ── Card renderer ───────────────────────────────────────────────────────

function CardView({
  card,
  selected,
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
  const baseStyle: CSSProperties = {
    left: card.x,
    top: card.y,
    width: card.w ?? undefined,
    height: card.type === 'heading' || card.type === 'board' ? undefined : card.h ?? undefined,
    background: card.type === 'heading' || card.type === 'board'
      ? undefined
      : `var(--c-${card.color})`,
    zIndex: card.z || undefined,
  };

  // Heading and Board cards don't get resize handles — heading auto-sizes
  // to its text, Board has a fixed-shape tile.
  const showResize = card.type !== 'heading' && card.type !== 'board';

  return (
    <div
      className={`nt-card type-${card.type}${selected ? ' selected' : ''}`}
      style={baseStyle}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <div className="nt-drag-handle" />
      <div className="typetag">{card.type}</div>
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
      {showResize && (
        <div
          className="nt-resize-se"
          onMouseDown={onResizeStart}
          title="Drag to resize"
        />
      )}
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
  const payload = card.payload as { title: string; url: string };
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
        className="title"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Link title"
        onInput={(e) => onPatch({ payload: { ...payload, title: (e.target as HTMLDivElement).textContent || '' } })}
      />
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
    return c.type;
  }
  if (t.kind === 'board') {
    const tile = (t.snapshot as any).tile;
    return tile?.payload?.name || '(board)';
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
  }
}
