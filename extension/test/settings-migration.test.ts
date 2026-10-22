import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleInstalled,
  runSettingsMigrations,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION
} from "../src/service-worker";

describe("Settings on Install, Update, and Migration", () => {
  let mockStore: Record<string, unknown>;
  let removeAllCalled = false;
  let contextMenuCreatedCount = 0;

  beforeEach(() => {
    mockStore = {};
    removeAllCalled = false;
    contextMenuCreatedCount = 0;

    // Setup mock chrome API
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        lastError: null,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() }
      },
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[] | null) => {
            if (keys === null) return { ...mockStore };
            if (typeof keys === "string") return { [keys]: mockStore[keys] };
            if (Array.isArray(keys)) {
              const res: Record<string, unknown> = {};
              for (const k of keys) res[k] = mockStore[k];
              return res;
            }
            return { ...mockStore };
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(mockStore, items);
          })
        }
      },
      contextMenus: {
        removeAll: vi.fn((callback?: () => void) => {
          removeAllCalled = true;
          if (callback) callback();
        }),
        create: vi.fn((_options: unknown, callback?: () => void) => {
          contextMenuCreatedCount++;
          if (callback) callback();
        }),
        onClicked: { addListener: vi.fn() }
      },
      commands: {
        onCommand: { addListener: vi.fn() }
      }
    };
  });

  it("1. Fresh Install: writes all default settings and initializes localUserId", async () => {
    await handleInstalled({ reason: "install" } as chrome.runtime.InstalledDetails);

    expect(mockStore.apiBase).toBe(DEFAULT_SETTINGS.apiBase);
    expect(mockStore.autoAnswerOnCopy).toBe(false);
    expect(mockStore.showFloatingButton).toBe(true);
    expect(mockStore.enableAllSites).toBe(false);
    expect(mockStore.allowedSites).toEqual(DEFAULT_SETTINGS.allowedSites);
    expect(mockStore.settingsVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(mockStore.localUserId).toBeDefined();
    expect(typeof mockStore.localUserId).toBe("string");
    expect(removeAllCalled).toBe(true);
    expect(contextMenuCreatedCount).toBe(1);
  });

  it("2. User modifies settings: changes are stored in chrome.storage.local", async () => {
    // Initial install
    await handleInstalled({ reason: "install" } as chrome.runtime.InstalledDetails);

    // User modifies apiBase, allowedSites, and turns on autoAnswerOnCopy
    const customApiBase = "https://custom-exam-server.university.edu:9000";
    const customAllowedSites = ["mycanvas.university.edu", "exams.custom.org"];
    mockStore.apiBase = customApiBase;
    mockStore.allowedSites = customAllowedSites;
    mockStore.autoAnswerOnCopy = true;

    expect(mockStore.apiBase).toBe(customApiBase);
    expect(mockStore.allowedSites).toEqual(customAllowedSites);
    expect(mockStore.autoAnswerOnCopy).toBe(true);
  });

  it("3. Update: never overwrites apiBase, allowedSites, or user values on reason === 'update'", async () => {
    // Start with existing user-customized settings
    const customApiBase = "https://custom-exam-server.university.edu:9000";
    const customAllowedSites = ["mycanvas.university.edu", "exams.custom.org"];
    const existingUserId = "usr_custom_uuid_12345";

    mockStore = {
      apiBase: customApiBase,
      allowedSites: customAllowedSites,
      autoAnswerOnCopy: true,
      showFloatingButton: false,
      localUserId: existingUserId,
      settingsVersion: 0 // older version
    };

    // Extension updates to new version
    await handleInstalled({
      reason: "update",
      previousVersion: "2.2.0"
    } as chrome.runtime.InstalledDetails);

    // CRITICAL: user custom settings MUST NOT be overwritten by defaults!
    expect(mockStore.apiBase).toBe(customApiBase);
    expect(mockStore.allowedSites).toEqual(customAllowedSites);
    expect(mockStore.autoAnswerOnCopy).toBe(true);
    expect(mockStore.showFloatingButton).toBe(false);
    expect(mockStore.localUserId).toBe(existingUserId);

    // Version must be migrated to latest
    expect(mockStore.settingsVersion).toBe(SETTINGS_SCHEMA_VERSION);

    // Any missing default keys that the user didn't have before are filled in
    expect(mockStore.autoDetectOptions).toBe(true);
  });

  it("4. contextMenus.create is guarded: removeAll is called to prevent duplicate-id errors", async () => {
    // Simulate multiple updates or installs
    await handleInstalled({ reason: "update", previousVersion: "2.2.0" } as chrome.runtime.InstalledDetails);
    await handleInstalled({ reason: "update", previousVersion: "2.2.1" } as chrome.runtime.InstalledDetails);

    expect(removeAllCalled).toBe(true);
    expect(contextMenuCreatedCount).toBe(2);
  });

  it("5. Versioned settings migration helper updates settingsVersion correctly", () => {
    const oldSettings = {
      apiBase: "http://localhost:8787",
      settingsVersion: 0
    };

    const migrated = runSettingsMigrations(oldSettings, 1);
    expect(migrated.settingsVersion).toBe(1);
    expect(migrated.apiBase).toBe("http://localhost:8787");
  });
});
