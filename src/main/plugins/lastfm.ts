export default class lastfm {
  /**
   * Base Plugin Information
   */
  public name: string = "LastFM Plugin";
  public version: string = "2.0.0";
  public author: string = "Core (Cider Collective)";

  private _apiCredentials = {
    key: "f9986d12aab5a0fe66193c559435ede3",
    secret: "acba3c29bd5973efa38cc2f0b63cc625",
  };
  /**
   * Plugin Initialization
   */
  private _lfm: any = null;
  private _authenticated: boolean = false;
  private _scrobbleDelay: any = null;
  private _utils: any = null;
  private _scrobbleCache: any = {};
  private _nowPlayingCache: any = {};

  /**
   * Public Methods
   */

  constructor(utils: any) {
    this._utils = utils;
  }

  onReady(_win: Electron.BrowserWindow): void {
    this.initializeLastFM("", this._apiCredentials);

    // Register the ipcMain handlers
    this._utils.getIPCMain().handle("lastfm:url", (event: any) => {
      console.debug(`[${lastfm.name}:url] Called.`);
      return this._lfm.getAuthenticationUrl({ cb: "cider://auth/lastfm" });
    });

    this._utils.getIPCMain().on("lastfm:auth", (event: any, token: string) => {
      console.debug(`[${lastfm.name}:auth] Token: `, token);
      this.authenticateLastFM(token);
    });

    this._utils.getIPCMain().on("lastfm:disconnect", (_event: any) => {
      this._lfm.setSessionCredentials(null, null);
      this._authenticated = false;
      console.debug(`[${lastfm.name}:disconnect] Disconnected`);
    });

    this._utils.getIPCMain().on("lastfm:nowPlayingChange", (event: any, attributes: any) => {
      if (this._utils.getStoreValue("connectivity.lastfm.filter_loop") || this._utils.getStoreValue("general.privateEnabled")) return;
      this.updateNowPlayingTrack(attributes);
    });

    this._utils.getIPCMain().on("lastfm:scrobbleTrack", (event: any, attributes: any) => {
      if (this._utils.getStoreValue("general.privateEnabled")) return;
      this.scrobbleTrack(attributes);
    });
  }

  /**
   * Runs on playback State Change
   * @param attributes Music Attributes (attributes.status = current state)
   */
  onPlaybackStateDidChange(attributes: object): void {}

  /**
   * Runs on song change
   * @param attributes Music Attributes
   * @param scrobble
   */
  onNowPlayingItemDidChange(attributes: any, scrobble = false): void {
    if (this._utils.getStoreValue("general.privateEnabled")) return;
    this.updateNowPlayingTrack(attributes);
  }

  /**
   * Initialize LastFM
   * @param token
   * @param api
   * @private
   */
  private initializeLastFM(token: string, api: { key: string; secret: string }): void {
    console.debug(`[${lastfm.name}:initialize] Initializing LastFM`);
    const LastfmAPI = require("lastfmapi");
    this._lfm = new LastfmAPI({
      api_key: api.key,
      secret: api.secret,
    });

    if (this._utils.getStoreValue("connectivity.lastfm.secrets.username") && this._utils.getStoreValue("connectivity.lastfm.secrets.key")) {
      this._lfm.setSessionCredentials(this._utils.getStoreValue("connectivity.lastfm.secrets.username"), this._utils.getStoreValue("connectivity.lastfm.secrets.key"));
      this._authenticated = true;
    } else {
      this.authenticateLastFM(token);
    }
  }

  /**
   * Authenticate the user with the given token
   * @param token
   * @private
   */
  private authenticateLastFM(token: string): void {
    if (!token) return;
    this._lfm.authenticate(token, (err: any, session: any) => {
      if (err) {
        console.error(`[${lastfm.name}:authenticate] Error: ${typeof err === "string" ? err : err.message}`);

        this._utils.getWindow().webContents.executeJavaScript(`app.notyf.error("${err.message}");`);
        return;
      }
      this._utils.getWindow().webContents.send("lastfm:authenticated", session);
      this._authenticated = true;
      console.debug(`[${lastfm.name}:authenticate] Authenticated as ${session.username}`);
    });
  }

  /**
   * Verifies the track information with lastfm
   * @param attributes
   * @param callback
   * @private
   */
  private verifyTrack(attributes: any, callback: Function): void {
    if (!attributes) return attributes;

    if (!attributes.lfmAlbum) {
      this._lfm.album.getInfo(
        {
          artist: attributes.primaryArtist,
          album: attributes.albumName,
        },
        (err: any, data: any) => {
          if (err) {
            console.error(`[${lastfm.name}] [album.getInfo] Error: ${typeof err === "string" ? err : err.message}`);
            return {};
          }
          if (data) {
            attributes.lfmAlbum = data;
            callback(attributes);
          }
        }
      );
    } else {
      this._lfm.track.getCorrection(attributes.primaryArtist, attributes.name, (err: any, data: any) => {
        if (err) {
          console.error(`[${lastfm.name}] [track.getCorrection] Error: ${typeof err === "string" ? err : err.message}`);
          return {};
        }
        if (data) {
          attributes.lfmTrack = data.correction.track;
          callback(attributes);
        }
      });
    }
  }

  /**
   * Scrobbles the track to lastfm
   * @param attributes
   * @private
   */
  private scrobbleTrack(attributes: any): void {
    if (!attributes?.lfmTrack || !attributes?.lfmAlbum) {
      this.verifyTrack(attributes, (a: any) => {
        this.scrobbleTrack(a);
      });
      return;
    }

    if (
      !this._authenticated ||
      !attributes ||
      this._utils.getStoreValue("connectivity.lastfm.filter_types")[attributes.playParams.kind] ||
      (this._utils.getStoreValue("connectivity.lastfm.filter_loop") && this._scrobbleCache.track === attributes.lfmTrack.name)
    )
      return;

    // Scrobble
    const scrobble = {
      artist: attributes.lfmTrack.artist.name,
      track: attributes.lfmTrack.name,
      album: attributes.lfmAlbum.name,
      albumArtist: attributes.lfmAlbum.artist,
      timestamp: new Date().getTime() / 1000,
      trackNumber: attributes.trackNumber,
      duration: attributes.durationInMillis / 1000,
    };

    // Easy Debugging
    console.debug(`[${lastfm.name}:scrobble] Scrobbling ${scrobble.artist} - ${scrobble.track}`);

    // Scrobble the track
    this._lfm.track.scrobble(scrobble, (err: any, _res: any) => {
      if (err) {
        console.error(`[${lastfm.name}:scrobble] Scrobble failed: ${err.message}`);
      } else {
        console.debug(`[${lastfm.name}:scrobble] Track scrobbled: ${scrobble.artist} - ${scrobble.track}`);
        this._scrobbleCache = scrobble;
      }
    });
  }

  /**
   * Updates the now playing track
   * @param attributes
   * @private
   */
  private updateNowPlayingTrack(attributes: any): void {
    if (!attributes?.lfmTrack || !attributes?.lfmAlbum) {
      this.verifyTrack(attributes, (a: any) => {
        this.updateNowPlayingTrack(a);
      });
      return;
    }

    if (
      !this._authenticated ||
      !attributes ||
      this._utils.getStoreValue("connectivity.lastfm.filter_types")[attributes.playParams.kind] ||
      (this._utils.getStoreValue("connectivity.lastfm.filter_loop") && this._nowPlayingCache.track === attributes.lfmTrack.name)
    )
      return;

    const nowPlaying = {
      artist: attributes.lfmTrack.artist.name,
      track: attributes.lfmTrack.name,
      album: attributes.lfmAlbum.name,
      trackNumber: attributes.trackNumber,
      duration: attributes.durationInMillis / 1000,
      albumArtist: attributes.lfmAlbum.artist,
    };

    this._lfm.track.updateNowPlaying(nowPlaying, (err: any, res: any) => {
      if (err) {
        console.error(`[${lastfm.name}:updateNowPlaying] Now Playing Update failed: ${err.message}`);
      } else {
        console.debug(`[${lastfm.name}:updateNowPlaying] Now Playing Updated: ${nowPlaying.artist} - ${nowPlaying.track}`);
        this._nowPlayingCache = nowPlaying;
      }
    });
  }
}
