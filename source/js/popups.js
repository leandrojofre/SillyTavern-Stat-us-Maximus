import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    t,
    // Normal imports
    metadataName,
    escapeNewlines,
    generateUUID,
    saveMetadataSafe,
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

/**
 * @param {StatusEntry} entry
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusEntryPopupBlock(entry) {
    const $statusBlock = $(await HTML_TEMPLATES.get('popupStatusEntry')).clone();

    return $statusBlock;
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
                .data({avatar})
                .val(isString ? escapeNewlines(value) : value)
                .trigger('change');
        });

    for (const [uid, entry] of entries) {
        const $entryBlock = await getStatusEntryPopupBlock(entry);
        const $valuesSelect = $entryBlock.find('select[name="value_uid"]');
        const altValues = Object.entries(entry.values);

        for (const [valUid, altValue] of altValues) {
            $('<option>', { text: altValue.title || `UID: ${valUid}`, value: valUid }).appendTo($valuesSelect);
        }

        $valuesSelect.trigger('change');
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

/**
 * @param {EventData<HTMLImageElement>} e
 */
async function onGroupMemberListClick(e) {
    const img = e.currentTarget;
    const avatar = img.title;

    if (!avatar) return;

    await openSingleStatusPopup(avatar);
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

function initPopupTriggers() {
    // @ts-ignore
    $('#rm_group_members').on('click', '.avatar img', onGroupMemberListClick);

    // @ts-ignore
    $(document).on('input', '.popup .stat-us-maximus-popup-row .text_pole:not(select)', onEntryInput);
}