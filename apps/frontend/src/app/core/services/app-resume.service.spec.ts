import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppResumeService,
  RESUME_DEBOUNCE_MS,
  type IAppResume,
} from './app-resume.service';

describe('AppResumeService', () => {
  let visibility: DocumentVisibilityState;
  let resumes: IAppResume[];

  const setVisibility = (state: DocumentVisibilityState): void => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    );
    resumes = [];
    TestBed.configureTestingModule({});
    TestBed.inject(AppResumeService).resume$.subscribe((resume) =>
      resumes.push(resume),
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits the hidden duration once the tab is visible again', () => {
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS);

    expect(resumes).toEqual([{ sleptMs: 60_000 }]);
  });

  it('debounces visible + online + bfcache restore into one resume', () => {
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new Event('online'));
    const pageshow = new Event('pageshow');
    Object.assign(pageshow, { persisted: true });
    window.dispatchEvent(pageshow);
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS);

    expect(resumes).toHaveLength(1);
  });

  it('ignores a non-persisted pageshow (first load)', () => {
    const pageshow = new Event('pageshow');
    Object.assign(pageshow, { persisted: false });
    window.dispatchEvent(pageshow);
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS);

    expect(resumes).toEqual([]);
  });

  it('reports zero sleep for online without hiding', () => {
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS);

    expect(resumes).toEqual([{ sleptMs: 0 }]);
  });
});
