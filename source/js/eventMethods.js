import {
    // ST imports
    copyText,
    eventSource,
    t,
    // Normal imports
    showPopper,
    hidePopper,
    generateUUID,
    lodash,
    metadataName,
    extensionSettings,
    unEscapeAll,
    extensionName,
    // HTML Related
    HTML_TEMPLATES,
    htmlSuffix,
    updateCaretDisplaySafe,
    getSelectedTextInElem,
    exportObjectToClipboard,
    renderCaret,
} from '../../index.js';

import {
    createEntryBlock,
    popupConfirmAction,
    popupRequestInput,
    getStatusPopupBlock,
    cloneStatusPopup,
} from './popups.js';

export {
    // Normal
    onToggleStatus,
    onToggleEntry,
    onCollapseStatus,
    onSelectChatInput,
    onRangeSliderMoved,
    onClickInputArrow,
    onCheckboxToggle,
    onClickEditStatus,
    onOpenSwitchValueList,
    onSelectSwitchValueList,
    onRefreshBlock,
    onOpenPopupOnEntry,
    onTogglePrivateEntry,
    onDocumentClick,
    onRenameStatus,
    onAvatarFileUpload,
    // Popup
    onCollapsePopupBlock,
    onPopupStatusInput,
    onPopupEntryInput,
    onAltTitleInput,
    onCreateEntry,
    onCreateEntryValue,
    onEntryValueSwap,
    onDeleteEntryValue,
    onDeleteEntry,
    onBulkToggleEntryDrawer,
    onCreateStatus,
    onCopyEntry,
    onCreateEntryFromClipboard,
    onTransferStatus,
    onDeleteStatus,
    onMacroShortcut,
};

/**
 * @template T
 * @typedef {StatUsMaximus.EventData<T>} EventData
 */

/** @typedef {StatUsMaximus.Status} Status */
/** @typedef {StatUsMaximus.EntryData} EntryData */
/** @typedef {StatUsMaximus.AltValueData} AltValueData */

// * MARK:Variables

/**
 * @readonly
 * @type {Record<string, string>}
 */
const AllowedNumericKeys = Object.freeze({
    UP: 'ArrowUp',
    DOWN: 'ArrowDown'
});

/**
 * @readonly
 * @type {Record<string, string>}
 */
const InputTypes = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    RANGE: 'range'
});

/**
 * @readonly
 * @type {Record<string, string>}
 */
const AllowedNumericInputs = Object.freeze({
    NUMBER: InputTypes.NUMBER,
    RANGE: InputTypes.RANGE
});

// * MARK:Methods

/**
 * @param {HTMLElement} input
 */
function getStatusFromInput(input) {
    const $input = $(input);
    const { avatar } = $input.data();

    return {
        $input,
        avatar,
        status: StatUsMaximus.getStatus(avatar),
        field: /** @type {keyof EntryData|keyof AltValueData} */($input.attr('name')),
        value: /** @type {any} */($input.val()),
        data: $input.data() ?? {},
    };
}

/**
 * @param {Status} status
 * @param {EntryData} entryData
 * @param {string} statusId
 * @param {JQuery} $container
 */
async function appendEntryBlock(status, entryData, statusId, $container) {
    const uid = status.addEntry(entryData || {});
    const entry = status.getEntry(uid);
    const $entryBlock = await createEntryBlock(entry, uid, status.avatar, statusId);

    $container.append($entryBlock);
}

/**
 * @param {JQuery} $input
 * @param {number} value
 * @returns {number}
 */
function normalizeRangeValue($input, value, direction = 0) {
    const min = Number($input.attr('min'));
    const max = Number($input.attr('max'));
    const step = Number($input.attr('step'));

    if (!Number.isFinite(step) || step <= 0) return value;

    const steppedValue = value + (step * direction);
    const flooredValue = Math.max(steppedValue, min);
    const clampedValue = Math.min(flooredValue, max);
    const stepAmount = Math.floor((clampedValue - min) / step);

    return min + (stepAmount * step);
}

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} inputTrigger
 */
