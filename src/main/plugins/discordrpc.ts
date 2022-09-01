import { AutoClient } from "discord-auto-rpc";
import { ipcMain } from "electron";
import fetch from "electron-fetch";

export default class DiscordRPC {
  /**
   * Base Plugin Details (Eventually implemented into a GUI in settings)
   */
  public name: string = "Discord Rich Presence";
  public description: string = "Discord RPC plugin for Cider";
  public version: string = "1.1.0";
  public author: string = "vapormusic/Core (Cider Collective)";

  /**
   * Private variables for interaction in plugins
   */
  private _utils: any;
  private _attributes: any;
  private ready: boolean = false;

  /**
   * Plugin Initialization
   */
  private _client: any = null;
  private _activityCache: any = {
    details: "",
    state: "",
    largeImageKey: "",
    largeImageText: "",
    smallImageKey: "",
    smallImageText: "",
    instance: false,
  };

  /*******************************************************************************************
   * Public Methods
   * ****************************************************************************************/

  /**
   * Runs on plugin load (Currently run on application start)
   */
  constructor(utils: any) {
    this._utils = utils;
    console.debug(`[Plugin][${this.name}] Loading Complete.`);
  }

  /**
   * Runs on app ready
   */
  onReady(_win: any): void {
    this.connect();
    console.debug(`[Plugin][${this.name}] Ready.`);
  }

