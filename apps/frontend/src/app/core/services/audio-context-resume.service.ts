import { Injectable } from '@angular/core';

/** Resumes registered AudioContexts after a user click (autoplay / suspended policy). */
@Injectable({
  providedIn: 'root',
})
export class AudioContextResumeService {
  private readonly contexts = new Set<AudioContext>();

  private readonly onClick = (): void => {
    for (const context of this.contexts) {
      if (context.state === 'suspended') {
        void context.resume();
      }
    }
  };

  constructor() {
    window.addEventListener('click', this.onClick);
  }

  public register(context: AudioContext): void {
    this.contexts.add(context);
    if (context.state === 'suspended') {
      void context.resume();
    }
  }

  public unregister(context: AudioContext): void {
    this.contexts.delete(context);
  }
}
