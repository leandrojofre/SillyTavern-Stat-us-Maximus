import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    Popup,
    t,
    // Normal imports
    extensionName,
    metadataName,
    escapeNewlines,
    generateUUID,
    saveMetadataSafe,
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

    return $entryBlock;
}

/**
 * @param {string} avatar
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusPopupBlock(avatar) {
    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

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
        .find('.stat-us-maximus-name')
        .text(status.getCharacter().name);

    $statusBlock
        .find('.stat-us-maximus-avatar')
        .attr('src', status.getThumbnail())
        .attr('title', status.avatar);

    $statusBlock
        .find('.menu_button.fa-plus')
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

    SillyTavern[metadataName].renderStatusesSafe();
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

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

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

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

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

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

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

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

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

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete this entry');

        if (!accepted) return toastr.info(t`Entry deletion cancelled`, extensionName);

        delete status.entries[uid];

        const $statusBlock = $(`#${statusId}`);
        const $container = $statusBlock.find('.stat-us-maximus-popup-row').first();

        $container.remove();
        $statusBlock.data({doSave: true});
    } catch (err) {
        error(err);
    }
}

// * MARK:Init Triggers

function initPopupTriggers() {
    // @ts-ignore
    $('#rm_group_members').on('click', '.avatar img', onGroupMemberListClick);

    // @ts-ignore
    $(document).on('click', '.stat-us-maximus-popup .menu_button.fa-plus', onCreateEntryClick);
    // @ts-ignore
    $(document).on('click', '.stat-us-maximus-popup .stat-us-maximus-popup-row .delete-row', onDeleteEntryClick);
    // @ts-ignore
    $(document).on('input', '.stat-us-maximus-popup .stat-us-maximus-popup-row .text_pole', onEntryInput);
    // @ts-ignore
    $(document).on('input', '.stat-us-maximus-popup .stat-us-maximus-popup-row select[name="value_uid"]', onEntryValueSwap);
    // @ts-ignore
    $(document).on('input', '.stat-us-maximus-popup .status-fields .text_pole', onStatusInput);
}