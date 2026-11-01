import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../src/lib/entries';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/lib/entries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/entries')>()),
  listSanctuary: vi.fn(),
  updateSanctuaryEntry: vi.fn(),
  timelineForDate: vi.fn(async () => null),
}));

const veiled = (id: string, title: string, body: string) => ({
  id,
  room: 'sanctuary',
  entry_date: '2026-10-31',
  title,
  body,
  scripture_thoughts: '',
  ai_dialogue: '',
  tags: ['_veil'],
  scripture_refs: [],
  entry_type: 'journal',
  stillness_sessions: [],
  listening_prayer: false,
}) as unknown as Entry;

const ENTRIES = [
  veiled('entry-1', 'First entry', '<p>First page.</p>'),
  veiled('entry-2', 'Second entry', '<p>Second page.</p>'),
];

/** A fresh import of the page is what a new tab gets. */
async function newTab() {
  vi.resetModules();
  const { listSanctuary } = await import('../src/lib/entries');
  vi.mocked(listSanctuary).mockResolvedValue(ENTRIES);
  return (await import('../src/pages/Sanctuary')).default;
}

async function show(Sanctuary: () => JSX.Element) {
  const view = render(<MemoryRouter><Sanctuary /></MemoryRouter>);
  await waitFor(() => expect(view.container.querySelector('.sa-page')).not.toBeNull());
  await screen.findByRole('button', { name: 'Privacy controls' });
  return view;
}

const eye = () => screen.getByRole('button', { name: 'Privacy controls' });
const isFolded = () => document.querySelector('.sa-page-veiled') !== null;

async function goTo(title: string) {
  fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: title } });
  fireEvent.click(await screen.findByRole('listitem', { name: (_n, el) => el.textContent!.includes(title) }));
  await waitFor(() => expect(document.querySelector('.sa-entries li.active')?.textContent).toContain(title));
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('the veil', () => {
  it('starts folded', async () => {
    await show(await newTab());
    expect(isFolded()).toBe(true);
  });

  it('unfolds every veiled entry at once', async () => {
    await show(await newTab());
    fireEvent.click(eye());
    expect(isFolded()).toBe(false);

    await goTo('Second entry');
    expect(isFolded()).toBe(false);
    expect(screen.getByText('Second page.')).toBeInTheDocument();

    await goTo('First entry');
    expect(isFolded()).toBe(false);
    expect(screen.getByText('First page.')).toBeInTheDocument();
  });

  it('stays unfolded after leaving Sanctuary and coming back', async () => {
    const Sanctuary = await newTab();
    const first = await show(Sanctuary);
    fireEvent.click(eye());

    first.unmount();
    await show(Sanctuary);

    expect(isFolded()).toBe(false);
  });

  it('folds them all again when the eye is closed', async () => {
    await show(await newTab());
    fireEvent.click(eye());
    fireEvent.click(eye());
    expect(isFolded()).toBe(true);

    await goTo('Second entry');
    expect(isFolded()).toBe(true);
  });

  it('is folded again in a new tab', async () => {
    await show(await newTab());
    fireEvent.click(eye());
    cleanup();

    await show(await newTab());
    expect(isFolded()).toBe(true);
  });
});
