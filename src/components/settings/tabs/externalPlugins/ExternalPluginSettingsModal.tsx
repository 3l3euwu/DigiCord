/*
 * DigiCord, a custom distribution of Vencord
 * Copyright (c) 2025 elee-py
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import {
    ExtOptionType,
    ExtSettingsDefinition,
    getPluginSettings,
    setPluginSetting,
} from "@api/ExternalPlugins";
import { classNameFactory } from "@utils/css";
import { React, Forms, openModal, Modal } from "@webpack/common";

const cl = classNameFactory("vc-ext-settings-");

function SettingInput({ name, def, value, onChange }: {
    name: string;
    def: ExtSettingDef;
    value: any;
    onChange: (val: any) => void;
}) {
    const displayName = def.displayName ?? name.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());

    switch (def.type) {
        case ExtOptionType.BOOLEAN:
            return (
                <div className={cl("row")}>
                    <div className={cl("row-header")}>
                        <label className={cl("label")}>{displayName}</label>
                        <input
                            type="checkbox"
                            checked={!!value}
                            onChange={e => onChange(e.target.checked)}
                            className={cl("checkbox")}
                        />
                    </div>
                    <span className={cl("description")}>{def.description}</span>
                </div>
            );

        case ExtOptionType.STRING:
            return (
                <div className={cl("row")}>
                    <label className={cl("label")}>{displayName}</label>
                    <span className={cl("description")}>{def.description}</span>
                    <input
                        type="text"
                        className={cl("text-input")}
                        value={value ?? ""}
                        placeholder={def.placeholder}
                        onChange={e => onChange(e.target.value)}
                    />
                </div>
            );

        case ExtOptionType.NUMBER:
            return (
                <div className={cl("row")}>
                    <label className={cl("label")}>{displayName}</label>
                    <span className={cl("description")}>{def.description}</span>
                    <input
                        type="number"
                        className={cl("text-input")}
                        value={value ?? 0}
                        onChange={e => onChange(Number(e.target.value))}
                    />
                </div>
            );

        case ExtOptionType.SELECT:
            return (
                <div className={cl("row")}>
                    <label className={cl("label")}>{displayName}</label>
                    <span className={cl("description")}>{def.description}</span>
                    <select
                        className={cl("select")}
                        value={value ?? ""}
                        onChange={e => {
                            const opt = def.options?.find(o => String(o.value) === e.target.value);
                            onChange(opt ? opt.value : e.target.value);
                        }}
                    >
                        {def.options?.map(opt => (
                            <option key={String(opt.value)} value={String(opt.value)}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            );

        case ExtOptionType.SLIDER:
            return (
                <div className={cl("row")}>
                    <label className={cl("label")}>{displayName}</label>
                    <span className={cl("description")}>{def.description}</span>
                    <div className={cl("slider-row")}>
                        <input
                            type="range"
                            className={cl("slider")}
                            min={def.markers?.[0] ?? 0}
                            max={def.markers?.[def.markers.length - 1] ?? 100}
                            step={def.stickToMarkers ? 1 : 0.1}
                            value={value ?? def.default ?? 0}
                            onChange={e => onChange(Number(e.target.value))}
                        />
                        <span className={cl("slider-value")}>{value ?? def.default ?? 0}</span>
                    </div>
                </div>
            );

        default:
            return null;
    }
}

type ExtSettingDef = ExtSettingsDefinition[string];

interface SettingsModalProps {
    pluginName: string;
    settingsDef: ExtSettingsDefinition;
    transitionState?: number;
    onClose: () => void;
}

function SettingsModal({ pluginName, settingsDef, transitionState, onClose }: SettingsModalProps) {
    const [values, setValues] = React.useState<Record<string, any>>({});
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        getPluginSettings(pluginName).then(v => {
            const filled: Record<string, any> = { ...v };
            for (const [key, def] of Object.entries(settingsDef)) {
                if (filled[key] === undefined && def.default !== undefined) {
                    filled[key] = def.default;
                }
            }
            setValues(filled);
            setLoaded(true);
        });
    }, [pluginName]);

    const handleChange = async (key: string, value: any) => {
        setValues(prev => ({ ...prev, [key]: value }));
        await setPluginSetting(pluginName, key, value);
    };

    return (
        <Modal
            onClose={onClose}
            size="md"
            title={`${pluginName} Settings`}
            transitionState={transitionState!}
        >
            <div className={cl("settings-list")}>
                {loaded ? (
                    Object.entries(settingsDef).map(([key, def]) => (
                        <SettingInput
                            key={key}
                            name={key}
                            def={def}
                            value={values[key]}
                            onChange={val => handleChange(key, val)}
                        />
                    ))
                ) : (
                    <Forms.FormText>Loading settings...</Forms.FormText>
                )}
            </div>
        </Modal>
    );
}

export function openExternalPluginSettings(pluginName: string, settingsDef: ExtSettingsDefinition) {
    openModal((props: any) => (
        <SettingsModal
            {...props}
            pluginName={pluginName}
            settingsDef={settingsDef}
        />
    ));
}
