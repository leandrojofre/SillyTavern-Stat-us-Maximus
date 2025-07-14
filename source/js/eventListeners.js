import { chat, chat_metadata, event_types, eventSource, scrollChatToBottom } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { selected_group } from "../../../../../group-chats.js";
import { addGroupStatusButtons, extensionSettings, fetchStatus, getActiveParticipants, getStatusDepth, log } from "../../index.js";
import { createCharStatus, fillMissingMetadata, getCharStatus } from "./statusControls.js";

/*
    ? event_types.GROUP_UPDATED doesn't matter, status will update when that character sends a message

    # TODO
    - Change of heart, maybe use GROUP_UPDATED for:
        - [X] Check if the group member exists in metadata
        - [X] If it doesn't - add it
    - [X] Display a table with statuses in the last message of each participant
*/

export function startListeners() {
    eventSource.on(event_types.GROUP_UPDATED, async (...args) => {
        log("GROUP_UPDATED", args);

        if (extensionSettings.autoDetectParticipants)
            for (const char of getActiveParticipants()) {
                if (!getCharStatus(char)) createCharStatus(char, getStatusDepth(chat, char));
            }

        addGroupStatusButtons();
    });

    eventSource.on(event_types.GROUP_WRAPPER_FINISHED, async (...args) => {
        log("GROUP_WRAPPER_FINISHED", args);
        addGroupStatusButtons();
    });

    eventSource.on('groupSelected', async (...args) => { // WTF - Why isn't this in event_types?
        log("groupSelected", args);
        addGroupStatusButtons();
    });

    eventSource.on(event_types.CHAT_CHANGED, async (...args) => {
        log("CHAT_CHANGED", args);

        if (!args[0]) return;
        if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];
        if (selected_group) addGroupStatusButtons();

        fillMissingMetadata();
        fetchStatus({forceUIUpdate: true});
        scrollChatToBottom();
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (...args) => {
        log("CHARACTER_MESSAGE_RENDERED", args);
        fetchStatus({newMessID: args[0]});
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, async (...args) => {
        log("USER_MESSAGE_RENDERED", args);
        fetchStatus({newMessID: args[0], depthModifier: 1});
    });

    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, async (...args) => {
        log("GENERATION_AFTER_COMMANDS", args);
        fetchStatus({depthModifier: 1});
    });

    eventSource.on(event_types.MORE_MESSAGES_LOADED, async (...args) => {
        log("MORE_MESSAGES_LOADED", args);
        fetchStatus({forceUIUpdate: true});
    });

    eventSource.on(event_types.MESSAGE_EDITED, async (...args) => {
        log("MESSAGE_EDITED", args);
        fetchStatus();
    });

    eventSource.on(event_types.MESSAGE_DELETED, async (...args) => {
        log("MESSAGE_DELETED", args);

        const id = (args[0] ?? chat.length) - 1;

        fetchStatus({newMessID: id});
    });
}
