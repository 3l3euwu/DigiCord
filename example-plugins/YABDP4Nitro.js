DigiCord.registerPlugin({
    name: "DigiTro",
    description: "Unlock Nitro features: emoji bypass, screen sharing, stickers, client themes, and more!",
    authors: [{ name: "DigiCord Native", id: 0 }],

    settings: {
        def: {
            emojiBypass: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Enable cross-server emoji bypass",
                default: true,
            },
            emojiBypassType: {
                type: DigiCord.OptionType.SELECT,
                description: "Emoji bypass output format",
                default: 3,
                options: [
                    { label: "Hyperlink markdown [name](url)", value: 3 },
                    { label: "Raw URL", value: 2 },
                ],
            },
            emojiSize: {
                type: DigiCord.OptionType.SELECT,
                description: "Size of bypassed emojis in pixels",
                default: 64,
                options: [
                    { label: "32px", value: 32 },
                    { label: "48px", value: 48 },
                    { label: "64px", value: 64 },
                    { label: "128px", value: 128 },
                ],
            },
            screenSharing: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock high quality screen sharing (1080p/60fps)",
                default: true,
            },
            screenFps: {
                type: DigiCord.OptionType.STRING,
                description: "Custom screen share FPS",
                default: "60",
            },
            stickerBypass: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Enable cross-server sticker bypass",
                default: false,
            },
            clientThemes: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock gradient client themes",
                default: true,
            },
            experiments: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock Discord experiments tab",
                default: false,
            },
        }
    },

    _cleanup: null,

    start() {
        console.log("%c[YABDP4Nitro]", "color:#e74c3c;font-weight:bold", "Starting...");
        const s = this.store;
        const W = DigiCord.Webpack;
        const patches = [];

        const patch = (obj, method, replacer) => {
            if (!obj || typeof obj[method] !== "function") return false;
            const orig = obj[method];
            obj[method] = replacer(orig);
            patches.push(() => { try { obj[method] = orig; } catch (e) {} });
            return true;
        };

        if (s.emojiBypass) {
            W.waitFor(
                m => typeof m.isEmojiFilteredOrLocked === "function",
                (mod) => { patch(mod, "isEmojiFilteredOrLocked", () => () => false); },
                { timeout: 60000 }
            );
            W.waitFor(
                m => typeof m.isEmojiDisabled === "function",
                (mod) => { patch(mod, "isEmojiDisabled", () => () => false); },
                { timeout: 60000 }
            );
            W.waitFor(
                m => typeof m.isEmojiPremiumLocked === "function",
                (mod) => { patch(mod, "isEmojiPremiumLocked", () => () => false); },
                { timeout: 60000 }
            );
            W.waitFor(
                m => typeof m.getEmojiUnavailableReason === "function",
                (mod) => { patch(mod, "getEmojiUnavailableReason", () => () => undefined); },
                { timeout: 60000 }
            );

            const emojiListener = (channelId, messageObj) => {
                if (!s.emojiBypass) return;
                const content = messageObj?.content;
                if (!content) return;
                const replaced = content
                    .replace(/<a?:(\w+):(\d+)>/g, (match, name, id) => {
                        const anim = match.startsWith("<a:");
                        const url = `https://cdn.discordapp.com/emojis/${id}.${anim ? "gif" : "png"}?size=${s.emojiSize || 64}&quality=lossless`;
                        return s.emojiBypassType === 3 ? `[${name}](${url})` : url;
                    });
                if (replaced !== content) messageObj.content = replaced;
            };
            DigiCord.MessageEvents.addPreSendListener(emojiListener);
            patches.push(() => DigiCord.MessageEvents.removePreSendListener(emojiListener));
        }

        if (s.screenSharing) {
            W.waitFor(
                m => {
                    if (typeof m !== "object" || !m) return false;
                    for (const k of Object.keys(m)) {
                        const v = m[k];
                        if (v?.prototype && typeof v.prototype.updateVideoQuality === "function") return true;
                    }
                    return false;
                },
                (mod) => {
                    for (const k of Object.keys(mod)) {
                        const proto = mod[k]?.prototype;
                        if (proto && typeof proto.updateVideoQuality === "function") {
                            patch(proto, "updateVideoQuality", (orig) => function (e) {
                                try {
                                    if (e?.videoStreamParameters?.[0]) {
                                        const p = e.videoStreamParameters[0];
                                        p.maxFrameRate = parseInt(s.screenFps) || 60;
                                        const res = 1440;
                                        p.maxResolution = { width: Math.round(res * 16 / 9), height: res };
                                    }
                                } catch (err) {}
                                return orig.call(this, e);
                            });
                        }
                    }
                },
                { timeout: 60000 }
            );
        }

        if (s.stickerBypass) {
            W.waitFor(
                m => typeof m.getStickerSendability === "function",
                (mod) => { patch(mod, "getStickerSendability", () => () => 0); },
                { timeout: 60000 }
            );
            W.waitFor(
                m => typeof m.isSendableSticker === "function",
                (mod) => { patch(mod, "isSendableSticker", () => () => true); },
                { timeout: 60000 }
            );
        }

        if (s.clientThemes) {
            const themesMod = W.find(m => typeof m.isPreview === "boolean");
            if (themesMod) {
                try {
                    Object.defineProperty(themesMod, "isPreview", { get: () => false, set: () => {}, configurable: true });
                } catch (e) {}
            }
        }

        if (s.experiments) {
            try {
                const user = DigiCord.Stores?.UserStore?.getCurrentUser?.();
                if (user) {
                    user.flags = (user.flags || 0) | 1;
                    DigiCord.FluxDispatcher?.dispatch?.({ type: "CONNECTION_OPEN", user });
                }
            } catch (e) {}
        }

        this._cleanup = () => { for (const fn of patches) try { fn(); } catch (e) {} };
        console.log("%c[YABDP4Nitro]", "color:#e74c3c;font-weight:bold", "Started");
    },

    stop() {
        console.log("%c[YABDP4Nitro]", "color:#e74c3c;font-weight:bold", "Stopping...");
        if (this._cleanup) this._cleanup();
        this._cleanup = null;
        console.log("%c[YABDP4Nitro]", "color:#e74c3c;font-weight:bold", "Stopped");
    },
});