  /**
   * Set up ipc listeners for the plugin
   */
  onRendererReady() {
    const self = this;
    ipcMain.on("discordrpc:updateImage", async (_event, imageurl) => {
      if (!this._utils.getStoreValue("general.privateEnabled")) {
        let b64data = "";
        let postbody = "";
        if (imageurl.startsWith("/ciderlocalart")) {
          let port = await this._utils.getWindow().webContents.executeJavaScript(`app.clientPort`);
          console.log("http://localhost:" + port + imageurl);
          const response = await fetch("http://localhost:" + port + imageurl);
          b64data = (await response.buffer()).toString("base64");
          postbody = JSON.stringify({ data: b64data });
          fetch("https://api.cider.sh/v1/images", {
            method: "POST",
            body: postbody,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": this._utils.getWindow().webContents.getUserAgent(),
            },
          })
            .then((res) => res.json())
            .then(function (json) {
              self._attributes["artwork"]["url"] = json.url;
              self.setActivity(self._attributes);
            });
        } else {
          postbody = JSON.stringify({ url: imageurl });
          fetch("https://api.cider.sh/v1/images", {
            method: "POST",
            body: postbody,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": this._utils.getWindow().webContents.getUserAgent(),
            },
          })
            .then((res) => res.json())
            .then(function (json) {
              self._attributes["artwork"]["url"] = json.url;
              self.setActivity(self._attributes);
            });
        }
      }
    });
    ipcMain.on("discordrpc:reload", (_event, configUpdate = null) => {
      console.log(`[DiscordRPC][reload] Reloading DiscordRPC.`);

      if (this._client) {
        this._client.destroy();
      }

      if (!this._utils.getStoreValue("connectivity.discord_rpc.enabled")) return;
      this._client
        .endlessLogin({
          clientId: this._utils.getStoreValue("connectivity.discord_rpc.client") === "Cider" ? "911790844204437504" : "886578863147192350",
        })
        .then(() => {
          console.log(`[DiscordRPC][reload] DiscordRPC Reloaded.`);
          this.ready = true;
          if (configUpdate == null) this._utils.getWindow().webContents.send("rpcReloaded", this._client.user);
          if (this._activityCache && this._activityCache.details && this._activityCache.state) {
            console.info(`[DiscordRPC][reload] Restoring activity cache.`);
            this._client.setActivity(this._activityCache);
          }
        })
        .catch((e: any) => console.error(`[DiscordRPC][reload] ${e}`));
      // this.connect(true)
    });
    ipcMain.on("onPrivacyModeChange", (_event, enabled) => {
      if (enabled && this._client) {
        this._client.clearActivity();
      } else if (!enabled && this._activityCache && this._activityCache.details && this._activityCache.state) {
        this._client.setActivity(this._activityCache);
      }
    });
  }

  /**
   * Runs on app stop
   */
  onBeforeQuit(): void {
    console.debug(`[Plugin][${this.name}] Stopped.`);
  }

  /**
   * Runs on playback State Change
   * @param attributes Music Attributes (attributes.status = current state)
   */
  onPlaybackStateDidChange(attributes: object): void {
    this._attributes = attributes;
    this.setActivity(attributes);
  }

  /**
   * Runs on song change
   * @param attributes Music Attributes
   */
  onNowPlayingItemDidChange(attributes: object): void {
    this._attributes = attributes;
    this.setActivity(attributes);
  }

  /*******************************************************************************************
   * Private Methods
   * ****************************************************************************************/

  /**
   * Connect to Discord RPC
   * @private
   */
  private connect() {
    if (!this._utils.getStoreValue("connectivity.discord_rpc.enabled")) {
      return;
    }

    // Create the client
    this._client = new AutoClient({ transport: "ipc" });

    // Runs on Ready
    this._client.once("ready", () => {
      console.info(`[DiscordRPC][connect] Successfully Connected to Discord. Authed for user: ${this._client.user.id}.`);

      if (this._activityCache && this._activityCache.details && this._activityCache.state && !this._utils.getStoreValue("general.privateEnabled")) {
        console.info(`[DiscordRPC][connect] Restoring activity cache.`);
        this._client.setActivity(this._activityCache);
      }
    });

    // Login to Discord
    this._client
      .endlessLogin({
        clientId: this._utils.getStoreValue("connectivity.discord_rpc.client") === "Cider" ? "911790844204437504" : "886578863147192350",
      })
      .then(() => {
        this.ready = true;
      })
      .catch((e: any) => console.error(`[DiscordRPC][connect] ${e}`));
  }

  /**
   * Sets the activity
   * @param attributes Music Attributes
   */
  private setActivity(attributes: any) {
    if (!this._client) {
      return;
    }

    // Check if show buttons is (true) or (false)
    let activity: Object = {
      details: this._utils.getStoreValue("connectivity.discord_rpc.details_format"),
      state: this._utils.getStoreValue("connectivity.discord_rpc.state_format"),
      largeImageKey: attributes?.artwork?.url?.replace("{w}", "1024").replace("{h}", "1024"),
      largeImageText: attributes.albumName,
      instance: false, // Whether the activity is in a game session
    };

    // Filter the activity
    activity = this.filterActivity(activity, attributes);

    if (!this.ready) {
      this._activityCache = activity;
      return;
    }

    if (!attributes.status && this._utils.getStoreValue("connectivity.discord_rpc.clear_on_pause")) {
      this._client.clearActivity();
    } else if (activity && this._activityCache !== activity) {
      if (this._utils.getStoreValue("general.privateEnabled")) return;
      this._client.setActivity(activity);
    }
    this._activityCache = activity;
  }

  /**
   * Filter the Discord activity object
   */
  private filterActivity(activity: any, attributes: any): Object {
    // Add the buttons if people want them
    if (!this._utils.getStoreValue("connectivity.discord_rpc.hide_buttons")) {
      activity.buttons = [
        { label: "Listen on Cider", url: attributes.url.cider },
        { label: "View on Apple Music", url: attributes.url.appleMusic },
      ]; //To change attributes.url => preload/cider-preload.js
    }

    // Add the timestamp if its playing and people want them
    if (!this._utils.getStoreValue("connectivity.discord_rpc.hide_timestamp") && attributes.status) {
      activity.startTimestamp = Date.now() - (attributes?.durationInMillis - attributes?.remainingTime);
      activity.endTimestamp = attributes.endTime;
    }

    // If the user wants to keep the activity when paused
    if (!this._utils.getStoreValue("connectivity.discord_rpc.clear_on_pause")) {
      activity.smallImageKey = attributes.status ? "play" : "pause";
      activity.smallImageText = attributes.status ? "Playing" : "Paused";
    }

    /**
     * Works with:
     * {artist}
     * {composer}
     * {title}
     * {album}
     * {trackNumber}
     */
    const rpcVars: any = {
      artist: attributes.artistName,
      composer: attributes.composerName,
      title: attributes.name,
      album: attributes.albumName,
      trackNumber: attributes.trackNumber,
    };

    // Replace the variables
    Object.keys(rpcVars).forEach((key) => {
      if (activity.details.includes(`{${key}}`)) {
        activity.details = activity.details.replace(`{${key}}`, rpcVars[key]);
      }
      if (activity.state.includes(`{${key}}`)) {
        activity.state = activity.state.replace(`{${key}}`, rpcVars[key]);
      }
    });

    // Checks if the details is greater than 128 because some songs can be that long
    if (activity.details && activity.details.length >= 128) {
      activity.details = activity.details.substring(0, 125) + "...";
    }

    // Checks if the state is greater than 128 because some songs can be that long
    if (activity.state && activity.state.length >= 128) {
      activity.state = activity.state.substring(0, 125) + "...";
    }

    // Checks if the state is greater than 128 because some songs can be that long
    if (activity.largeImageText && activity.largeImageText.length >= 128) {
      activity.largeImageText = activity.largeImageText.substring(0, 125) + "...";
    }

    // Check large image
    if (activity.largeImageKey == null || activity.largeImageKey === "" || activity.largeImageKey.length > 256) {
      activity.largeImageKey = "cider";
    }

    // Timestamp
    if (new Date(attributes.endTime).getTime() < 0) {
      delete activity.startTime;
      delete activity.endTime;
    }

    // not sure
    if (!attributes.artistName) {
      delete activity.state;
    }

    if (!activity.largeImageText || activity.largeImageText.length < 2) {
      delete activity.largeImageText;
    }
    return activity;
  }
}
