import {
    eventSource,
    eventTypes,
    metadataName,
    getActiveParticipants,
    extension_prompt_roles,
    setExtensionPrompt,
    context,
    extensionSettings,
    log
} from "../../index.js";

import { Status } from "../classes/Status.js";
import { StatusEntry } from "../classes/StatusEntry.js";
import { CUSTOM_MACROS } from "./macros.js";

export {
    registerEvents
};

const position = {
    AFTER_PROMPT: 0,
    IN_DEPTH: 1
}

function onMessageRendered() {
    log('onMessageRendered');

    /** @type {Function} */
    const renderer = SillyTavern[metadataName].renderStatusesSafe;

    renderer();
}

function onChatChanged() {
    log(eventTypes.CHAT_CHANGED);

    /** @type {Function} */
    const renderer = SillyTavern[metadataName].renderStatusesSafe;

    renderer();
}

function onGenerationAfterCommands() {
    log(eventTypes.GENERATION_AFTER_COMMANDS);

    const { extensionPrompts: extension_prompts } = context();

    for (const key of Object.keys(extension_prompts)) {
        if (key.includes(metadataName)) delete extension_prompts[key];
    }

    const characters = getActiveParticipants().chars;
    const macro = CUSTOM_MACROS.getValues;

    for (const char of characters) {
        /** @type {Status} */
        const status = SillyTavern[metadataName].getStatus(char.avatar);

        if (!status) continue;

        const entries = Object.values(status.entries)
        .sort((a, b) => a.display_position - b.display_position)
        .map(function(entry) {
            /** @type {StatusEntry} */
            const { enabled, key, separator, values, value_uid } = entry;
            let text = '';

            if (!enabled) return text;
            if (key) text += macro(key, char.name);
            if (separator) text += separator;

            const value = values[value_uid]?.value;

            if (value) text += macro(value, char.name);

            return text;
        });

        const randUUID = self?.crypto?.randomUUID();
        const uuid = !randUUID ? new Date().valueOf() : randUUID.replaceAll('-', '_');
        const prompt = status.prefix + entries.join(status.separator) + status.suffix;

        setExtensionPrompt(
            metadataName + uuid,
            macro(prompt, char.name),
            position.IN_DEPTH,
            extensionSettings.minPromptDepth,
            true,
            status.role
        );
    }
}

function registerEvents() {
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);

    eventSource.on(eventTypes.MORE_MESSAGES_LOADED, onMessageRendered);
    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageRendered);

    eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
}