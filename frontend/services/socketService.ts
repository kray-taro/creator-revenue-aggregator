'use client';
import { io, Socket } from 'socket.io-client';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { BulkJobProgress } from '@/stores/dashboardStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

class SocketService {
  private socket: Socket | null = null;

  connect(token?: string) {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.debug('[WS] Connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.debug('[WS] Disconnected:', reason);
    });

    this.socket.on('bulk_job:progress', (data: Partial<BulkJobProgress>) => {
      useDashboardStore.getState().updateBulkJobProgress(data);
    });

    this.socket.on('bulk_job:client_update', (data: { clientId: string; status: BulkJobProgress['clientProgress'][string] }) => {
      useDashboardStore.getState().setClientProgress(data.clientId, data.status);
    });

    this.socket.on('bulk_job:complete', (data: BulkJobProgress) => {
      useDashboardStore.getState().updateBulkJobProgress(data);
    });
  }

  /** Subscribe to progress updates for a specific bulk job */
  subscribeToBulkJob(jobId: string) {
    this.socket?.emit('subscribe:bulk_job', { jobId });
  }

  /** Unsubscribe from a bulk job */
  unsubscribeFromBulkJob(jobId: string) {
    this.socket?.emit('unsubscribe:bulk_job', { jobId });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
