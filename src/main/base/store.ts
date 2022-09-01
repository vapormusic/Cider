import * as ElectronStore from "electron-store";
import { app, ipcMain } from "electron";
import fetch from "electron-fetch";
import { existsSync } from "fs";
import { join } from "path";
import { utils } from "./utils";

export class Store {
  static cfg: ElectronStore;

  private defaults: any = {
    main: {
      PLATFORM: process.platform,
      UPDATABLE: app.isPackaged && (!process.mas || !process.windowsStore || !process.env.FLATPAK_ID),
    },
    general: {
      close_button_hide: false,
      language: "en_US",
      playbackNotifications: true,
      resumeOnStartupBehavior: "local",
      privateEnabled: false,
      themeUpdateNotification: true,
      sidebarItems: {
        recentlyAdded: true,
        songs: true,
        albums: true,
        artists: true,
        videos: true,
        podcasts: true,
      },
      sidebarCollapsed: {
        cider: false,
        applemusic: false,
        library: false,
        amplaylists: false,
        playlists: false,
        localLibrary: false,
      },
      onStartup: {
        enabled: false,
        hidden: false,
      },
      resumeTabs: {
        tab: "home",
        dynamicData: "",
      },
      keybindings: {
        search: ["CommandOrControl", "F"],
        listnow: ["CommandOrControl", "L"],
        browse: ["CommandOrControl", "B"],
        recentAdd: ["CommandOrControl", "G"],
        songs: ["CommandOrControl", "J"],
        albums: ["CommandOrControl", process.platform == "darwin" ? "Option" : process.platform == "linux" ? "Shift" : "Alt", "A"],
        artists: ["CommandOrControl", "D"],
        togglePrivateSession: ["CommandOrControl", "P"],
        webRemote: ["CommandOrControl", process.platform == "darwin" ? "Option" : process.platform == "linux" ? "Shift" : "Alt", "W"],
        audioSettings: ["CommandOrControl", process.platform == "darwin" ? "Option" : process.platform == "linux" ? "Shift" : "Alt", "A"],
        pluginMenu: ["CommandOrControl", process.platform == "darwin" ? "Option" : process.platform == "linux" ? "Shift" : "Alt", "P"],
        castToDevices: ["CommandOrControl", process.platform == "darwin" ? "Option" : process.platform == "linux" ? "Shift" : "Alt", "C"],
        settings: [
          "CommandOrControl", // Who the hell uses a different key for this? Fucking Option?
          ",",
        ],
        zoomn: ["Control", "numadd"],
        zoomt: ["Control", "numsub"],
        zoomrst: ["Control", "num0"],
        openDeveloperTools: ["CommandOrControl", "Shift", "I"],
      },
      showLovedTracksInline: true,
    },
    connectivity: {
      discord_rpc: {
        enabled: true,
        client: "Cider",
        clear_on_pause: true,
        hide_buttons: false,
        hide_timestamp: false,
        state_format: "by {artist}",
        details_format: "{title}",
      },
      lastfm: {
        enabled: false,
        scrobble_after: 50,
        filter_loop: false,
        filter_types: {},
        remove_featured: true,
        secrets: {
          username: "",
          key: "",
        },
      },
    },
    home: {
      followedArtists: [],
      favoriteItems: [],
    },
    libraryPrefs: {
      songs: {
        scroll: "paged",
        sort: "name",
        sortOrder: "asc",
        size: "normal",
      },
      albums: {
        scroll: "paged",
        sort: "name",
        sortOrder: "asc",
        viewAs: "covers",
      },
      playlists: {
        scroll: "infinite",
      },
      localPaths: [],
      pageSize: 250,
    },
    audio: {
      volume: 1,
      volumeStep: 0.05,
      maxVolume: 1,
      lastVolume: 1,
      muted: false,
      playbackRate: 1,
      quality: "HIGH",
      seamless_audio: true,
      normalization: true,
      dBSPL: false,
      dBSPLcalibration: 90,
      maikiwiAudio: {
        ciderPPE: true,
        ciderPPE_value: "MAIKIWI",
        staticOptimizer: {
          state: false,
          lock: false,
        },
        opportunisticCorrection_state: "OFF",
        atmosphereRealizer1: false,
        atmosphereRealizer1_value: "NATURAL_STANDARD",
        atmosphereRealizer2: false,
        atmosphereRealizer2_value: "NATURAL_STANDARD",
        spatial: false,
        spatialProfile: "BPLK",
        vibrantBass: {
          // Hard coded into the app. Don't include any of this config into exporting presets in store.ts
          frequencies: [17.182, 42.169, 53.763, 112.69, 119.65, 264.59, 336.57, 400.65, 505.48, 612.7, 838.7, 1155.3, 1175.6, 3406.8, 5158.6, 5968.1, 6999.9, 7468.6, 8862.9, 9666, 10109],
          Q: [2.5, 0.388, 5, 5, 2.5, 7.071, 14.14, 10, 7.071, 14.14, 8.409, 0.372, 7.071, 10, 16.82, 7.071, 28.28, 20, 8.409, 40, 40],
          gain: [-0.34, 2.49, 0.23, -0.49, 0.23, -0.12, 0.32, -0.29, 0.33, 0.19, -0.18, -1.27, -0.11, 0.25, -0.18, -0.53, 0.34, 1.32, 1.78, 0.41, -0.28],
        },
      },
      spatial: false,
      spatial_properties: {
        presets: [],
        gain: 0.8,
        listener_position: [0, 0, 0],
        audio_position: [0, 0, 0],
        room_dimensions: {
          width: 32,
          height: 12,
          depth: 32,
        },
        room_materials: {
          left: "metal",
          right: "metal",
          front: "brick-bare",
          back: "brick-bare",
          down: "acoustic-ceiling-tiles",
          up: "acoustic-ceiling-tiles",
        },
      },
      equalizer: {
        preset: "default",
        frequencies: [32, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
        gain: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        Q: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        mix: 1,
        vibrantBass: 0,
        presets: [],
        userGenerated: false,
      },
    },
    visual: {
      theme: "",
      styles: [],
      scrollbars: 0, // 0 = show on hover, 2 = always hide, 3 = always show
      refresh_rate: 0,
      window_background_style: "none", // "none", "artwork", "color"
      animated_artwork: "limited", // 0 = always, 1 = limited, 2 = never
      animated_artwork_qualityLevel: 1,
      bg_artwork_rotation: false,
      hw_acceleration: "default", // default, webgpu, disabled
      showuserinfo: true,
      transparent: false,
      miniplayer_top_toggle: true,
      directives: {
        windowLayout: "twopanel",
      },
      windowControlPosition: 0, // 0 default right
      nativeTitleBar: false,
      windowColor: "#000000",
      customAccentColor: false,
      accentColor: "#fc3c44",
      purplePodcastPlaybackBar: false,
      maxElementScale: -1, // -1 default, anything else is a custom scale
    },
    lyrics: {
      enable_mxm: true,
      mxm_karaoke: false,
      mxm_language: "disabled",
      enable_qq: false,
      enable_yt: false,
    },
    advanced: {
      AudioContext: true,
      experiments: [],
      playlistTrackMapping: true,
      ffmpegLocation: "",
      disableLogging: true,
    },
    connectUser: {
      auth: null,
      sync: {
        themes: false,
        plugins: false,
        settings: false,
      },
    },
  };
  private migrations: any = {};
  private schema: ElectronStore.Schema<any> = {
    "connectivity.discord_rpc": {
      type: "object",
    },
  };

  constructor() {
    this.defaults.general.language = this.checkLocale(app.getLocale().replace("-", "_")) ?? "en_US";
    Store.cfg = new ElectronStore({
      name: "cider-config",
      defaults: this.defaults,
      schema: this.schema,
      migrations: this.migrations,
      clearInvalidConfig: false, //disabled for now
    });

    Store.cfg.set(this.mergeStore(this.defaults, Store.cfg.store));
    this.ipcHandler();
  }

  static pushToCloud(): void {
    if (Store.cfg.get("connectUser.auth") === null) return;
    var syncData = Object();
    if (Store.cfg.get("connectUser.sync.themes")) {
      syncData.push({
        themes: Store.cfg.store.themes,
      });
    }
    if (Store.cfg.get("connectUser.sync.plugins")) {
      syncData.push({
        plugins: Store.cfg.store.plugins,
      });
    }

    if (Store.cfg.get("connectUser.sync.settings")) {
      syncData.push({
        general: Store.cfg.get("general"),
        home: Store.cfg.get("home"),
        libraryPrefs: Store.cfg.get("libraryPrefs"),
        advanced: Store.cfg.get("advanced"),
      });
    }
    let postBody = {
      id: Store.cfg.get("connectUser.id"),
      app: app.getName(),
      version: app.isPackaged ? app.getVersion() : "dev",
      syncData: syncData,
    };

    fetch("https://connect.cidercollective.dev/api/v1/setttings/set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });
  }

  /**
   * Merge Configurations
   * @param target The target configuration
   * @param source The source configuration
   */
  private mergeStore = (target: { [x: string]: any }, source: { [x: string]: any }) => {
    // Iterate through `source` properties and if an `Object` set property to merge of `target` and `source` properties
    for (const key of Object.keys(source)) {
      if (key.includes("migrations")) {
        continue;
      }
      if (source[key] instanceof Array) {
        continue;
      }
      if (source[key] instanceof Object) Object.assign(source[key], this.mergeStore(target[key], source[key]));
    }
    // Join `target` and modified `source`
    Object.assign(target || {}, source);
    return target;
  };

  /**
   * IPC Handler
   */
  private ipcHandler(): void {
    ipcMain.handle("getStoreValue", (_event, key, defaultValue) => {
      return defaultValue ? Store.cfg.get(key, true) : Store.cfg.get(key);
    });

    ipcMain.handle("setStoreValue", (_event, key, value) => {
      Store.cfg.set(key, value);
    });

    ipcMain.on("getStore", (event) => {
      event.returnValue = Store.cfg.store;
    });

    ipcMain.on("setStore", (_event, store) => {
      Store.cfg.store = store;
    });
  }

  private checkLocale(language: string) {
    return existsSync(join(utils.getPath("i18nPath"), `${language}.json`)) ? language : "en_US";
  }
}
