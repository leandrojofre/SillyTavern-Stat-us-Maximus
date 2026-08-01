import {
    // ST imports
    eventSource,
    eventTypes,
    setExtensionPrompt,
    scrollChatToBottom,
    powerUserSettings,
    // Normal imports
    context,
    getActiveParticipants,
    extensionSettings,
    saveMetadataSafe,
    metadataName,
    htmlSuffix,
    unEscapeAll,
    getCharFromMessage,
} from '../../index.js';

import * as eventMethods from './eventMethods.js';

/** @typedef {StatUsMaximus.UserCharacter} UserCharacter */

export {
    registerEvents
};

/**
 * @readonly
 * @type {Record<string, number>}
 */
const Position = Object.freeze({
    AFTER_PROMPT: 0,
    IN_DEPTH: 1
});

/**
 * @readonly
 * @type {readonly string[]}
 */
const genTypesWithOffset = Object.freeze([
    'continue'
]);

/**
 * @readonly
 * @type {number}
 */
const OFFSET_GEN_TYPE_AMOUNT = 1;

// * MARK:ST Listeners

/**
 * @param  {...any} args
 */
function onMessagesRendered(...args) {
    StatUsMaximus.log('onMessagesRendered', args);
    StatUsMaximus.renderStatusesSafe();
}

/**
 * @param  {...any} args
 */
async function onNewMessageRendered(...args) {
    StatUsMaximus.log('onMessageRendered', args);

    const [ mess_id ] = args;
    const char = getCharFromMessage(mess_id);

    if (!char) return;

    await StatUsMaximus.renderStatusSafe(StatUsMaximus.getStatus(char.avatar) || null);
    if (powerUserSettings.auto_scroll_chat_to_bottom) scrollChatToBottom();
}

/**
 * @param  {...any} args
 */
async function onChatChanged(...args) {
    const [ chat_id ] = args;

    StatUsMaximus.log(eventTypes.CHAT_CHANGED, chat_id);

    if (!chat_id) return;

    StatUsMaximus.getStatuses();
    await StatUsMaximus.renderStatuses();

    scrollChatToBottom();
}

/**
 * @param  {...any} args
 */
function onGenerationAfterCommands(...args) {
    StatUsMaximus.log(eventTypes.GENERATION_AFTER_COMMANDS, args);

    const [ genType ] = args;
    const { extensionPrompts: extension_prompts, characterId: chid, characters: allCharacters } = context();
    const { chars, user } = getActiveParticipants([], {forceMutedIn: extensionSettings.forceMutedMembersInclusion});
    const genHasOffset = genTypesWithOffset.includes(genType);

    for (const key of Object.keys(extension_prompts)) {
        if (key.includes(metadataName)) delete extension_prompts[key];
    }

    /** @type {(Character|UserCharacter)[]} */
    const characters = [];

    if (user) characters.push(user);

    characters.push(...chars);

    const replaceMacrosOptions = {newlines: true, macros: true, comments: true, macroParser: 'getValues'};

    for (const [id, char] of characters.entries()) {
        const status = StatUsMaximus.getStatus(char.avatar);

        if (!status) continue;
        if (!status.enabled) continue;

        let charIsGenerating = false;

        if (genType === 'impersonate' && status.is_user)
            charIsGenerating = true;

        else if (typeof chid === 'string' && allCharacters[chid].avatar === status.avatar)
            charIsGenerating = true;

        const entries = Object.keys(status.entries)
        .map(uid => status.getEntry(uid))
        .filter(entry => entry !== undefined)
        .filter(entry => !entry.private || charIsGenerating)
        .sort((a, b) => a.display_position - b.display_position)
        .map(function(entry) {
            const { enabled, value_uid } = entry;

            const key = entry.get('key');
            const separator = entry.get('separator');
            const value = entry.getValue(value_uid)?.value;

            let text = '';

            if (!enabled) return text;

            if (key) text += key;
            if (separator) text += separator;
            if (value) text += value;

            return text;
        })
        .filter(entry => entry?.length);

        if (!entries.length) continue;

        const uuid = `${metadataName}_${id}`;
        const prompt = unEscapeAll(
            status.prefix + entries.join(status.separator) + status.suffix,
            {character: char.name, ...replaceMacrosOptions}
        );

        if (!prompt) continue;

        StatUsMaximus.log({ genType, chid, charSelected: allCharacters[chid]?.avatar, avatar: status.avatar, charIsGenerating });
        status.refreshDepth({ isGenerating: charIsGenerating });

        if (status.depth < 0 && !extensionSettings.alwaysIncludeUnmutedMembers) continue;

        const depth = status.force_depth >= 0 ? status.force_depth : status.depth;
        const depthNormalized = Math.max(depth, extensionSettings.minPromptDepth);
        const depthOffset = depthNormalized === 1 && genHasOffset ? OFFSET_GEN_TYPE_AMOUNT : 0;

        StatUsMaximus.log({ depth, depthNormalized, depthOffset });

        setExtensionPrompt(
            uuid,
            prompt,
            Position.IN_DEPTH,
            depthNormalized - depthOffset,
            true,
            status.role
        );
    }

    StatUsMaximus.log({ extension_prompts });
}