function updateEntryFromInput(inputTrigger) {
    const $container = $(inputTrigger).closest('span.fake-inputs-container[data-field]').first();

    if (!$container.length) return;

    const { avatar, uid, value_uid, field } = $container.data();

    if (!avatar || isNaN(uid)) return;

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const entry = status.getEntry(Number(uid));

    if (!entry || !entry.getValue(Number(value_uid))) return;

    let fieldValue = lodash.cloneDeep(
        field === 'value' ?
        entry.getValue(Number(value_uid)).value :
        entry[field]
    );

    const operationUID = generateUUID(`::${metadataName}_macro_parsing_done`);
    const $inputSources = $container.find('.input-value-source');

    $inputSources.each(function(i, input) {
        const $input = $(input);
        const { type, original } = $input.data();

        if (!original) return;

        let newMacro = '';

        if (type === InputTypes.TEXT || type === InputTypes.NUMBER) {
            let value = $input.val() ?? '';
            const separator = !value ? '' : '::';

            if (type === InputTypes.TEXT) {
                value = String(value)
                    .replaceAll(/^\s+/g, '{{noop}}$&')
                    .replaceAll(/\s+$/g, '$&{{noop}}');
            }

            newMacro = `{{${type}${separator}${value}${operationUID}}}`;
        }

        if (type === InputTypes.BOOLEAN) {
            const value = $input.prop('checked') ?? true;
            const inputId = $input.attr('id');
            const $span = $(`.fake-input-span[data-input-id="${inputId}"]`);

            const { trueValue, falseValue } = $span.data();

            newMacro = `{{${type}::${value}::${trueValue}::${falseValue}${operationUID}}}`;
        }

        if (type === InputTypes.RANGE) {
            const value = $input.val() ?? 100;
            const min = $input.attr('min') ?? 0;
            const max = $input.attr('max') ?? 100;
            const step = $input.attr('step') ?? 1;

            newMacro = `{{${type}::${min}::${max}::${step}::${value}${operationUID}}}`;
        }

        fieldValue = fieldValue.replace(original, newMacro);
        $input.data('original', newMacro.replace(operationUID, ''));
    });

    fieldValue = fieldValue.replaceAll(operationUID, '');
    entry.set(field, fieldValue, value_uid);
}

/**
 * @param {string} field
 * @param {any} value
 * @returns {any}
 */
function cleanWonkyStatusValues(field, value) {
    const numValue = Number(value);
    const isEmpty = (value ?? '') === '';

    if (field === 'force_depth' && isEmpty) return -1;
    if (field === 'force_depth') return numValue;

    return value;
}

// * MARK:General

/**
 * @param {EventData<HTMLInputElement>} e
 */
