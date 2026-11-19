import { create } from "zustand";

export interface InteractiveStoreState {
  values: Record<string, Record<string, unknown>>;
  setValue: (scopeId: string, fieldId: string, value: unknown) => void;
  getAllValues: (scopeId: string) => Record<string, unknown>;
  clearScope: (scopeId: string) => void;
}

export const useInteractiveStore = create<InteractiveStoreState>(
  (set, get) => ({
    values: {},

    setValue: (scopeId, fieldId, value) => {
      set((state) => {
        const scopeValues = state.values[scopeId] || {};
        return {
          values: {
            ...state.values,
            [scopeId]: {
              ...scopeValues,
              [fieldId]: value,
            },
          },
        };
      });
    },

    getAllValues: (scopeId) => {
      return get().values[scopeId] || {};
    },

    clearScope: (scopeId) => {
      set((state) => {
        const newValues = { ...state.values };
        delete newValues[scopeId];
        return {
          values: newValues,
        };
      });
    },
  }),
);
