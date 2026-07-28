type PauseListener = () => void;
type AudioListener = (enabled: boolean) => void;

type YouTubePlayablesApi = {
  IN_PLAYABLES_ENV: boolean;
  SDK_VERSION: string;
  game: {
    firstFrameReady: () => void;
    gameReady: () => void;
    loadData: () => Promise<string>;
    saveData: (data: string) => Promise<void>;
  };
  engagement: {
    sendScore: (score: { value: number }) => Promise<void>;
  };
  system: {
    isAudioEnabled: () => boolean;
    onAudioEnabledChange: (callback: AudioListener) => () => void;
    onPause: (callback: PauseListener) => () => void;
    onResume: (callback: PauseListener) => () => void;
  };
  health?: {
    logError?: () => void;
    logWarning?: () => void;
  };
};

declare global {
  const ytgame: YouTubePlayablesApi | undefined;
}

type ScheduledTask = {
  callback: () => void;
  remaining: number;
  dueAt: number;
  nativeId: ReturnType<typeof setTimeout> | null;
};

const CLOUD_RESTORE_DEADLINE_MS = 2400;

const blockedInteractionEvents = [
  "click",
  "contextmenu",
  "dblclick",
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchstart",
  "touchmove",
  "touchend",
  "wheel",
] as const;

class YouTubePlayablesRuntime {
  private readonly api =
    typeof ytgame !== "undefined" ? ytgame : undefined;

  private paused = false;
  private youtubeAudioEnabled = true;
  private pauseStartedAt = 0;
  private pausedDuration = 0;
  private nextTaskId = 1;
  private firstFrameSent = false;
  private gameReadySent = false;
  private cloudRestoreApplied = false;
  private cloudLoadSucceeded = false;
  private lastSubmittedScore = -1;
  private readonly cloudLoadPromise: Promise<string | null>;
  private saveChain = Promise.resolve();
  private readonly tasks = new Map<number, ScheduledTask>();
  private readonly pauseListeners = new Set<PauseListener>();
  private readonly resumeListeners = new Set<PauseListener>();
  private readonly audioListeners = new Set<AudioListener>();
  private readonly teardownCallbacks: Array<() => void> = [];

  constructor() {
    this.cloudLoadPromise = this.loadCloudDataFromYouTube();

    if (this.api) {
      try {
        this.youtubeAudioEnabled = this.api.IN_PLAYABLES_ENV
          ? this.api.system.isAudioEnabled()
          : true;
      } catch (error) {
        this.logWarning("Unable to read the initial YouTube audio state.", error);
        this.youtubeAudioEnabled = true;
      }

      try {
        this.teardownCallbacks.push(
          this.api.system.onPause(() => this.handlePause()),
          this.api.system.onResume(() => this.handleResume()),
          this.api.system.onAudioEnabledChange((enabled) =>
            this.handleAudioChange(enabled),
          ),
        );
      } catch (error) {
        this.logError("Unable to subscribe to YouTube Playables lifecycle.", error);
      }
    }

    document.documentElement.dataset.youtubePaused = "false";
    document.documentElement.dataset.youtubeAudio =
      this.youtubeAudioEnabled ? "enabled" : "muted";

    const blockInteraction = (event: Event) => {
      if (!this.paused) return;
      event.stopImmediatePropagation();
      if (!(event instanceof KeyboardEvent && event.key === "Escape")) {
        event.preventDefault();
      }
    };

    for (const eventName of blockedInteractionEvents) {
      window.addEventListener(eventName, blockInteraction, {
        capture: true,
        passive: false,
      });
      this.teardownCallbacks.push(() =>
        window.removeEventListener(eventName, blockInteraction, {
          capture: true,
        }),
      );
    }
  }

  get isPaused() {
    return this.paused;
  }

  get isAudioEnabled() {
    return this.youtubeAudioEnabled && !this.paused;
  }

  get isInPlayablesEnvironment() {
    return Boolean(this.api?.IN_PLAYABLES_ENV);
  }

  now() {
    const currentPause = this.paused
      ? performance.now() - this.pauseStartedAt
      : 0;
    return performance.now() - this.pausedDuration - currentPause;
  }

  onPause(listener: PauseListener) {
    this.pauseListeners.add(listener);
    if (this.paused) listener();
    return () => this.pauseListeners.delete(listener);
  }

  onResume(listener: PauseListener) {
    this.resumeListeners.add(listener);
    return () => this.resumeListeners.delete(listener);
  }

  onAudioChange(listener: AudioListener) {
    this.audioListeners.add(listener);
    listener(this.isAudioEnabled);
    return () => this.audioListeners.delete(listener);
  }

  schedule(callback: () => void, delayMs: number) {
    const id = this.nextTaskId++;
    const task: ScheduledTask = {
      callback,
      remaining: Math.max(0, delayMs),
      dueAt: 0,
      nativeId: null,
    };
    this.tasks.set(id, task);
    if (!this.paused) this.armTask(id, task);
    return id;
  }

  clearScheduled(id: number | null) {
    if (id === null) return;
    const task = this.tasks.get(id);
    if (!task) return;
    if (task.nativeId !== null) clearTimeout(task.nativeId);
    this.tasks.delete(id);
  }

  signalFirstFrameReady() {
    if (this.firstFrameSent || !this.api) return;
    try {
      this.api.game.firstFrameReady();
      this.firstFrameSent = true;
    } catch (error) {
      this.logError("YouTube rejected firstFrameReady().", error);
    }
  }

