'use client';
import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persist until dismissed
}

export type ModalId =
  | 'bulk-approve'
  | 'add-client'
  | 'coa-mapping'
  | 'send-renewal'
  | 'view-receipt'
  | 'confirm-action'
  | null;

export interface UIState {
  sidebarCollapsed: boolean;
  activeModal: ModalId;
  modalPayload: Record<string, unknown>;
  toasts: Toast[];
  searchOpen: boolean;
  pageTitle: React.ReactNode;
  pageSubtitle: React.ReactNode;

  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  openModal: (id: ModalId, payload?: Record<string, unknown>) => void;
  closeModal: () => void;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setSearchOpen: (v: boolean) => void;
  setPageHeader: (title: React.ReactNode, subtitle?: React.ReactNode) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  modalPayload: {},
  toasts: [],
  searchOpen: false,
  pageTitle: null,
  pageSubtitle: null,

  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  openModal: (activeModal, payload = {}) => set({ activeModal, modalPayload: payload }),
  closeModal: () => set({ activeModal: null, modalPayload: {} }),

  showToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    const duration = toast.duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSearchOpen: (searchOpen) => set({ searchOpen }),

  setPageHeader: (pageTitle, pageSubtitle = null) => set({ pageTitle, pageSubtitle }),
}));
