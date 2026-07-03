/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

export * from "./BaseTab";
export { default as AboutTab } from "./about";
export { default as ExternalPluginsTab } from "./externalPlugins";
export { default as ExternalThemesTab } from "./externalThemes";
export { default as PatchHelperTab } from "./patchHelper";
export { default as PluginsTab } from "./plugins";
export { openContributorModal } from "./plugins/ContributorModal";
export { openPluginModal } from "./plugins/PluginModal";
export { default as BackupAndRestoreTab } from "./sync/BackupAndRestoreTab";
export { default as CloudTab } from "./sync/CloudTab";
export { default as ThemesTab } from "./themes";
export { default as UpdaterTab } from "./updater";
export { default as VencordTab } from "./vencord";
