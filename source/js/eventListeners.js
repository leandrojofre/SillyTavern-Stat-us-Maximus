import { characters, chat, chat_metadata, event_types, eventSource, scrollChatToBottom, this_chid, user_avatar } from "../../../../../../script.js";
import { selected_group } from "../../../../../group-chats.js";
import { power_user } from "../../../../../power-user.js";
import { addGroupStatusButtons, callbacksClickValueUID, extensionSettings, fetchStatus, fetchStatusDebounced, getActiveParticipants, getStatusDepth, log } from "../../index.js";
import { createCharStatus, fillMissingMetadata, getCharStatus } from "./statusControls.js";

/*
    ? event_types.GROUP_UPDATED doesn't matter, status will update when that character sends a message

    # TODO
    - Change of heart, maybe use GROUP_UPDATED for:
        - [X] Check if the group member exists in metadata
        - [X] If it doesn't - add it
    - [X] Display a table with statuses in the last message of each participant
*/

/**
    @typedef {object} FetchOptions
    @property {boolean} [forceUIUpdate]
    @property {number} [depthModifier]
    @property {object} [forceDepth]
    @property {String} [forceDepth.avatar]
    @property {number} [forceDepth.depth]
    @property {String} [generationType]
*/

export function startListeners() {
    eventSource.on(event_types.GROUP_UPDATED, async (...args) => {
        log("GROUP_UPDATED", args);

        if (extensionSettings.autoDetectParticipants)
            for (const char of getActiveParticipants()) {
                if (!getCharStatus(char)) createCharStatus(char, getStatusDepth(chat, char).depth);
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

    eventSource.makeFirst(event_types.CHAT_CHANGED, async (...args) => {
        log("CHAT_CHANGED", args);

        if (!args[0]) return;
        if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];
        if (selected_group) addGroupStatusButtons();

        callbacksClickValueUID.map(c => c.popper?.destroy()).splice(0);

        fillMissingMetadata();
        fetchStatus({forceUIUpdate: true});
        scrollChatToBottom();
    });

    eventSource.makeFirst(event_types.CHAT_CREATED, async (...args) => {
        log("CHAT_CREATED", args);
        
        if (!args[0]) return;
        if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];
    });

    eventSource.makeFirst(event_types.GROUP_CHAT_CREATED, async (...args) => {
        log("CHAT_CREATED", args);
        
        if (!args[0]) return;
        if (!chat_metadata.stat_us_maximus) chat_metadata.stat_us_maximus = [];
    });

    eventSource.on(event_types.CHARACTER_RENAMED_IN_PAST_CHAT, function (currentChat, oldAvatar, newAvatar) {
        log("CHARACTER_RENAMED_IN_PAST_CHAT", currentChat, oldAvatar, newAvatar);

        const metadata = currentChat[0]?.chat_metadata ?? false;
        if (!metadata) return;
        if (!metadata?.stat_us_maximus) metadata.stat_us_maximus = [];

        metadata.stat_us_maximus = metadata.stat_us_maximus.map(stat => {
            if (String(stat.avatar) === String(oldAvatar)) stat.avatar = String(newAvatar);

            return stat;
        });
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (...args) => {
        log("CHARACTER_MESSAGE_RENDERED", args);
        fetchStatus();

        if (power_user.auto_scroll_chat_to_bottom) scrollChatToBottom();
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, async (...args) => {
        log("USER_MESSAGE_RENDERED", args);
        fetchStatus({depthModifier: 1});

        if (power_user.auto_scroll_chat_to_bottom) scrollChatToBottom();
    });

    /**
        @param {FetchOptions} options
        @param {string} genType
    */
    function setActiveCharacterStat(options, genType) {
        let avatar;

        if (genType === "impersonate")
            avatar = user_avatar;
        else if (genType === "continue" && chat.at(-1)?.is_user)
            avatar = chat.at(-1).force_avatar.replace(/(user avatars\/)|(\/thumbnail\?type=persona&file=)/i, "");
        else if (this_chid !== undefined)
            avatar = characters[this_chid].avatar;
        else return;

        options.forceDepth = {avatar: avatar, depth: 0};
    }

    eventSource.makeLast(event_types.GENERATION_AFTER_COMMANDS, async (...args) => {
        log("GENERATION_AFTER_COMMANDS", args);

        /**@type {FetchOptions} */
        const options = {depthModifier: 1};

        if (typeof args[0] === "string") {
            options.generationType = args[0];

            const genType = args[0];
            setActiveCharacterStat(options, genType);
        }

        fetchStatus(options);
    });

    eventSource.on(event_types.MORE_MESSAGES_LOADED, async (...args) => {
        log("MORE_MESSAGES_LOADED", args);
        fetchStatusDebounced({forceUIUpdate: true});
    });

    eventSource.on(event_types.MESSAGE_EDITED, async (...args) => {
        log("MESSAGE_EDITED", args);
        fetchStatusDebounced();
    });

    eventSource.on(event_types.MESSAGE_DELETED, async (...args) => {
        log("MESSAGE_DELETED", args);

        fetchStatusDebounced();
    });
}
