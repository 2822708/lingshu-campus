import { SAVE_KEY } from '../../utils/gameUtils';

export function supportsSaveOwnership(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.locks?.request);
}

/** A tab holds this lock for its entire game session, including imports and autosaves. */
export function claimSaveOwnership(): Promise<(() => void) | null> {
  return new Promise((resolve, reject) => {
    navigator.locks
      .request(`${SAVE_KEY}:writer`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise<void>((release) => resolve(release));
      })
      .catch(reject);
  });
}
