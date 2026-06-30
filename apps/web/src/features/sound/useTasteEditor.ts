import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenreCount, TasteEntityType, TastePolarity } from '@auracle/shared';
import { queryKeys } from '@/shared/query/keys';
import type { BrowseCatalog } from './catalogBrowse';
import { useBrowseCatalogQuery, useGenresQuery } from './useCatalogQueries';
import { describeSaveError, saveTaste } from './tasteApi';
import { useTasteQuery } from './useTasteQuery';
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
  clear: (entityType: TasteEntityType, entityId: string) => void;
  removeOrphan: (entityType: TasteEntityType, entityId: string) => void;
  save: () => void;
}

/** Loads catalog options + the current taste profile, and manages save flow. */
export function useTasteEditor(): TasteEditor {
  const queryClient = useQueryClient();
  const tasteQuery = useTasteQuery();
  const genresQuery = useGenresQuery();
  const browseQuery = useBrowseCatalogQuery();
  const [selection, setSelection] = useState<Selection>({});
  const [freeText, setFreeTextState] = useState('');
  const [saveState, setSaveState] = useState<TasteSaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const latest = useRef({ selection, freeText });
  useEffect(() => {
    latest.current = { selection, freeText };
  });

  useEffect(() => {
    setHydrated(false);
  }, [tasteQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!tasteQuery.data || hydrated) return;
    setSelection(hydrateSelection(tasteQuery.data.preferences));
    setFreeTextState(tasteQuery.data.freeText ?? '');
    setHydrated(true);
  }, [tasteQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: saveTaste,
    onMutate: () => {
      setSaveState('saving');
      setErrorMessage('');
    },
    onSuccess: (res) => {
      const savedSelection = selection;
      const savedFreeText = freeText;
      const edited =
        latest.current.selection !== savedSelection || latest.current.freeText !== savedFreeText;
      if (edited) {
        setSaveState('idle');
        return;
      }
      setSelection(hydrateSelection(res.preferences));
      setFreeTextState(res.freeText ?? '');
      setSaveState('saved');
      queryClient.setQueryData(queryKeys.taste, res);
    },
    onError: (err) => {
      setErrorMessage(describeSaveError(err));
      setSaveState('error');
    },
  });

  const loadState: TasteLoadState =
    tasteQuery.isPending || genresQuery.isPending || browseQuery.isPending
      ? 'loading'
      : tasteQuery.isError || genresQuery.isError || browseQuery.isError
        ? 'error'
        : 'ready';

  const setFreeText = useCallback((value: string) => {
    setSaveState('idle');
    setFreeTextState(value);
  }, []);

  const toggle = useCallback((entityType: TasteEntityType, entityId: string, polarity: TastePolarity) => {
    setSaveState('idle');
    setSelection((sel) => togglePolarity(sel, entityType, entityId, polarity));
  }, []);

  const clear = useCallback((entityType: TasteEntityType, entityId: string) => {
    setSaveState('idle');
    setSelection((sel) => setPolarity(sel, entityType, entityId, null));
  }, []);

  const removeOrphan = useCallback((entityType: TasteEntityType, entityId: string) => {
    setSaveState('idle');
    setSelection((sel) => setPolarity(sel, entityType, entityId, null));
  }, []);

  const save = useCallback(() => {
    saveMutation.mutate(toSaveRequest(selection, freeText));
  }, [freeText, saveMutation, selection]);

  return {
    loadState,
    genres: genresQuery.data ?? [],
    catalog: browseQuery.data ?? EMPTY_CATALOG,
    selection,
    freeText,
    saveState,
    errorMessage,
    setFreeText,
    toggle,
    clear,
    removeOrphan,
    save,
  };
}
