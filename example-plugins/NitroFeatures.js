DigiCord.registerPlugin({
    name: "NitroFeatures",
    description: "Unlock Nitro-like features: emoji bypass, message logging, and more",
    authors: [{ name: "DigiCord", id: 0 }],

    settings: {
        def: {
            emojiBypass: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Replace :shortcode: with custom emoji URLs so they work in any channel",
                default: true,
            },
            emojiSize: {
                type: DigiCord.OptionType.SELECT,
                description: "Size of bypassed emojis in pixels",
                default: 48,
                options: [
                    { label: "32px", value: 32 },
                    { label: "48px (Recommended)", value: 48 },
                    { label: "64px", value: 64 },
                    { label: "128px", value: 128 },
                ],
            },
            showDeletedMessages: {
                type: DigiCord.OptionType.BOOLEAN,
                description: "Log deleted and edited messages to console",
                default: true,
            },
            customStatus: {
                type: DigiCord.OptionType.STRING,
                description: "Custom status text to broadcast on start",
                placeholder: "Playing with DigiCord...",
                default: "",
            },
        }
    },

    _listeners: [],
    _deletedMessages: [],
    _editedMessages: [],

    start() {
        this.logger = new DigiCord.Logger("NitroFeatures", "#57f287");

        // Register slash command
        DigiCord.Commands.register({
            name: "nitro",
            description: "NitroFeatures commands",
            inputType: 0,
            options: [{
                name: "action",
                description: "What to do",
                type: 3,
                required: true,
                choices: [
                    { name: "status", value: "status" },
                    { name: "clear-log", value: "clear-log" },
                    { name: "help", value: "help" },
                ]
            }],
            execute: (args, ctx) => {
                const action = args[0]?.value;

                if (action === "status") {
                    const s = this.store;
                    return {
                        content: [
                            "**NitroFeatures Status**",
                            `Emoji Bypass: ${s.emojiBypass ? "ON" : "OFF"} (${s.emojiSize}px)`,
                            `Message Logging: ${s.showDeletedMessages ? "ON" : "OFF"}`,
                            `Deleted tracked: ${this._deletedMessages.length}`,
                            `Edited tracked: ${this._editedMessages.length}`,
                        ].join("\n")
                    };
                }

                if (action === "clear-log") {
                    this._deletedMessages = [];
                    this._editedMessages = [];
                    return { content: "Message log cleared!" };
                }

                if (action === "help") {
                    return {
                        content: [
                            "**NitroFeatures Commands**",
                            "`/nitro status` - Show plugin status",
                            "`/nitro clear-log` - Clear message log",
                            "`/nitro help` - Show this help",
                        ].join("\n")
                    };
                }

                return { content: "Unknown action." };
            }
        }, this.name);

        this.logger.info("Slash command registered");

        // Message tracking via FluxDispatcher
        if (this.store.showDeletedMessages) {
            this.startMessageTracking();
        }

        // Emoji bypass via MessageEvents
        if (this.store.emojiBypass) {
            this.startEmojiBypass();
        }

        // Show toast on start
        DigiCord.UI?.showToast?.("NitroFeatures started!", 1);
        this.logger.info("NitroFeatures started!");
    },

    stop() {
        this.logger.info("NitroFeatures stopping...");

        // Unregister command
        DigiCord.Commands.unregister("nitro");

        // Cleanup flux listeners
        for (const unsub of this._listeners) {
            try { unsub(); } catch (e) {}
        }
        this._listeners = [];

        DigiCord.UI?.showToast?.("NitroFeatures stopped!", 1);
        this.logger.info("NitroFeatures stopped");
    },

    startMessageTracking() {
        const flux = DigiCord.FluxDispatcher;
        if (!flux) {
            this.logger.warn("FluxDispatcher not available");
            return;
        }

        const onDelete = (event) => {
            try {
                const { id, channelId } = event;
                if (!id) return;

                // Try to get message content from MessageStore
                const MessageStore = DigiCord.Stores?.MessageStore;
                let content = "";
                let author = "Unknown";

                if (MessageStore) {
                    const msg = MessageStore.getMessage(channelId, id);
                    if (msg) {
                        content = msg.content || "";
                        author = msg.author?.username || "Unknown";
                    }
                }

                this._deletedMessages.push({
                    id,
                    channelId,
                    content: content.substring(0, 200),
                    author,
                    timestamp: Date.now(),
                });

                this.logger.info(`[DELETED] ${author}: ${content.substring(0, 100)}`);
            } catch (e) {
                this.logger.error("Error tracking deleted message", e);
            }
        };

        const onEdit = (event) => {
            try {
                const { id, channelId, content } = event;
                if (!id) return;

                this._editedMessages.push({
                    id,
                    channelId,
                    content: (content || "").substring(0, 200),
                    timestamp: Date.now(),
                });

                this.logger.info(`[EDITED] Message ${id}: ${(content || "").substring(0, 100)}`);
            } catch (e) {
                this.logger.error("Error tracking edited message", e);
            }
        };

        flux.subscribe("MESSAGE_DELETE", onDelete);
        flux.subscribe("MESSAGE_UPDATE", onEdit);

        this._listeners.push(() => flux.unsubscribe("MESSAGE_DELETE", onDelete));
        this._listeners.push(() => flux.unsubscribe("MESSAGE_UPDATE", onEdit));

        this.logger.info("Message tracking active");
    },

    startEmojiBypass() {
        const EmojiStore = DigiCord.Stores?.EmojiStore;
        if (!EmojiStore) {
            this.logger.warn("EmojiStore not available, emoji bypass disabled");
            return;
        }

        const listener = (channelId, messageObj, options) => {
            if (!this.store.emojiBypass) return;

            const emojis = messageObj.validNonShortcutEmojis;
            if (!emojis || emojis.length === 0) return;

            let modified = false;

            for (const emoji of emojis) {
                try {
                    // Check if user can already use this emoji (from current server or has Nitro)
                    const canUse = this.canUseEmoji(emoji, channelId);
                    if (canUse) continue;

                    // Build the emoji string Discord expects: <:name:id> or <a:name:id>
                    const emojiString = `<${emoji.animated ? "a" : ""}:${emoji.originalName || emoji.name}:${emoji.id}>`;
                    const size = this.store.emojiSize || 48;

                    // Build the CDN URL
                    const ext = emoji.animated ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=${size}`;

                    // Replace the emoji string with a hyperlink: [name](url)
                    messageObj.content = messageObj.content.replace(
                        emojiString,
                        `[${emoji.name}](${url})`
                    );

                    modified = true;
                } catch (e) {
                    // Skip this emoji if processing fails
                }
            }

            if (modified) {
                // Return cancel: false so the message still sends
            }
        };

        DigiCord.MessageEvents.addPreSendListener(listener);
        this._listeners.push(() => DigiCord.MessageEvents.removePreSendListener(listener));

        this.logger.info("Emoji bypass active");
    },

    canUseEmoji(emoji, channelId) {
        // If no guild_id, it's a standard emoji - always usable
        if (!emoji.guildId) return true;

        const currentGuildId = DigiCord.getCurrentGuildId?.();
        if (emoji.guildId === currentGuildId) return true;

        // Check if user has USE_EXTERNAL_EMOJIS permission
        try {
            const PermissionStore = DigiCord.Stores?.PermissionStore;
            const ChannelStore = DigiCord.Stores?.ChannelStore;
            if (!PermissionStore || !ChannelStore) return false;

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) return false;

            // Private channels - always allowed
            if (channel.type === 1) return true;

            // Permission bit for USE_EXTERNAL_EMOJIS = 1n << 18n = 262144n
            return PermissionStore.can(262144n, channel);
        } catch (e) {
            return false;
        }
    },
});
