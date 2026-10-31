import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSanctuary, updateSanctuaryEntry, type Entry } from '../src/lib/entries';
import Sanctuary from '../src/pages/Sanctuary';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/lib/entries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/entries')>()),
  listSanctuary: vi.fn(),
  updateSanctuaryEntry: vi.fn(),
  timelineForDate: vi.fn(async () => null),
}));

const baseEntry = {
  id: 'entry-1',
  room: 'sanctuary',
  entry_date: '2026-10-31',
  title: 'An entry',
  body: '<p>Journal page.</p>',
  scripture_thoughts: '',
  ai_dialogue: '',
  tags: [],
  scripture_refs: [],
  entry_type: 'journal',
  stillness_sessions: [],
  listening_prayer: false,
} as unknown as Entry;

const PASTED = '<p>Pasted analysis.</p>';

async function openSanctuary(entry: Entry = baseEntry) {
  vi.mocked(listSanctuary).mockResolvedValue([entry]);
  vi.mocked(updateSanctuaryEntry).mockImplementation(async (_id, patch) => ({ ...entry, ...patch }) as Entry);
  const view = render(<MemoryRouter><Sanctuary /></MemoryRouter>);
  await waitFor(() => expect(view.container.querySelector('.sa-page')).not.toBeNull());
  return view;
}

const paneButton = () => screen.getByRole('button', { name: 'AI ❐' });
const paneEditor = () => document.querySelector<HTMLDivElement>('.sa-ai-editor');

async function openPane() {
  fireEvent.click(paneButton());
  await waitFor(() => expect(paneEditor()).not.toBeNull());
}

function pasteIntoPane(html: string) {
  const editor = paneEditor()!;
  editor.innerHTML = html;
  fireEvent.input(editor);
}

function openOptions() {
  fireEvent.click(screen.getByRole('button', { name: 'Sanctuary options' }));
  return screen.getByRole('checkbox', { name: /AI tools/ });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('AI dialogue pane keeps its text', () => {
  beforeEach(() => window.localStorage.setItem('sa-show-ai-tools', '1'));

  it('shows a paste again after the AI button hides and reopens the pane', async () => {
    await openSanctuary();
    await openPane();
    pasteIntoPane(PASTED);

    fireEvent.click(paneButton());
    await waitFor(() => expect(paneEditor()).toBeNull());
    await openPane();

    expect(paneEditor()!.innerHTML).toBe(PASTED);
  });

  it('shows a paste again after the pane closes with its × button', async () => {
    await openSanctuary();
    await openPane();
    pasteIntoPane(PASTED);

    fireEvent.click(screen.getByRole('button', { name: 'Close AI pane' }));
    await waitFor(() => expect(paneEditor()).toBeNull());
    await openPane();

    expect(paneEditor()!.innerHTML).toBe(PASTED);
  });

  it('shows text saved before this visit every time the pane reopens', async () => {
    await openSanctuary({ ...baseEntry, ai_dialogue: PASTED });
    await openPane();
    expect(paneEditor()!.innerHTML).toBe(PASTED);

    fireEvent.click(paneButton());
    await waitFor(() => expect(paneEditor()).toBeNull());
    await openPane();

    expect(paneEditor()!.innerHTML).toBe(PASTED);
  });

  it('does not save over the dialogue when reopened and edited', async () => {
    await openSanctuary({ ...baseEntry, ai_dialogue: PASTED });
    await openPane();
    fireEvent.click(paneButton());
    await waitFor(() => expect(paneEditor()).toBeNull());
    await openPane();

    const editor = paneEditor()!;
    editor.innerHTML += '<p>One more line.</p>';
    fireEvent.input(editor);

    await waitFor(() => expect(updateSanctuaryEntry).toHaveBeenCalled(), { timeout: 2000 });
    const patch = vi.mocked(updateSanctuaryEntry).mock.calls.at(-1)![1] as Partial<Entry>;
    expect(patch.ai_dialogue).toBe(`${PASTED}<p>One more line.</p>`);
  });

  it('restores the dialogue after the veil folds and unfolds the entry', async () => {
    await openSanctuary({ ...baseEntry, ai_dialogue: PASTED, tags: ['_veil'] });
    const eye = screen.getByRole('button', { name: 'Privacy controls' });

    fireEvent.click(eye);
    await openPane();
    expect(paneEditor()!.innerHTML).toBe(PASTED);

    fireEvent.click(eye);
    await waitFor(() => expect(paneEditor()).toBeNull());
    fireEvent.click(eye);
    await waitFor(() => expect(paneEditor()).not.toBeNull());

    expect(paneEditor()!.innerHTML).toBe(PASTED);
  });
});

describe('Sanctuary options', () => {
  it('hides the AI tools by default', async () => {
    await openSanctuary();

    expect(screen.queryByRole('button', { name: 'AI ❐' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'AI mark visibility' })).toBeNull();
    expect(openOptions()).not.toBeChecked();
  });

  it('shows the AI tools from the gear and remembers the choice', async () => {
    const first = await openSanctuary();
    fireEvent.click(openOptions());

    expect(paneButton()).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'AI mark visibility' })).toBeInTheDocument();

    first.unmount();
    await openSanctuary();
    expect(paneButton()).toBeInTheDocument();
  });

  it('closes an open pane when the tools are hidden, and keeps its text', async () => {
    await openSanctuary();
    fireEvent.click(openOptions());
    await openPane();
    pasteIntoPane(PASTED);

    fireEvent.click(screen.getByRole('checkbox', { name: /AI tools/ }));
    await waitFor(() => expect(paneEditor()).toBeNull());
    expect(screen.queryByRole('button', { name: 'AI ❐' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: /AI tools/ }));
    await openPane();
    expect(paneEditor()!.innerHTML).toBe(PASTED);
  });

  it('closes the panel on Escape and on a click outside it', async () => {
    await openSanctuary();
    const panel = () => screen.queryByRole('group', { name: 'Sanctuary options' });

    openOptions();
    expect(within(panel()!).getByRole('checkbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).toBeNull();

    openOptions();
    fireEvent.mouseDown(document.body);
    expect(panel()).toBeNull();
  });
});