  signalGameReady() {
    if (
      this.gameReadySent ||
      !this.firstFrameSent ||
      !this.cloudRestoreApplied ||
      !this.api
    )
      return;
    try {
      this.api.game.gameReady();
      this.gameReadySent = true;
    } catch (error) {
      this.logError("YouTube rejected gameReady().", error);
    }
  }

  async getCloudData() {
    let deadlineId: ReturnType<typeof setTimeout> | null = null;
    try {
      const restoreDeadline = new Promise<null>((resolve) => {
        deadlineId = setTimeout(
          () => resolve(null),
          CLOUD_RESTORE_DEADLINE_MS,
        );
      });
      return await Promise.race([this.cloudLoadPromise, restoreDeadline]);
    } finally {
      if (deadlineId !== null) clearTimeout(deadlineId);
    }
  }

  markCloudRestoreApplied() {
    this.cloudRestoreApplied = true;
    this.signalGameReady();
  }

  async saveCloudData(serializedData: string) {
    await this.cloudLoadPromise;
    if (
      !this.api?.IN_PLAYABLES_ENV ||
      !this.cloudLoadSucceeded ||
      serializedData.length > 64 * 1024 ||
      !isWellFormed(serializedData)
    )
      return false;

    let saved = false;
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        await this.api!.game.saveData(serializedData);
        saved = true;
      })
      .catch((error) => {
        this.logWarning("YouTube cloud save failed.", error);
      });
    await this.saveChain;
    return saved;
  }

  sendScore(score: number) {
    if (!this.api?.IN_PLAYABLES_ENV || !Number.isFinite(score)) return;
    const integerScore = Math.max(
      0,
      Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(score)),
    );
    if (integerScore <= this.lastSubmittedScore) return;
    this.lastSubmittedScore = integerScore;
    void this.api.engagement
      .sendScore({ value: integerScore })
      .catch((error) => this.logWarning("YouTube score submission failed.", error));
  }

  destroy() {
    for (const task of this.tasks.values()) {
      if (task.nativeId !== null) clearTimeout(task.nativeId);
    }
    this.tasks.clear();
    for (const teardown of this.teardownCallbacks) teardown();
    this.teardownCallbacks.length = 0;
    this.pauseListeners.clear();
    this.resumeListeners.clear();
    this.audioListeners.clear();
  }

  private armTask(id: number, task: ScheduledTask) {
    task.dueAt = performance.now() + task.remaining;
    task.nativeId = setTimeout(() => {
      if (this.paused || !this.tasks.has(id)) return;
      this.tasks.delete(id);
      task.callback();
    }, task.remaining);
  }

  private async loadCloudDataFromYouTube() {
    if (!this.api?.IN_PLAYABLES_ENV) {
      this.cloudLoadSucceeded = false;
      return null;
    }
    try {
      const data = await this.api.game.loadData();
      this.cloudLoadSucceeded = true;
      return data;
    } catch (error) {
      this.cloudLoadSucceeded = false;
      this.logWarning("YouTube cloud load failed.", error);
      return null;
    }
  }

  private handlePause() {
    if (this.api && !this.api.IN_PLAYABLES_ENV) return;
    if (this.paused) return;
    this.paused = true;
    this.pauseStartedAt = performance.now();
    document.documentElement.dataset.youtubePaused = "true";
    document.documentElement.dataset.youtubeAudio = "muted";

    for (const task of this.tasks.values()) {
      if (task.nativeId === null) continue;
      clearTimeout(task.nativeId);
      task.nativeId = null;
      task.remaining = Math.max(0, task.dueAt - this.pauseStartedAt);
    }

    for (const listener of this.audioListeners) listener(false);
    for (const listener of this.pauseListeners) listener();
  }

  private handleResume() {
    if (this.api && !this.api.IN_PLAYABLES_ENV) return;
    if (!this.paused) return;
    const resumedAt = performance.now();
    this.pausedDuration += resumedAt - this.pauseStartedAt;
    this.paused = false;
    document.documentElement.dataset.youtubePaused = "false";
    document.documentElement.dataset.youtubeAudio =
      this.youtubeAudioEnabled ? "enabled" : "muted";

    for (const [id, task] of this.tasks) this.armTask(id, task);
    for (const listener of this.resumeListeners) listener();
    for (const listener of this.audioListeners) {
      listener(this.youtubeAudioEnabled);
    }
  }

  private handleAudioChange(enabled: boolean) {
    if (this.api && !this.api.IN_PLAYABLES_ENV) return;
    this.youtubeAudioEnabled = enabled;
    document.documentElement.dataset.youtubeAudio =
      enabled && !this.paused ? "enabled" : "muted";
    for (const listener of this.audioListeners) {
      listener(enabled && !this.paused);
    }
  }

  private logError(message: string, error: unknown) {
    void message;
    void error;
    this.api?.health?.logError?.();
  }

  private logWarning(message: string, error: unknown) {
    void message;
    void error;
    this.api?.health?.logWarning?.();
  }
}

function isWellFormed(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export const youtubePlayables = new YouTubePlayablesRuntime();

export const gameNow = () => youtubePlayables.now();
export const gameTimeout = (callback: () => void, delayMs: number) =>
  youtubePlayables.schedule(callback, delayMs);
export const clearGameTimeout = (id: number | null) =>
  youtubePlayables.clearScheduled(id);
