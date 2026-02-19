import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    Popup,
    t,
    // Normal imports
    extensionName,
    escapeNewlines,
    generateUUID,
    saveMetadataSafe,
    metadataName,
    htmlSuffix,
    error,
    log,
    // HTML related
    HTML_TEMPLATES
} from '../../index.js';

import {Status} from '../classes/Status.js';
import {StatusEntry} from '../classes/StatusEntry.js';

export {
    initPopupTriggers,
    openSingleStatusPopup
};

/**
 * @template T
 * @typedef {import('./eventListeners.js').EventData<T>} EventData
 */

// * MARK:Popup Creation

/** Clones the status data of the selected `char`
    @param {object} char
    @returns {Promise<boolean|object>}
*/
// async function clonePopup(char) {
//     const cloneContainer = document.createElement("div");
//     cloneContainer.classList.add("stat-us-max-popup");

//     const cloneWrapper = document.createElement("div");
//     cloneWrapper.classList.add("d-flex", "flex-col");
//     cloneWrapper.innerHTML = `<span>${t`Clone ${char.name} stats`}</span>`;

//     const defOption = document.createElement("option");
//     defOption.value = null;
//     defOption.innerText = t`--Select target--`;

//     const selectParticipant = document.createElement("select");
//     selectParticipant.classList.add("flex-grow-1", "px-5px", "m-0");
//     selectParticipant.append(defOption);

//     const participants = [
//         ...Object
//             .entries(power_user.personas)
//             .map(([key, value]) => {return {name: value, avatar: key, is_user: true}}),
//         ...characters
//     ].filter(c => c.avatar !== char.avatar);

//     for (const participant of participants) {
//         const option = document.createElement("option");
//         option.value = String(participant.avatar);
//         option.innerText = String(participant.name);
//         selectParticipant.append(option);
//     }

//     const inputOnlyEntries = document.createElement("input");
//     inputOnlyEntries.type = "checkbox";

//     const spanOnlyEntries = document.createElement("span");
//     spanOnlyEntries.innerText = t`Transfer only entries`;

//     const labelOnlyEntries = document.createElement("label");
//     labelOnlyEntries.classList.add("flex-container");
//     labelOnlyEntries.append(
//         inputOnlyEntries,
//         spanOnlyEntries
//     );

//     cloneWrapper.append(labelOnlyEntries, selectParticipant);
//     cloneContainer.append(cloneWrapper);

//     const popupResult = await callGenericPopup(cloneContainer, POPUP_TYPE.CONFIRM, "", {
//         okButton: t`Confirm`,
//         cancelButton: t`Cancel`
//     });

//     if (!popupResult) return false;

//     const target = participants.find(c => c.avatar === selectParticipant.value);
//     const success = !target ? false : transferCharStatus(char, target, {onlySendEntries: inputOnlyEntries.checked});

//     if (success) toastr.success(t`Status clone successfully`);
//     else toastr.error(t`An error occurred - Status could not be clone`);

//     destroyElement(cloneContainer);

//     return success ? target : false;
// }

/**
 * Set user clipboard to a stringified version of an object
 * @param {object} obj - Object to be sent to the clipboard as text
 * @returns {Promise<void>}
 */
// function exportObjectToClipboard(obj = {}) {
//     let stringObj = JSON.stringify(obj);
//     stringObj = escapeNewlines(stringObj);

//     return copyText(stringObj);
// }

/**
 * @param {string} actionLabel - Are you sure want to...
 * @returns {Promise<boolean>}
 */
async function popupConfirmAction(actionLabel = 'continue') {
    const result = await Popup.show.confirm(
        t`WARNING`,
        t`Are you sure want to ${actionLabel}?`,
        {
            okButton: t`Confirm`,
            cancelButton: t`Cancel`
        }
    );

    return result === 1;
};

