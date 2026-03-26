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
    showPopper,
    hidePopper,
    metadataName,
    htmlSuffix,
    unEscapeAll,
    generateUUID,
    lodash,
    // HTML Related
    updateCaretDisplaySafe,
    getSelectedTextInElem,
    renderCaret
} from '../../index.js';

import { Status } from '../classes/Status.js';
import { StatusEntry } from '../classes/StatusEntry.js';

export {
    registerEvents
};

/**
 * @readonly
 * @type {Object.<string, number>}
 */
const Position = Object.freeze({
    AFTER_PROMPT: 0,
    IN_DEPTH: 1
});

/**
 * @readonly
 * @type {Object.<string, string>}
 */
const AllowedNumericKeys = Object.freeze({
    UP: 'ArrowUp',
    DOWN: 'ArrowDown'
});

/**
 * @readonly
 * @type {Object.<string, string>}
 */
const InputTypes = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    RANGE: 'range'
});

/**
 * @readonly
 * @type {Object.<string, string>}
 */
const AllowedNumericInputs = Object.freeze({
    NUMBER: InputTypes.NUMBER,
    RANGE: InputTypes.RANGE
});

/**
 * @template T
 * @typedef {Event & {data: Object; currentTarget: T;}} EventData
 */

/**
 * @typedef {import('../../index.js').UserCharacter} UserCharacter
 */

// * MARK:DOM Listeners

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} inputTrigger
 */