async function onAvatarFileUpload(e) {
    const { $input, status, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;
    const form = $input.closest('form').get().at(0);

    if (!status || !form) return;

    const formData = new FormData(form);
    const file = formData.get('file');
    const fileInstance = file instanceof File;

    if (!fileInstance) return;

    const fileExtension = file.type.split('/').at(-1);

    if (!fileExtension) return;

    const oldThumbnail = status.getThumbnail();
    const attachment = await StatUsMaximus.FileManager.imageUpload({
        path: status?.thumbnail,
        name: generateUUID(metadataName + '_avatar_file'),
        format: fileExtension,
        image: file
    });

    const newThumbnail = status
        .set('thumbnail', attachment?.url || '')
        .getThumbnail();

    eventSource.emit(StatUsMaximus.EVENTS.THUMBNAIL_UPDATE, {
        oldThumbnail,
        newThumbnail,
        avatar: status.avatar
    });

    $(`#${statusId}`)
        .find(`.${htmlSuffix}-avatar`)
        .attr('src', `${newThumbnail}?v=${Date.now()}`);
}

// * MARK:In Chat

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onToggleStatus(e) {
    const { $input, status } = getStatusFromInput(e.currentTarget);

    if (!status) return;

    status.set('enabled', !status.enabled);
    $input.toggleClass('toggleEnabled', status.enabled);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onToggleEntry(e) {
    const { $input, status, data } = getStatusFromInput(e.currentTarget);
    const { uid, enabled } = data;

    if (!status) return;

    const nextState = !enabled;
    const entry = status.getEntry(uid);

    if (!entry) return;

    entry.set('enabled', nextState);
    $input
        .data({enabled: nextState})
        .toggleClass('fa-toggle-on', nextState)
        .toggleClass('fa-toggle-off', !nextState)
        .closest(`.${htmlSuffix}-entry-row`)
        .toggleClass('disabled', !nextState);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onRenameStatus(e) {
    const { data, status } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;

    if (!status) return;

    const newName = await popupRequestInput({
        actionLabel: t`Input a new name for the Status block`,
        defaultValue: status.name,
    });

    if (!newName) return;

    status.set('name', newName);

    $(`#${statusId}`)
        .find(`.${htmlSuffix}-name`)
        .text(newName);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onCollapseStatus(e) {
    const { $input, status } = getStatusFromInput(e.currentTarget);

    if (!status) return;

    const doClose = $input
        .find('.inline-drawer-icon')
        .hasClass('up');

    status.set('is_collapsed', doClose);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onCollapsePopupBlock(e) {
    const { $input, status } = getStatusFromInput(e.currentTarget);
    const oppositeState = $input.attr('collapsed') === 'true' ? 'false' : 'true';

    if (!status) return;

    $input.attr('collapsed', oppositeState);
    status.set('is_collapsed', oppositeState === 'true');
}

/**
 * @param {JQuery.EventBase} e
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
            const normalizedValue = normalizeRangeValue($input, newValue);
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
        const normalizedValue = normalizeRangeValue($input, currentValue, direction);
        newValue = normalizedValue;
        window.requestAnimationFrame(() => {
            $(`input[data-input-id="${inputId}"].chat-input-editor`).val(normalizedValue);
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
    const { avatar } = getStatusFromInput(e.currentTarget);

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
    const { status, data } = getStatusFromInput(e.currentTarget);

    const {
        altUid,
        uid,
        character,
        statusBlockId,
        listId
    } = data;

    if (!statusBlockId) return;

    const $entryBlock = $(`#chat .${htmlSuffix}-entry-row[status-block-id="${statusBlockId}"][uid="${uid}"]`).first();
    const popperInstance = $entryBlock.find('.status-value-uid').first().data('switchValuePopper');
    const optionList = $(`#${listId}`)[0];

    if (!status)
        return await hidePopper(popperInstance, optionList);

    const entry = status.getEntry(uid);

    if (Number(entry.value_uid) === Number(altUid))
        return await hidePopper(popperInstance, optionList);

    entry.set('value_uid', altUid);

    const macroParser = extensionSettings.editNumbersFromChat ? 'getInputs' : 'getValues';
    const replaceMacrosOptions = {newlines: true, macros: true, macroParser, character: status.name || character};
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

    if (!$clickedElement?.length) return;

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
function onRefreshBlock(e) {
    const { status } = getStatusFromInput(e.currentTarget);

    if (!status) return;

    StatUsMaximus.renderStatusSafe(status);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onOpenPopupOnEntry(e) {
    e.preventDefault();

    const { status, avatar, data } = getStatusFromInput(e.currentTarget);
    const { uid } = data;

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
 * @param {EventData<HTMLDivElement>} e
 */
function onTogglePrivateEntry(e) {
    const { $input, status, data } = getStatusFromInput(e.currentTarget);
    const { uid, enabled: isPrivate } = data;

    if (!status) return;

    const nextState = !isPrivate;
    const entry = status.getEntry(uid);

    if (!entry) return;

    entry.set('private', nextState);
    $input
        .data({enabled: nextState})
        .toggleClass('text-quote', nextState);
}

/**
 * @param {EventData<HTMLElement>} e
 */
function onDocumentClick(e) {
    onHidePopperLists(e);
}

// * MARK:Popup

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onPopupStatusInput(e) {
    const { status, field, value } = getStatusFromInput(e.currentTarget);

    if (!status) return;

    status.set(field, cleanWonkyStatusValues(field, value));
}

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onPopupEntryInput(e) {
    const { status, field, value, data } = getStatusFromInput(e.currentTarget);
    const { uid } = data;


    if (!status) return;

    const entry = status.getEntry(uid);
    const valueClean = field === 'value_uid' ? Number(value) : value;

    entry.set(field, valueClean, entry.value_uid);
}

/**
 * @param {EventData<HTMLInputElement>} e
 */
function onAltTitleInput(e) {
    const { value, data } = getStatusFromInput(e.currentTarget);
    const { uid, statusId } = data;

    const $statusBlock =  $(`#${statusId}`);
    const $valuesOption = $statusBlock
        .find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`)
        .find('select[name="value_uid"]')
        .find(':selected');

    $valuesOption.text(value || `UID: ${uid}`);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateEntry(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;

    if (!status) return;

    const $statusBlock = $(`#${statusId}`);
    const $container = $statusBlock.find('.status-entries').first();

    await appendEntryBlock(status, null, statusId, $container);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onCreateEntryValue(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { uid, statusId } = data;

    if (!status) return;

    const valueUID = status
        .getEntry(uid)
        .addValue('', '');

    if (typeof valueUID !== 'number' || valueUID < 0) return;

    status
        .getEntry(uid)
        .swapValue(valueUID);

    const $statusBlock =  $(`#${statusId}`);
    const $entryBlock = $statusBlock.find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`);
    const $valuesSelect = $entryBlock.find('select[name="value_uid"]');

    $('<option>', { text: `UID: ${valueUID}`, value: valueUID }).appendTo($valuesSelect);

    $valuesSelect
        .val(valueUID)
        .trigger('change');

    $entryBlock.find(':input[name="value"]').val('');
    $entryBlock.find(':input[name="title"]').val('');
}

/**
 * @param {EventData<HTMLSelectElement>} e
 */
function onEntryValueSwap(e) {
    const { $input: $select, status, data, value: selectedUID } = getStatusFromInput(e.currentTarget);
    const { uid } = data;

    if (!status) return;

    const entry = status.getEntry(uid);
    const altValue = entry.getValue(selectedUID);
    const $container = $select.closest('.inline-drawer-content');

    $container.find(':input[name="value"]').val(altValue.value);
    $container.find(':input[name="title"]').val(altValue.title);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteEntryValue(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { uid, statusId } = data;

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete this entry value');

        if (!accepted) return toastr.info(t`Entry value deletion cancelled`, extensionName);

        const entry = status.getEntry(uid);
        const deletionSuccess = entry.delValue();

        if (!deletionSuccess) return;

        const $statusBlock =  $(`#${statusId}`);
        const $entryBlock = $statusBlock.find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`);
        const $selectValue = $entryBlock.find('select[name="value_uid"]');
        const newValueSelected = String(entry.get('value_uid'));

        $selectValue
            .find(':selected')
            .remove();

        $selectValue
            .val(newValueSelected)
            .trigger('change');

        $entryBlock.find(':input[name="value"]').val(entry.get('value').toString());
        $entryBlock.find(':input[name="title"]').val(entry.get('title').toString());
    } catch (err) {
        StatUsMaximus.error(err);
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteEntry(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { uid, statusId } = data;

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete this entry');

        if (!accepted) return toastr.info(t`Entry deletion cancelled`, extensionName);

        status.delEntry(uid);

        const $statusBlock = $(`#${statusId}`);
        const $container = $statusBlock.find(`.${htmlSuffix}-popup-row[entry-uid="${uid}"]`).first();

        $container.remove();
    } catch (err) {
        StatUsMaximus.error(err);
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onBulkToggleEntryDrawer(e) {
    const { $input: $button, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;
    const $statusBlock = $(`#${statusId}`);
    const $entryContainers = $statusBlock.find(`.${htmlSuffix}-popup-row`);

    $entryContainers.each(function(i, row) {
        const $rowToggle = $(row).find('.inline-drawer-toggle');
        const direction = $button.hasClass('fa-compress') ? '.up' : '.down';

        if ($rowToggle.is(direction)) $rowToggle.trigger('click');
    });
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateStatus(e) {
    const { data } = getStatusFromInput(e.currentTarget);
    let { avatar, is_user, is_detached = false, statusId } = data;

    if (!avatar && is_detached) {
        avatar = StatUsMaximus.Status.createAvatarUID();
    }

    if (!avatar) return;

    const status = StatUsMaximus.addStatus(avatar, {is_user, is_detached});

    if (!status) return;

    const $statusBlockEmpty = $(`#${statusId}`);
    const $statusBlock = await getStatusPopupBlock(avatar, is_user);

    if (!$statusBlock) return;

    $statusBlockEmpty.before($statusBlock);

    if (!status.is_detached) $statusBlockEmpty.remove();
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCopyEntry(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { uid } = data;

    if (!status) return;

    const entry = status.getEntry(uid);

    await exportObjectToClipboard(entry);
    toastr.info(t`Entry copied into the clipboard`, extensionName)
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateEntryFromClipboard(e) {
    if (!navigator.clipboard)
        return toastr.warning(t`Clipboard API not available in this context.`);

    const { status, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;

    if (!status) return;

    let newEntry;
    const $statusBlock = $(`#${statusId}`);
    const $entriesContainer = $statusBlock.find('.status-entries');

    try {
        newEntry = await navigator.clipboard.readText();
        newEntry = JSON.parse(newEntry);
    } catch (error) {
        StatUsMaximus.error('Error reading clipboard:', error);
        return toastr.warning(t`Failed to read clipboard text. Make sure you granted permissions to the page and the text is a JSON object.`, extensionName);
    }

    await appendEntryBlock(status, newEntry, statusId, $entriesContainer);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onTransferStatus(e) {
    const { status, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;
    const $statusBlock = $(`#${statusId}`);

    if (!status) return;

    const {
        status: newStatus,
        keepOriginal,
        onlyEntries
    } = await cloneStatusPopup(status.getCharacter());

    if (!newStatus) return;

    const $newStatusBlock = await getStatusPopupBlock(newStatus.avatar, newStatus.is_user);

    if (!$newStatusBlock) return;

    const $creationBlock = $(`.stat-us-maximus-popup-empty[avatar="${newStatus.avatar}"]`);

    if ($creationBlock.length > 0) {
        $creationBlock.before($newStatusBlock);
        $creationBlock.remove();
    } else {
        $statusBlock.after($newStatusBlock);
    }

    if (!keepOriginal) {
        if (onlyEntries) $statusBlock
            .find('.stat-us-maximus-popup-row')
            .remove();
        else $statusBlock.remove();
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteStatus(e) {
    const { status, avatar, data } = getStatusFromInput(e.currentTarget);
    const { statusId } = data;

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete Status data for this character');

        if (!accepted) return toastr.info(t`Status deletion cancelled`, extensionName);

        const { is_user, is_detached } = status;
        const isDetached = is_detached === true;
        const character = status.getCharacter();
        const thumbnail = status.getThumbnail();

        const $statusBlock = $(`#${statusId}`);
        const $statusBlockEmpty = await HTML_TEMPLATES.get('popupStatusEmpty', {clone: true});
        const newStatusId = `${generateUUID()}_stat_block`;

        $statusBlockEmpty
            .attr('id', newStatusId);

        $statusBlockEmpty
            .find(`.${htmlSuffix}-name`)
            .text(character.name);

        $statusBlockEmpty
            .find(`.${htmlSuffix}-avatar`)
            .attr('src', thumbnail)
            .attr('title', avatar);

        $statusBlockEmpty
            .find(`.create-status`)
            .data({avatar, is_user, statusId: newStatusId});

        const deleteSuccess = StatUsMaximus.delStatus(status);

        if (!deleteSuccess) return;

        if (!isDetached) $statusBlock.after($statusBlockEmpty);

        $statusBlock.remove();
    } catch (err) {
        StatUsMaximus.error(err);
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onMacroShortcut(e) {
    const { $input: $button, status, data } = getStatusFromInput(e.currentTarget);
    const { uid, statusId } = data;
    const macro = $button.attr('macro');

    if (!extensionSettings.altMacroTemplateBehavior)
        return copyText(macro);

    if (!status) return;

    const $statusBlock = $(`#${statusId}`);
    const $input = $statusBlock
        .find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`)
        .find(':input[name="value"]');

    const newValue = $input.val() + macro;

    $input.val(newValue);

    status
        .getEntry(Number(uid))
        .setValue('value', newValue);
}