/*
 * YABDP4Nitro - Translated to DigiCord Native API
 * Original by Riolubruh (OSL-3.0)
 * Features: Emoji bypass, screen sharing quality, sticker bypass, client themes, profile accents
 */

const EmojiPattern = /<a?:(\w+):(\d+)>|:([a-zA-Z0-9_]+):/g;

DigiCord.registerPlugin({
    name: "YABDP4Nitro",
    description: "Unlock Nitro features: emoji bypass, screen sharing, stickers, client themes, and more!",
    authors: [{ name: "Riolubruh (translated)", id: 0 }],

    settings: {
        def: {
            emojiBypass: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Enable cross-server emoji bypass",
                default: true,
            },
            emojiBypassType: {
                type: DigiCord.OptionType.SELECT,
                description: "Emoji bypass method: Upload=attach as file, Hyperlink=markdown link, Classic=raw URL",
                default: 3,
                options: [
                    { label: "Upload as file", value: 0 },
                    { label: "Classic (raw URL)", value: 2 },
                    { label: "Hyperlink (Recommended)", value: 3 },
                ],
            },
            emojiSize: {
                type: DigiCord.OptionType.SELECT,
                description: "Size of bypassed emojis",
                default: 64,
                options: [
                    { label: "32px", value: 32 },
                    { label: "48px", value: 48 },
                    { label: "64px (Recommended)", value: 64 },
                    { label: "128px", value: 128 },
                ],
            },
            PNGemote: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Use PNG instead of WEBP for static emojis",
                default: true,
            },
            emojiBypassForValidEmoji: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Don't bypass emojis you can already use",
                default: true,
            },
            screenSharing: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock high quality screen sharing (1080p/60fps)",
                default: true,
            },
            CustomFPSEnabled: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Use custom FPS for screen sharing",
                default: false,
            },
            CustomFPS: {
                type: DigiCord.OptionType.STRING,
                description: "Custom screen share FPS",
                default: "60",
            },
            ResolutionEnabled: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Use custom resolution for screen sharing",
                default: false,
            },
            CustomResolution: {
                type: DigiCord.OptionType.STRING,
                description: "Custom screen share resolution (pixels)",
                default: "1440",
            },
            CustomBitrateEnabled: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Use custom bitrate for streams",
                default: false,
            },
            minBitrate: {
                type: DigiCord.OptionType.STRING,
                description: "Minimum bitrate in kbps (-1 = default)",
                default: "-1",
            },
            maxBitrate: {
                type: DigiCord.OptionType.STRING,
                description: "Maximum bitrate in kbps (-1 = default)",
                default: "-1",
            },
            targetBitrate: {
                type: DigiCord.OptionType.STRING,
                description: "Target bitrate in kbps (-1 = default)",
                default: "-1",
            },
            stickerBypass: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Enable cross-server sticker bypass",
                default: false,
            },
            forceStickersUnlocked: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Force all stickers to appear unlocked",
                default: false,
            },
            profileV2: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Show profile accents (gradient look) for all users",
                default: false,
            },
            clientThemes: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock gradient client themes",
                default: true,
            },
            changePremiumType: {
                type: DigiCord.OptionType.SELECT,
                description: "Override premium type on client side (advanced)",
                default: -1,
                options: [
                    { label: "Disabled (use real Nitro status)", value: -1 },
                    { label: "Free User", value: 0 },
                    { label: "Nitro Basic", value: 3 },
                    { label: "Nitro Classic", value: 1 },
                    { label: "Nitro", value: 2 },
                ],
            },
            videoCodec: {
                type: DigiCord.OptionType.SELECT,
                description: "Force a specific video codec for streams",
                default: -1,
                options: [
                    { label: "Default (automatic)", value: -1 },
                    { label: "AV1", value: 0 },
                    { label: "H265", value: 1 },
                    { label: "H264", value: 2 },
                    { label: "VP8", value: 3 },
                    { label: "VP9", value: 4 },
                ],
            },
            experiments: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Unlock Discord experiments tab (use at your own risk)",
                default: false,
            },
        }
    },

    _patches: [],
    _unsubscribes: [],
    _originalPremiumType: null,

    start() {
        this.logger = new DigiCord.Logger("YABDP4Nitro", "#e74c3c");

        // Store original premium type
        try {
            const UserStore = DigiCord.Stores?.UserStore;
            if (UserStore) {
                const user = UserStore.getCurrentUser?.();
                if (user) this._originalPremiumType = user.premiumType;
            }
        } catch (e) {}

        this.applyAll();
        DigiCord.UI?.showToast?.("YABDP4Nitro started!", 1);
        this.logger.info("YABDP4Nitro started!");
    },

    stop() {
        this.removeAllPatches();
        this.restorePremiumType();
        DigiCord.UI?.showToast?.("YABDP4Nitro stopped!", 1);
        this.logger.info("YABDP4Nitro stopped");
    },

    // ── Patch Management ──────────────────────────────────────────────
    patchModule(mod, method, replacer) {
        if (!mod || !mod[method]) return;
        const original = mod[method];
        mod[method] = replacer(original);
        this._patches.push({ mod, method, original });
    },

    removeAllPatches() {
        for (const p of this._patches) {
            if (p.mod && p.method) p.mod[p.method] = p.original;
        }
        this._patches = [];
        for (const unsub of this._unsubscribes) {
            try { unsub(); } catch (e) {}
        }
        this._unsubscribes = [];
    },

    // ── Apply All Features ────────────────────────────────────────────
    applyAll() {
        const s = this.settings;

        if (s.emojiBypass) this.applyEmojiBypass();
        if (s.screenSharing) this.applyScreenSharing();
        if (s.stickerBypass || s.forceStickersUnlocked) this.applyStickerUnlock();
        if (s.stickerBypass) this.applyStickerBypass();
        if (s.profileV2) this.applyProfileV2();
        if (s.clientThemes) this.applyClientThemes();
        if (s.changePremiumType > -1) this.applyPremiumType(s.changePremiumType);
        if (s.experiments) this.applyExperiments();
        if (s.videoCodec > -1) this.applyVideoCodec(s.videoCodec);
    },

    // ── 1. Emoji Bypass ──────────────────────────────────────────────
    applyEmojiBypass() {
        const s = this.settings;

        // Step 1: Unlock all emoji access checks
        const isEmojiAvail = DigiCord.Webpack?.findByProps?.("isEmojiFilteredOrLocked");
        if (isEmojiAvail) {
            const methods = ["isEmojiFilteredOrLocked", "isEmojiDisabled", "isEmojiFiltered", "isEmojiPremiumLocked", "getEmojiUnavailableReason"];
            for (const m of methods) {
                if (typeof isEmojiAvail[m] === "function") {
                    this.patchModule(isEmojiAvail, m, () => () => m === "getEmojiUnavailableReason" ? undefined : false);
                }
            }
        }

        // Step 2: Patch canUserUse to allow emojis everywhere
        const CanUserUseMod = this.findModuleBySource(".getFeatureValue(", "isPremium");
        if (CanUserUseMod?.canUserUse) {
            const orig = CanUserUseMod.canUserUse;
            CanUserUseMod.canUserUse = (feature, user) => {
                if ((feature?.name === "emojisEverywhere" || feature?.name === "animatedEmojis") && s.emojiBypass) return true;
                return orig(feature, user);
            };
            this._patches.push({ mod: CanUserUseMod, method: "canUserUse", original: orig });
        }

        // Step 3: Patch sendMessage to replace emoji shortcodes
        const MessageActions = DigiCord.Webpack?.findByProps?.("sendMessage", "_sendMessage");
        if (MessageActions?.sendMessage) {
            const orig = MessageActions.sendMessage;
            const self = this;
            MessageActions.sendMessage = function (channelId, msg, options) {
                if (!s.emojiBypass || !msg?.content) return orig.apply(this, arguments);

                const newContent = self.processEmojiContent(msg.content, channelId, s);
                if (newContent !== msg.content) {
                    msg = { ...msg, content: newContent };
                }
                return orig.call(this, channelId, msg, options);
            };
            this._patches.push({ mod: MessageActions, method: "sendMessage", original: orig });
        }

        this.logger.info("Emoji bypass applied");
    },

    processEmojiContent(content, channelId, s) {
        EmojiPattern.lastIndex = 0;
        let newContent = content;
        let match;

        while ((match = EmojiPattern.exec(content)) !== null) {
            const fullMatch = match[0];
            const isTag = fullMatch.startsWith("<");
            let emojiId, emojiName, isAnimated;

            if (isTag) {
                emojiName = match[1];
                emojiId = match[2];
                isAnimated = fullMatch.startsWith("<a:");
            } else {
                const shortcode = match[3];
                const found = this.findEmojiByName(shortcode);
                if (!found || !found.id) continue;
                emojiId = found.id;
                emojiName = found.name;
                isAnimated = found.animated;
            }

            // Check if user can already use this emoji
            if (s.emojiBypassForValidEmoji && this.canUseEmojiById(emojiId, channelId)) continue;

            const ext = s.PNGemote ? "png" : (isAnimated ? "gif" : "webp");
            const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=${s.emojiSize}&quality=lossless`;

            if (s.emojiBypassType === 3) {
                // Hyperlink mode
                newContent = newContent.replace(fullMatch, `[${emojiName}](${url})`);
            } else if (s.emojiBypassType === 2) {
                // Classic mode (raw URL)
                newContent = newContent.replace(fullMatch, url);
            }
            // Type 0 (Upload) is handled via _sendMessageInstead which we don't have access to
        }

        return newContent;
    },

    findEmojiByName(name) {
        try {
            const EmojiStore = DigiCord.Stores?.EmojiStore;
            if (!EmojiStore) return null;

            // Try getEmoji if available
            if (typeof EmojiStore.getEmoji === "function") {
                const emojis = EmojiStore.getEmoji();
                if (Array.isArray(emojis)) {
                    return emojis.find(e =>
                        e.name?.toLowerCase() === name.toLowerCase() ||
                        e.name?.replace(/\s/g, "_").toLowerCase() === name.toLowerCase()
                    );
                }
            }

            // Try forEach
            if (typeof EmojiStore.forEach === "function") {
                let found = null;
                EmojiStore.forEach((e) => {
                    if (!found && e.name?.toLowerCase() === name.toLowerCase()) found = e;
                });
                return found;
            }
        } catch (e) {
            return null;
        }
        return null;
    },

    canUseEmojiById(emojiId, channelId) {
        try {
            const EmojiStore = DigiCord.Stores?.EmojiStore;
            const emoji = EmojiStore?.getCustomEmojiById?.(emojiId);
            if (!emoji) return false;
            return this.canUseEmoji(emoji, channelId);
        } catch (e) {
            return false;
        }
    },

    canUseEmoji(emoji, channelId) {
        if (!emoji) return true;
        const emojiGuildId = emoji.guildId ?? emoji.guild_id;
        if (!emojiGuildId) return true;

        const currentGuildId = DigiCord.getCurrentGuildId?.();
        if (emojiGuildId === currentGuildId) return true;

        try {
            const ChannelStore = DigiCord.Stores?.ChannelStore;
            const PermissionStore = DigiCord.Stores?.PermissionStore;
            const channel = ChannelStore?.getChannel?.(channelId);
            if (!channel) return false;
            if (channel.type === 1 || channel.type === 3) return true;
            if (PermissionStore?.can) return PermissionStore.can(262144n, channel);
        } catch (e) {}

        return false;
    },

    // ── 2. Screen Sharing Quality ─────────────────────────────────────
    applyScreenSharing() {
        const s = this.settings;

        const videoModule = this.findModuleByPrototype("updateVideoQuality");
        if (!videoModule?.prototype?.updateVideoQuality) return;

        this.patchModule(videoModule.prototype, "updateVideoQuality", (orig) => {
            const self = this;
            return function (e) {
                try {
                    if (e?.videoStreamParameters?.[0]) {
                        const params = e.videoStreamParameters[0];

                        if (s.ResolutionEnabled) {
                            const res = parseInt(s.CustomResolution) || 1440;
                            params.maxResolution = { width: res, height: Math.round(res * 9 / 16) };
                        }

                        if (s.CustomFPSEnabled) {
                            params.maxFrameRate = parseInt(s.CustomFPS) || 60;
                        }
                    }

                    if (e?.videoQualityManager?.options) {
                        const opts = e.videoQualityManager.options;

                        if (s.CustomBitrateEnabled) {
                            const minB = (parseFloat(s.minBitrate) > 0 ? parseFloat(s.minBitrate) * 1000 : 500000);
                            const maxB = (parseFloat(s.maxBitrate) > 0 ? parseFloat(s.maxBitrate) * 1000 : 9000000);
                            const targetB = (parseFloat(s.targetBitrate) > 0 ? parseFloat(s.targetBitrate) * 1000 : 9000000);

                            if (opts.videoBitrate) {
                                opts.videoBitrate.min = minB;
                                opts.videoBitrate.max = maxB;
                                opts.videoBitrate.target = targetB;
                            }
                            if (opts.desktopBitrate) {
                                opts.desktopBitrate.min = minB;
                                opts.desktopBitrate.max = maxB;
                                opts.desktopBitrate.target = targetB;
                            }
                        }

                        if (s.screenSharing && e.videoStreamParameters?.[0]) {
                            const vp = e.videoStreamParameters[0];
                            if (opts.videoBudget) {
                                opts.videoBudget.framerate = vp.maxFrameRate;
                                opts.videoBudget.pixelBudget = vp.maxResolution.width * vp.maxResolution.height;
                            }
                            if (opts.videoCapture) {
                                opts.videoCapture.framerate = vp.maxFrameRate;
                            }
                        }
                    }
                } catch (err) {
                    self.logger.error("Error in videoQuality patch", err);
                }
                return orig.apply(this, arguments);
            };
        });

        this.logger.info("Screen sharing quality applied");
    },

    // ── 3. Sticker Bypass ─────────────────────────────────────────────
    applyStickerUnlock() {
        const stickerMod = this.findModuleBySource("SENDABLE_WITH_BOOSTED_GUILD", "canUseCustomStickersEverywhere");
        if (stickerMod) {
            if (stickerMod.getStickerSendability) {
                const orig = stickerMod.getStickerSendability;
                stickerMod.getStickerSendability = () => 0; // 0 = SENDABLE
                this._patches.push({ mod: stickerMod, method: "getStickerSendability", original: orig });
            }
            if (stickerMod.isSendableSticker) {
                const orig = stickerMod.isSendableSticker;
                stickerMod.isSendableSticker = () => true;
                this._patches.push({ mod: stickerMod, method: "isSendableSticker", original: orig });
            }
        }
        this.logger.info("Sticker unlock applied");
    },

    applyStickerBypass() {
        const MessageActions = DigiCord.Webpack?.findByProps?.("sendMessage", "_sendMessage");
        const SelectedChannelStore = DigiCord.Stores?.SelectedChannelStore;

        if (MessageActions?.sendMessage && SelectedChannelStore) {
            const orig = MessageActions.sendMessage;
            MessageActions.sendMessage = function (channelId, msg, options) {
                if (options?.stickerIds?.length) {
                    const stickerId = options.stickerIds[0];
                    const url = `https://media.discordapp.net/stickers/${stickerId}.png?size=4096&quality=lossless`;
                    msg = { ...msg, content: (msg.content || "") + " " + url };
                    options = { ...options, stickerIds: [] };
                }
                return orig.call(this, channelId, msg, options);
            };
            this._patches.push({ mod: MessageActions, method: "sendMessage", original: orig });
        }
        this.logger.info("Sticker bypass applied");
    },

    // ── 4. Profile V2 (Premium Type) ──────────────────────────────────
    applyProfileV2() {
        const UserProfileStore = DigiCord.Stores?.UserProfileStore;
        if (UserProfileStore?.getUserProfile) {
            const orig = UserProfileStore.getUserProfile;
            UserProfileStore.getUserProfile = function (...args) {
                const ret = orig.apply(this, args);
                if (ret) ret.premiumType = 2;
                return ret;
            };
            this._patches.push({ mod: UserProfileStore, method: "getUserProfile", original: orig });
        }
        this.logger.info("Profile V2 applied");
    },

    // ── 5. Client Themes ──────────────────────────────────────────────
    applyClientThemes() {
        const clientThemesMod = DigiCord.Webpack?.findByProps?.("isPreview");
        if (clientThemesMod) {
            try {
                Object.defineProperty(clientThemesMod, "isPreview", {
                    get: () => false,
                    set: () => {},
                    configurable: true,
                });
            } catch (e) {
                clientThemesMod.isPreview = false;
            }
        }
        this.logger.info("Client themes unlock applied");
    },

    // ── 6. Premium Type Override ──────────────────────────────────────
    applyPremiumType(type) {
        try {
            const UserStore = DigiCord.Stores?.UserStore;
            const FluxDispatcher = DigiCord.FluxDispatcher;
            const user = UserStore?.getCurrentUser?.();
            if (!user) return;

            user.premiumType = type;

            const handler = () => {
                const u = UserStore?.getCurrentUser?.();
                if (u) u.premiumType = type;
            };
            FluxDispatcher?.subscribe?.("CURRENT_USER_UPDATE", handler);
            this._unsubscribes.push(() => FluxDispatcher?.unsubscribe?.("CURRENT_USER_UPDATE", handler));
        } catch (e) {
            this.logger.error("Failed to apply premium type", e);
        }
    },

    restorePremiumType() {
        if (this._originalPremiumType === null) return;
        try {
            const UserStore = DigiCord.Stores?.UserStore;
            const user = UserStore?.getCurrentUser?.();
            if (user) user.premiumType = this._originalPremiumType;
        } catch (e) {}
    },

    // ── 7. Experiments ────────────────────────────────────────────────
    applyExperiments() {
        try {
            const UserStore = DigiCord.Stores?.UserStore;
            const user = UserStore?.getCurrentUser?.();
            if (user) {
                user.flags = (user.flags || 0) | 1; // Staff flag
            }

            const FluxDispatcher = DigiCord.FluxDispatcher;
            FluxDispatcher?.dispatch?.({
                type: "CONNECTION_OPEN",
                user: user,
            });
        } catch (e) {
            this.logger.error("Failed to unlock experiments", e);
        }
    },

    // ── 8. Video Codec ────────────────────────────────────────────────
    applyVideoCodec(codecIndex) {
        const streamMod = this.findModuleBySource("getCodecOptions");
        if (streamMod) {
            // Find the class with getCodecOptions
            let targetClass = null;
            for (const key of Object.keys(streamMod)) {
                if (streamMod[key]?.prototype?.getCodecOptions) {
                    targetClass = streamMod[key];
                    break;
                }
            }
            if (targetClass) {
                const orig = targetClass.prototype.getCodecOptions;
                targetClass.prototype.getCodecOptions = function (...args) {
                    const ret = orig.apply(this, args);
                    if (ret?.videoDecoders?.[codecIndex]) {
                        ret.videoEncoder = ret.videoDecoders[codecIndex];
                    }
                    return ret;
                };
                this._patches.push({ mod: targetClass.prototype, method: "getCodecOptions", original: orig });
            }
        }
        this.logger.info("Video codec forced");
    },

    // ── Module Finders ────────────────────────────────────────────────
    findModuleBySource(...strings) {
        const cache = DigiCord.Webpack?.cache;
        if (!cache) return null;
        for (const key in cache) {
            const mod = cache[key];
            if (!mod?.exports) continue;
            try {
                const exp = mod.exports;
                if (this.moduleMatchesStrings(exp, strings)) return exp;
                // Check default export
                if (exp.default && this.moduleMatchesStrings(exp.default, strings)) return exp.default;
                // Check nested
                for (const k in exp) {
                    if (exp[k] && this.moduleMatchesStrings(exp[k], strings)) return exp[k];
                }
            } catch (e) {}
        }
        return null;
    },

    findModuleByPrototype(...keys) {
        const cache = DigiCord.Webpack?.cache;
        if (!cache) return null;
        for (const key in cache) {
            const mod = cache[key];
            if (!mod?.exports) continue;
            try {
                const exp = mod.exports;
                if (exp.prototype && keys.every(k => typeof exp.prototype[k] === "function")) return exp;
                if (exp.default?.prototype && keys.every(k => typeof exp.default.prototype[k] === "function")) return exp.default;
            } catch (e) {}
        }
        return null;
    },

    moduleMatchesStrings(mod, strings) {
        if (!mod) return false;
        try {
            if (typeof mod === "function") {
                const str = Function.prototype.toString.call(mod);
                return strings.every(s => str.includes(s));
            }
            if (typeof mod === "object" && mod !== null) {
                for (const val of Object.values(mod)) {
                    if (typeof val === "function") {
                        const str = Function.prototype.toString.call(val);
                        if (strings.every(s => str.includes(s))) return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    },
});