/**
 * @param {StatusEntry} entry
 * @param {string|number} uid
 * @param {string} avatar
 * @param {string} statusId
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function createEntryBlock(entry, uid, avatar, statusId) {
    const $entryBlock = $(await HTML_TEMPLATES.get('popupStatusEntry')).clone();
    const $valuesSelect = $entryBlock.find('select[name="value_uid"]');
    const altValues = Object.entries(entry.values);

    for (const [valUid, altValue] of altValues) {
        $('<option>', { text: altValue.title || `UID: ${valUid}`, value: valUid }).appendTo($valuesSelect);
    }

    $valuesSelect.trigger('change');

    $entryBlock
        .find('.delete-row')
        .data({uid, avatar, statusId});

    $entryBlock
        .find(':input.text_pole')
        .each(function(i, input) {
            const $input = $(input);
            const field = $input.attr('name');
            const isValueField = field === 'title' || field === 'value';
            const value = isValueField ? entry.values[entry.value_uid][field] : entry[field];
            const doEscapeNewlines = typeof value === 'string' && !$input.is('textarea');

            $input
                .data({uid, avatar, statusId})
                .val(doEscapeNewlines ? escapeNewlines(value) : value)
                .trigger('change');
        });

    $entryBlock
        .attr('entry-uid', uid);

    return $entryBlock;
}

/**
 * @param {string} avatar
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusPopupBlock(avatar) {
    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const $statusBlock = $(await HTML_TEMPLATES.get('popupStatus')).clone();
    const $selectRoles = $statusBlock.find('select[name="role"]');
    const $entriesContainer = $statusBlock.find('.status-entries');
    const statusId = `${generateUUID()}_stat_block`;

    /** @type {[string, StatusEntry][]} */
    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    if (status.is_user) $statusBlock.attr('is_user', 'true');

    $statusBlock.attr('id', statusId);

    $statusBlock
        .find(`.${htmlSuffix}-name`)
        .text(status.getCharacter().name);

    $statusBlock
        .find(`.${htmlSuffix}-avatar`)
        .attr('src', status.getThumbnail())
        .attr('title', status.avatar);

    $statusBlock
        .find('.status-toolbar .menu_button')
        .data({avatar, statusId});

    for (const [text, value] of Object.entries(extension_prompt_roles)) {
        $('<option>', { text, value }).appendTo($selectRoles);
    }

    $selectRoles.trigger('change');
    $statusBlock
        .find('.status-fields :input.text_pole')
        .each(function(i, input) {
            const $input = $(input);
            const field = $input.attr('name');
            const value = status[field];
            const isString = typeof value === 'string';

            $input
                .data({avatar, statusId})
                .val(isString ? escapeNewlines(value) : value)
                .trigger('change');
        });

    for (const [uid, entry] of entries) {
        const $entryBlock = await createEntryBlock(entry, uid, avatar, statusId);
        $entriesContainer.append($entryBlock);
    }

    return $statusBlock;
}

/**
 * @param {string} avatar
 */
async function openSingleStatusPopup(avatar) {
    const $statusBlock = await getStatusPopupBlock(avatar);

    if (!$statusBlock) return;

    await callGenericPopup($statusBlock, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: () => {
            const doSave = $statusBlock.data().doSave;

            if (doSave) saveMetadataSafe();

            $statusBlock.remove();
        }
    });

    StatUsMaximus.renderStatusesSafe();
}

// * MARK:Shortcuts

/**
 * @param {EventData<HTMLImageElement>} e
 */
async function onGroupMemberListClick(e) {
    const img = e.currentTarget;
    const avatar = img.title;

    if (!avatar) return;

    await openSingleStatusPopup(avatar);
}

// * MARK:Input Listeners

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onStatusInput(e) {
    const $input = $(e.currentTarget);
    const newValue = $input.val();
    const field = $input.attr('name');
    const { avatar, statusId } = $input.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    status.set(field, newValue);
    $(`#${statusId}`).data({doSave: true});
}

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onEntryInput(e) {
    const $input = $(e.currentTarget);
    const newValue = $input.val();
    const field = $input.attr('name');
    const { uid, avatar, statusId } = $input.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];

    entry.set(field, newValue, entry.value_uid);
    $(`#${statusId}`).data({doSave: true});
}

/**
 * @param {EventData<HTMLSelectElement>} e
 */
function onEntryValueSwap(e) {
    const $select = $(e.currentTarget);
    const selectedAltValue = String($select.val());
    const { uid, avatar } = $select.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];
    const altValue = entry.values[selectedAltValue];

    const $container = $select.closest('.inline-drawer-content');

    $container.find(':input[name="value"]').val(altValue.value);
    $container.find(':input[name="title"]').val(altValue.title);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateEntryClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, statusId } = $button.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const uid = status.addEntry();
    const entry = status.entries[uid];
    const $entryBlock = await createEntryBlock(entry, uid, avatar, statusId);
    const $statusBlock = $(`#${statusId}`);
    const $container = $statusBlock.find('.status-entries').first();

    $container.append($entryBlock);
    $statusBlock.data({doSave: true});
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteEntryClick(e) {
    const $button = $(e.currentTarget);
    const { uid, avatar, statusId } = $button.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete this entry');

        if (!accepted) return toastr.info(t`Entry deletion cancelled`, extensionName);

        delete status.entries[uid];

        const $statusBlock = $(`#${statusId}`);
        const $container = $statusBlock.find(`.${htmlSuffix}-popup-row[entry-uid="${uid}"]`).first();

        $container.remove();
        $statusBlock.data({doSave: true});
    } catch (err) {
        error(err);
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onBulkToggleEntryDrawer(e) {
    const $button = $(e.currentTarget);
    const { statusId } = $button.data();
    const $statusBlock = $(`#${statusId}`);
    const $entryContainers = $statusBlock.find(`.${htmlSuffix}-popup-row`);

    $entryContainers.each(function(i, row) {
        const $rowToggle = $(row).find('.inline-drawer-toggle');
        const direction = $button.hasClass('fa-compress') ? '.up' : '.down';

        if ($rowToggle.is(direction)) $rowToggle.trigger('click');
    });
}

// * MARK:Init Triggers

function initPopupTriggers() {
    // @ts-ignore
    $('#rm_group_members').on('click', '.avatar img', onGroupMemberListClick);

    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .menu_button.fa-plus`, onCreateEntryClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .menu_button.status-bulk-toggle`, onBulkToggleEntryDrawer);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .delete-row`, onDeleteEntryClick);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup-row .text_pole`, onEntryInput);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup-row select[name="value_uid"]`, onEntryValueSwap);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup .status-fields .text_pole`, onStatusInput);
}