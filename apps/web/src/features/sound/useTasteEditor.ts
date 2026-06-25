import { useCallback, useEffect, useState } from 'react';
import type { GenreCount, TasteEntityType, TastePolarity } from '@auracle/shared';
import { loadBrowseCatalog, loadGenres, type BrowseCatalog } from './catalogBrowse';
import { describeSaveError, fetchTaste, saveTaste } from './tasteApi';
import { hydrateSelection, setPolarity, togglePolarity, toSaveRequest, type Selection } from './tasteSelection';

export type TasteLoadState = 'loading' | 'ready' | 'error';
export type TasteSaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_CATALOG: BrowseCatalog = { artists: [], tracks: [] };

export interface TasteEditor {
  loadState: TasteLoadState;
  genres: GenreCount[];
  catalog: BrowseCatalog;
  selection: Selection;
  freeText: string;
  saveState: TasteSaveState;
  errorMessage: string;
  setFreeText: (value: string) => void;
  toggle: (entityType: TasteEntityType, entityId: string, polarity: TastePolarity) => void;
  removeOrphan: (entityType: TasteEntityType, entityId: string) => void;
  save: () => void;
}

/** Loads catalog options + the current taste profile, and manages save flow. */
export function useTasteEditor(): TasteEditor {
  const [loadState, setLoadState] = useState<TasteLoadState>('loading');
  const [genres, setGenres] = useState<GenreCount[]>([]);
  const [catalog, setCatalog] = useState<BrowseCatalog>(EMPTY_CATALOG);
  const [selection, setSelection] = useState<Selection>({});
  const [freeText, setFreeTextState] = useState('');
  const [saveState, setSaveState] = useState<TasteSaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [genreList, browse, profile] = await Promise.all([loadGenres(), loadBrowseCatalog(), fetchTaste()]);
        if (cancelled) return;
        setGenres(genreList);
        setCatalog(browse);
        setSelection(hydrateSelection(profile.preferences));
        setFreeTextState(profile.freeText ?? '');
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setFreeText = useCallback((value: string) => {
    setSaveState('idle');
    setFreeTextState(value);
  }, []);

  const toggle = useCallback((entityType: TasteEntityType, entityId: string, polarity: TastePolarity) => {
    setSaveState('idle');
    setSelection((sel) => togglePolarity(sel, entityType, entityId, polarity));
  }, []);

  const removeOrphan = useCallback((entityType: TasteEntityType, entityId: string) => {
    setSaveState('idle');
    setSelection((sel) => setPolarity(sel, entityType, entityId, null));
  }, []);

  const save = useCallback(() => {
    setSaveState('saving');
    setErrorMessage('');
    void (async () => {
      try {
        const res = await saveTaste(toSaveRequest(selection, freeText));
        setSelection(hydrateSelection(res.preferences));
        setFreeTextState(res.freeText ?? '');
        setSaveState('saved');
      } catch (err) {
        setErrorMessage(describeSaveError(err));
        setSaveState('error');
      }
    })();
  }, [selection, freeText]);

  return {
    loadState,
    genres,
    catalog,
    selection,
    freeText,
    saveState,
    errorMessage,
    setFreeText,
    toggle,
    removeOrphan,
    save,
  };
}