/**
 * @param {Object} currentChat
 * @param {string} oldAvatar
 * @param {string} newAvatar
 */
async function onCharacterRenamed(currentChat, oldAvatar, newAvatar) {
    StatUsMaximus.log(eventTypes.CHARACTER_RENAMED_IN_PAST_CHAT, currentChat, oldAvatar, newAvatar);

    const metadata = currentChat[0][metadataName] ?? false;

    if (!metadata) return;
    if (!metadata[metadataName]) return;

    metadata[metadataName] = metadata[metadataName].map(stat => {
        if (String(stat.avatar) === String(oldAvatar))
            stat.avatar = String(newAvatar);

        return stat;
    });
}

// * MARK:Init Listeners

function registerEvents() {
    const $chat = $('#chat').first();

    $chat.on('click', `.${htmlSuffix}-toolbar`, function(e) {
        if ($(e.target).is('.inline-drawer-icon')) return;

        e.stopPropagation();
    });

    $chat.on('pointerdown', `.${htmlSuffix}-chat-drawer .fake-selection`, function(e) {
        e.stopPropagation();
    });

    $chat.on('click', `.${htmlSuffix}-entry-row .kill-switch`, eventMethods.onToggleEntry);
    $chat.on('contextmenu', `.${htmlSuffix}-entry-row .kill-switch`, eventMethods.onOpenPopupWithEntryOpen);
    $chat.on('click', `.${htmlSuffix}-entry-row .private-lamp`, eventMethods.onTogglePrivateEntry);
    $chat.on('input', `.${htmlSuffix}-entry-row .chat-input-editor[type="range"]`, eventMethods.onRangeSliderMoved);
    $chat.on('click', `.${htmlSuffix}-entry-row .status-value-uid`, eventMethods.onOpenSwitchValueList);

    $chat.on('click', `.${htmlSuffix}-chat-drawer .status-value-uid-options .list-group-item`, eventMethods.onSelectSwitchValueList);
    $chat.on('click', `.${htmlSuffix}-chat-drawer .inline-drawer-header`, eventMethods.onCollapseStatus);
    $chat.on('click', `.${htmlSuffix}-chat-drawer .fake-input-arrows`, eventMethods.onClickInputArrow);
    $chat.on('input', `.${htmlSuffix}-chat-drawer .chat-input-editor[type="checkbox"]`, eventMethods.onCheckboxToggle);
    $chat.on('pointerdown', `.${htmlSuffix}-chat-drawer .fake-input-span`, eventMethods.onSelectChatInput);

    $chat.on('click', `.${htmlSuffix}-toolbar .kill-switch`, eventMethods.onToggleStatus);
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-pen`, eventMethods.onClickEditStatus);
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-arrows-rotate`, eventMethods.onRefreshBlock);
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-floppy-disk`, () => saveMetadataSafe);

    $(document).on('click', eventMethods.onDocumentClick);

    eventSource.makeLast(eventTypes.CHAT_CHANGED, onChatChanged);
    eventSource.makeLast(eventTypes.CHAT_CREATED, onChatChanged);
    eventSource.makeLast(eventTypes.GROUP_CHAT_CREATED, onChatChanged);

    eventSource.on(eventTypes.CHARACTER_RENAMED_IN_PAST_CHAT, onCharacterRenamed);

    eventSource.on(eventTypes.MORE_MESSAGES_LOADED, onMessagesRendered);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessagesRendered);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessagesRendered);
    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onNewMessageRendered);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, onNewMessageRendered);

    eventSource.makeLast(eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
}