function updateEntryFromInput(inputTrigger) {
    const $container = $(inputTrigger).closest('span.fake-inputs-container[data-field]').first();

    if (!$container.length) return;

    const { avatar, uid, value_uid, field } = $container.data();

    if (!avatar || isNaN(uid)) return;

    const status = StatUsMaximus.getStatus(avatar);
    const $inputs = $container.find('.input-value-source');

    if (!status) return;

    const entry = status.getEntry(Number(uid));

    if (!entry || !entry.getValue(Number(value_uid))) return;

    let fieldValue = lodash.cloneDeep(
        field === 'value' ?
        entry.getValue(Number(value_uid)).value :
        entry[field]
    );

    const operationUID = generateUUID(`${metadataName}_macro_parsing_done`);

    $inputs.each(function(i, input) {
        const $input = $(input);

        const { type, original: inputIndex } = $input.data();

        if (!inputIndex) return;

        let newMacro = '';

        if (type === InputTypes.TEXT || type === InputTypes.NUMBER) {
            let value = $input.val() ?? '';
            const separator = !value ? '' : '::';

            if (type === InputTypes.TEXT) {
                value = String(value)
                    .replaceAll(/^\s+/g, '{{noop}}$&')
                    .replaceAll(/\s+$/g, '$&{{noop}}');
            }

            newMacro = `{{${type}${separator}${value}::${operationUID}}}`;
        }

        if (type === InputTypes.BOOLEAN) {
            const value = $input.prop('checked') ?? true;
            const inputId = $input.attr('id');
            const $span = $(`.fake-input-span[data-input-id="${inputId}"]`);

            const { trueValue, falseValue } = $span.data();

            newMacro = `{{${type}::${value}::${trueValue}::${falseValue}::${operationUID}}}`;
        }

        if (type === InputTypes.RANGE) {
            const value = $input.val() ?? 100;
            const min = $input.attr('min') ?? 0;
            const max = $input.attr('max') ?? 100;
            const step = $input.attr('step') ?? 1;

            newMacro = `{{${type}::${min}::${max}::${step}::${value}::${operationUID}}}`;
        }

        fieldValue = fieldValue.replace(inputIndex, newMacro);
    });

    fieldValue = fieldValue.replaceAll(`::${operationUID}}}`, '}}');
    entry.set(field, fieldValue, value_uid);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onToggleStatus(e) {
    const $button = $(e.currentTarget);
    const { avatar } = $button.data();

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    status.set('enabled', !status.enabled);
    $button.toggleClass('toggleEnabled', status.enabled);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onToggleEntry(e) {
    const entrySwitch = $(e.currentTarget);
    const { avatar, enabled, uid } = entrySwitch.data();
    const nextState = !enabled;

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];

    if (!entry) return;

    entry.set('enabled', nextState);
    entrySwitch
        .data({enabled: nextState})
        .toggleClass('fa-toggle-on', nextState)
        .toggleClass('fa-toggle-off', !nextState)
        .closest(`.${htmlSuffix}-entry`)
        .toggleClass('disabled', !nextState);
}

/**
 * @param {Event} e
 */
function onCollapseStatus(e) {
    const drawerHeader = $(e.currentTarget);
    const { avatar } = drawerHeader.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const doClose = drawerHeader
        .find('.inline-drawer-icon')
        .hasClass('up');

    status.set('is_collapsed', doClose);
}

/**
 * @param {EventData<HTMLSpanElement>} e
 */
function onSelectChatInputFinish(e) {
    const spanInput = e.data.spanInput;

    if (!spanInput) return;

    const input = /** @type {HTMLInputElement|HTMLTextAreaElement} */(document.getElementById(spanInput.dataset.inputId));
    const $input = $(input);
    const selection = getSelectedTextInElem(spanInput);
    let lastKeyPressed = '';

    $input.data('lastValue', $input.val());
    $input.one('focus', () => updateCaretDisplaySafe(input, spanInput));
    $input.one('blur', function() {
        $input.off('input');
        $input.off('keydown');
        renderCaret(spanInput, spanInput.textContent, -1);
        updateEntryFromInput($input[0]);
    });

    $input.on('keydown', function(e) {
        e.stopPropagation();
        updateCaretDisplaySafe(input, spanInput);

        lastKeyPressed = e.key;

        const validNumericKey = Object.values(AllowedNumericKeys).includes(lastKeyPressed);

        if (validNumericKey) $input.trigger('input');
    });

    $input.on('input', function(e) {
        e.stopPropagation();

        const { pattern = '', lastValue, type } = $input.data();

        const validNumericKey = Object.values(AllowedNumericKeys).includes(lastKeyPressed);
        const validNumericInput = Object.values(AllowedNumericInputs).includes(type);

        if (!validNumericInput) return updateCaretDisplaySafe(input, spanInput);

        const inputID = $input.attr('id');
        const regex = new RegExp(pattern);
        const currentValue = $input.val();
        let newValue = regex.test(currentValue) ? Number(currentValue) : Number(lastValue);

        if (validNumericKey) {
            const step = $input.attr('step') ?? 1;
            const direction = lastKeyPressed === AllowedNumericKeys.UP ? 1 : -1;
            const nextStep = Number(step) * direction;

            newValue += nextStep;
        }

        if (type === AllowedNumericInputs.RANGE) {
            const min = Number($input.attr('min'));
            const max = Number($input.attr('max'));
            const step = Number($input.attr('step'));
            const normalizedFloor = Math.max(newValue, min);
            const normalizedRoof = Math.min(normalizedFloor, max);
            const normalizedValue = normalizedRoof - (normalizedRoof % step);

            newValue = normalizedValue;

            window.requestAnimationFrame(() => {
                $input.val(normalizedValue);
                $(`input[data-input-id="${inputID}"].chat-input-editor`).val(normalizedValue);
            });
        }

        $input.val(newValue);
        $input.data('lastValue', newValue);
        updateCaretDisplaySafe(input, spanInput);
    });

    input.setSelectionRange(selection.start, selection.end);
    input.focus();
}

/**
 * @param {EventData<HTMLSpanElement>} e
 */
function onSelectChatInput(e) {
    const spanInput = e.currentTarget;

    if (!spanInput) return;

    // @ts-ignore
    $(document).one('pointerup', { spanInput }, onSelectChatInputFinish);
}

/**
 * @param {EventData<HTMLInputElement>} e
 */
function onRangeSliderMoved(e) {
    e.stopPropagation();

    const range = e.currentTarget;

    /** @type {JQuery<HTMLInputElement | HTMLTextAreaElement>} */
    const $input = $(`#${range.dataset.inputId}`);
    const $span = $(`.fake-input-span[data-input-id="${range.dataset.inputId}"]`);

    $input.val(range.value);
    $span.empty().html(String(range.value));
    updateEntryFromInput($input[0]);
}

/**
 * @param {EventData<HTMLSpanElement>} e
 */
function onClickInputArrow(e) {
    e.stopPropagation();

    const $arrowContainer = $(e.currentTarget);
    const $arrow = $(e.target);

    const { inputId } = $arrowContainer.data();
    const { direction } = $arrow.data();

    if (!direction) return;

    /** @type {JQuery<HTMLInputElement | HTMLTextAreaElement>} */
    const $input = $(`#${inputId}`);

    const { type } = $input.data();

    const validNumericInput = Object.values(AllowedNumericInputs).includes(type);

    if (!validNumericInput) return;

    const currentValue = Number($input.val());
    let newValue;

    if (type === AllowedNumericInputs.NUMBER) {
        const step = $input.attr('step') ?? 1;
        const nextStep = Number(step) * direction;

        newValue = currentValue + nextStep;
    }

    if (type === AllowedNumericInputs.RANGE) {
        const min = Number($input.attr('min'));
        const max = Number($input.attr('max'));
        const step = Number($input.attr('step'));

        newValue = currentValue + (Number(step) * direction);

        const normalizedFloor = Math.max(newValue, min);
        const normalizedRoof = Math.min(normalizedFloor, max);;

        newValue = normalizedRoof;
        window.requestAnimationFrame(() => {
            $(`input[data-input-id="${inputId}"].chat-input-editor`).val(normalizedRoof);
        });
    }

    $input.val(newValue);
    updateEntryFromInput($input[0]);

    $(`.fake-input-span[data-input-id="${inputId}"]`).text(newValue);
}

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onCheckboxToggle(e) {
    e.stopPropagation();

    const $input = $(e.currentTarget);
    const inputId = $input.attr('id');
    const inputValue = $input.prop('checked');
    const $span = $(`.fake-input-span[data-input-id="${inputId}"]`);

    const { trueValue, falseValue } = $span.data();

    $span.text(inputValue ? trueValue : falseValue);
    updateEntryFromInput($input[0]);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onClickEditStatus(e) {
    const $button = $(e.currentTarget);

    const { avatar } = $button.data();

    if (avatar) StatUsMaximus.openPopupSingle(avatar);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onOpenSwitchValueList(e) {
    const select = e.currentTarget;
    const $select = $(select);
    const popperInstance = $select.data('switchValuePopper');
    const optionListId = $select.data('listId');
    const $optionList = $(`#${optionListId}`);

    await showPopper(popperInstance, $optionList[0]);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onSelectSwitchValueList(e) {
    const option = e.currentTarget;
    const $option = $(option);

    const {altUid, uid, avatar, character, statusBlockId, listId} = $option.data();

    const $entryBlock = $(`.${htmlSuffix}-entry[status-block-id="${statusBlockId}"][uid="${uid}"]`).first();
    const popperInstance = $entryBlock.find('.status-value-uid').first().data('switchValuePopper');
    const optionList = $(`#${listId}`)[0];

    const status = StatUsMaximus.getStatus(avatar);

    if (!status)
        return await hidePopper(popperInstance, optionList);

    const entry = status.getEntry(uid);

    if (Number(entry.value_uid) === Number(altUid))
        return await hidePopper(popperInstance, optionList);

    entry.set('value_uid', altUid);

    const macroParser = extensionSettings.editNumbersFromChat ? 'getInputs' : 'getValues';
    const replaceMacrosOptions = {newlines: true, macros: true, macroParser, character};
    const entryValue = entry.getValue(altUid);
    const valueClean = unEscapeAll(entryValue.value, replaceMacrosOptions);

    $entryBlock
        .find('.status-description')
        .html(`<span class="d-inline">${valueClean}</span>`);

    $entryBlock.find('textarea.input-value-source').each((_, textarea) => {
        const $textarea = $(textarea);
        const val = $textarea.data('defaultValue');
        $textarea.val(val);
    });

    $entryBlock
        .find('span.fake-inputs-container[data-field="value"]')
        .data({value_uid: altUid});

    await hidePopper(popperInstance, optionList);
}

/**
 * @param {EventData<HTMLElement>} e
 */
function onHidePopperLists(e) {
    const $clickedElement = $(e.target);

    $('#chat .status-value-uid-options[data-show]').each(function(i, elem) {
        const invalidClickTarget =
            $clickedElement.attr('id') === elem.id ||
            $clickedElement.data('listId') === elem.id;

        if (invalidClickTarget) return;

        const popperInstance = $(`.status-value-uid[toggle-for="${elem.id}"]`)
            .first()
            .data('switchValuePopper');

        hidePopper(popperInstance, elem);
    });
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onRefreshBlockClick(e) {
    const $button = $(e.currentTarget);
    const { avatar } = $button.data();

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    StatUsMaximus.renderStatusSafe(status);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onOpenPopupWithEntryOpen(e) {
    e.preventDefault();

    const entrySwitch = $(e.currentTarget);
    const { avatar, uid } = entrySwitch.data();

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    await StatUsMaximus.openPopupSingle(avatar, {
        is_user: status.is_user,
        onOpen: function() {
            $(`.stat-us-maximus-popup[avatar="${avatar}"][is_user="${status.is_user}"]`)
                .find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`)
                .find('.inline-drawer-toggle')
                .trigger('click');
        }
    });
}

/**
 * @param {EventData<HTMLElement>} e
 */
function onDocumentClick(e) {
    onHidePopperLists(e);
}

// * MARK:ST Listeners

function onMessageRendered() {
    StatUsMaximus.log('onMessageRendered');

    /** @type {Function} */
    const renderer = StatUsMaximus.renderStatusesSafe;

    renderer();
}

async function onNewMessageRendered() {
    StatUsMaximus.log('onMessageRendered');

    await StatUsMaximus.renderStatuses();
    if (powerUserSettings.auto_scroll_chat_to_bottom) scrollChatToBottom();
}

async function onChatChanged(...args) {
    const [ chat_id ] = args;

    StatUsMaximus.log(eventTypes.CHAT_CHANGED, chat_id);

    if (!chat_id) return;

    StatUsMaximus.getStatuses();
    await StatUsMaximus.renderStatuses();

    scrollChatToBottom();
}

function onGenerationAfterCommands(...args) {
    StatUsMaximus.log(eventTypes.GENERATION_AFTER_COMMANDS, args);

    const [ genType ] = args;
    const { extensionPrompts: extension_prompts, characterId: chid, characters: allCharacters } = context();
    const { chars, user } = getActiveParticipants();

    for (const key of Object.keys(extension_prompts)) {
        if (key.includes(metadataName)) delete extension_prompts[key];
    }

    /** @type {(Character|UserCharacter)[]} */
    const characters = [];

    if (user) characters.push(user);

    characters.push(...chars);

    const replaceMacrosOptions = {newlines: true, macros: true, macroParser: 'getValues'};

    for (const [id, char] of characters.entries()) {
        const status = StatUsMaximus.getStatus(char.avatar);

        if (!status) continue;
        if (!status.enabled) continue;

        const entries = Object.keys(status.entries)
        .map(uid => status.getEntry(uid))
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
            )
            .replace(/\/\/.*\/\//g, '')
            .replace(/\/\/.*$/gm, '');

        if (!prompt) continue;

        let isCharGenerating = false;

        if (genType === 'impersonate' && status.is_user)
            isCharGenerating = true;

        else if (typeof chid === 'string' && allCharacters[chid].avatar === status.avatar)
            isCharGenerating = true;

        StatUsMaximus.log({ genType, chid, charSelected: allCharacters[chid]?.avatar, avatar: status.avatar, isCharGenerating });
        status.refreshDepth({ isGenerating: isCharGenerating });

        if (status.depth < 0 && !extensionSettings.alwaysIncludeUnmutedMembers) continue;

        const depth = status.force_depth >= 0 ? status.force_depth : status.depth;
        const depthNormalized = Math.max(depth, extensionSettings.minPromptDepth);

        StatUsMaximus.log({ depth, depthNormalized });

        setExtensionPrompt(
            uuid,
            prompt,
            Position.IN_DEPTH,
            depthNormalized,
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

    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-entry .kill-switch`, onToggleEntry);
    // @ts-ignore
    $chat.on('contextmenu', `.${htmlSuffix}-entry .kill-switch`, onOpenPopupWithEntryOpen);
    // @ts-ignore
    $chat.on('input', `.${htmlSuffix}-entry .chat-input-editor[type="range"]`, onRangeSliderMoved);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-entry .status-value-uid`, onOpenSwitchValueList);

    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-chat-drawer .status-value-uid-options .list-group-item`, onSelectSwitchValueList);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-chat-drawer .inline-drawer-header`, onCollapseStatus);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-chat-drawer .fake-input-arrows`, onClickInputArrow);
    // @ts-ignore
    $chat.on('input', `.${htmlSuffix}-chat-drawer .chat-input-editor[type="checkbox"]`, onCheckboxToggle);
    // @ts-ignore
    $chat.on('pointerdown', `.${htmlSuffix}-chat-drawer .fake-input-span`, onSelectChatInput);

    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-toolbar .kill-switch`, onToggleStatus);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-pen`, onClickEditStatus);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-arrows-rotate`, onRefreshBlockClick);
    // @ts-ignore
    $chat.on('click', `.${htmlSuffix}-toolbar .menu_button.fa-floppy-disk`, saveMetadataSafe);

    // @ts-ignore
    $(document).on('click', onDocumentClick);

    eventSource.makeLast(eventTypes.CHAT_CHANGED, onChatChanged);
    eventSource.makeLast(eventTypes.CHAT_CREATED, onChatChanged);
    eventSource.makeLast(eventTypes.GROUP_CHAT_CREATED, onChatChanged);

    eventSource.on(eventTypes.CHARACTER_RENAMED_IN_PAST_CHAT, onCharacterRenamed);

    eventSource.on(eventTypes.MORE_MESSAGES_LOADED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageRendered);
    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onNewMessageRendered);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, onNewMessageRendered);

    eventSource.makeLast(eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
}