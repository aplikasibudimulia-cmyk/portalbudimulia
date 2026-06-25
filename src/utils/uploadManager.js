import { useState, useEffect } from 'react';

class UploadManager {
  constructor() {
    this.isUploading = false;
    this.progress = null; // { current, total, percentage, filename }
    this.minimized = false;
    this.cancelFlag = false;
    this.results = null; // { success, failed }
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (let listener of this.listeners) {
      listener(this.getState());
    }
  }

  getState() {
    return {
      isUploading: this.isUploading,
      progress: this.progress,
      minimized: this.minimized,
      cancelFlag: this.cancelFlag,
      results: this.results
    };
  }

  startUpload() {
    this.isUploading = true;
    this.progress = { current: 0, total: 0, percentage: 0, filename: '' };
    this.minimized = false;
    this.cancelFlag = false;
    this.results = null;
    this.notify();
  }

  updateProgress(current, total, filename) {
    this.progress = {
      current,
      total,
      percentage: Math.round((current / total) * 100),
      filename
    };
    this.notify();
  }

  setMinimized(minimized) {
    this.minimized = minimized;
    this.notify();
  }

  cancelUpload() {
    this.cancelFlag = true;
    this.notify();
  }

  finishUpload(results) {
    this.isUploading = false;
    this.progress = null;
    this.minimized = false;
    this.cancelFlag = false;
    this.results = results;
    this.notify();
  }
}

export const globalUploadManager = new UploadManager();

export function useUploadManager() {
  const [state, setState] = useState(globalUploadManager.getState());

  useEffect(() => {
    return globalUploadManager.subscribe(setState);
  }, []);

  return state;
}
