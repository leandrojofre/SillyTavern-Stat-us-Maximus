import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    Popup,
    powerUserSettings,
    copyText,
    t,
    // Normal imports
    extensionName,
    escapeNewlines,
    generateUUID,
    saveMetadataSafe,
    getThumbnailUrl,
    getParticipant,
    getActiveParticipants,
    extensionSettings,
    getUser,
    isChatOpen,
    exportObjectToClipboard,
    context,
    // HTML related
    HTML_TEMPLATES,
    htmlSuffix,
    createElement
} from '../../index.js';

import {Status} from '../classes/Status.js';
import {StatusEntry} from '../classes/StatusEntry.js';

export {
    initPopupTriggers,
    openSingleStatusPopup
};

/**
 * @template T
 * @typedef {StatUsMaximus.EventData<T>} EventData
 */

/** @typedef {StatUsMaximus.UserCharacter} UserCharacter */

// * MARK:Popup Creation

/** Clones the status data of the selected `char`
    @param {Character|UserCharacter} char
    @returns {Promise<{status: false|Status; keepOriginal: boolean; onlyEntries: boolean;}>}
*/
async function cloneStatusPopup(char) {
    const {
        characters
    } = context();

    const users = Object
        .entries(powerUserSettings.personas)
        .map(([key, value]) => ({name: value, avatar: key, is_user: true}));

    const participants = [
        ...users,
        ...characters
    ].filter(c => c.avatar !== char.avatar);

    const $popupBlock = await HTML_TEMPLATES.get('popupStatusClone', {clone: true});

    $popupBlock
        .find('.transfer-popup-title')
        .text(t`Clone ${char.name} stats`);

    const $select = $popupBlock.find('select');
    const $checkboxOnlyEntries = $popupBlock.find('input.transfer-only-entries');
    const $keepOriginalData = $popupBlock.find('input.keep-original-data');

    for (const participant of participants) {
        $('<option>', { text: `${participant.name} - ${participant.avatar}`, value: participant.avatar }).appendTo($select);
    }

    const failedResponse = {status: false, keepOriginal: false, onlyEntries: false};
    const popupResult = await callGenericPopup($popupBlock, POPUP_TYPE.CONFIRM, "", {
        wider: true,
        okButton: t`Confirm`,
        cancelButton: t`Cancel`
    });

    if (!popupResult) {
        toastr.info(t`Transfer cancelled`, extensionName);
        // @ts-ignore
        return failedResponse;
    }

    const target = participants.find(c => c.avatar === $select.val());

    if (!target) {
        toastr.error(t`An error occurred - The character/persona could not be found`, extensionName);
        // @ts-ignore
        return failedResponse;
    }

    const oldStatus = StatUsMaximus.getStatus(char.avatar);
    const isUser = users.some(p => p.avatar === target.avatar);
    const onlyEntries = $checkboxOnlyEntries.prop('checked');
    const keepOriginalData = $keepOriginalData.prop('checked');

    StatUsMaximus.log(target, users, isUser)

    if (!oldStatus) {
        toastr.info(t`An error occurred - The original Status could not be found`, extensionName);
        // @ts-ignore
        return failedResponse;
    }

    const newStatus = StatUsMaximus.transferStatus(char.avatar, target.avatar, {onlyEntries, isUser});

    if (!newStatus) {
        toastr.error(t`An error occurred - The Status could not be cloned`, extensionName);
        // @ts-ignore
        return failedResponse;
    }

    if (!keepOriginalData) {
        if (onlyEntries)
            for (const uid in oldStatus.entries)
                oldStatus.delEntry(Number(uid));
        else StatUsMaximus.delStatus(oldStatus);
    }

    toastr.success(t`Status cloned successfully`);

    return {status: newStatus, keepOriginal: keepOriginalData, onlyEntries};
}

/**
 * Gets a drag delay for sortable elements. This is to prevent accidental drags when scrolling.
 * @returns {number} The delay in milliseconds. 50ms for desktop, 750ms for mobile.
 */
function getSortableDelay() {
    const mobileTypes = ['mobile', 'tablet'];
    const userAgent = SillyTavern.libs.Bowser.parse(navigator.userAgent);
    const isMobile = mobileTypes.includes(userAgent?.platform?.type);

    return isMobile ? 750 : 50;
}

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
    const $entryBlock = await HTML_TEMPLATES.get('popupStatusEntry', {clone: true});
    const $valuesSelect = $entryBlock.find('select[name="value_uid"]');
    const altValues = Object.entries(entry.values);

    for (const [valUid, altValue] of altValues) {
        $('<option>', { text: altValue.title || `UID: ${valUid}`, value: valUid }).appendTo($valuesSelect);
    }

    $valuesSelect.trigger('change');

    $entryBlock
        .find('.status-entry-toolbar .menu_button')
        .data({uid, avatar, statusId});

    $entryBlock
        .find('.delete-row')
        .data({uid, avatar, statusId});

    $entryBlock
        .find('.kill-switch')
        .data({uid, avatar, statusId, enabled: entry.enabled})
        .toggleClass('fa-toggle-on', entry.enabled)
        .toggleClass('fa-toggle-off', !entry.enabled);

    $entryBlock
        .find(':input.text_pole')
        .each(function(i, input) {
            const $input = $(input);
            const field = $input.attr('name');
            const isValueField = field === 'title' || field === 'value';
            const value = isValueField ? entry.values[entry.value_uid][field] : entry[field];

            // ! Escaping is not needed anymore after reworking newlines escaping, but it will be kept for compatibility as older entries don't have newlines escaped
            const doEscapeNewlines = typeof value === 'string' && field !== 'value';

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
 * MARK:getStatusPopupBlock()
 * @param {string} avatar
 * @param {boolean?} [is_user]
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusPopupBlock(avatar, is_user = false) {
    let status = StatUsMaximus.getStatus(avatar);

    if (!status) {
        if (!extensionSettings.autoDetectParticipants) {
            const $statusBlockEmpty = await HTML_TEMPLATES.get('popupStatusEmpty', {clone: true});
            const statusId = `${generateUUID()}_stat_block`;
            const character = getParticipant(avatar, {is_user});

            if (!character) return;

            const thumbnail = getThumbnailUrl(is_user ? 'persona' : 'avatar', character.avatar);

            $statusBlockEmpty
                .attr('id', statusId);

            $statusBlockEmpty
                .find(`.${htmlSuffix}-name`)
                .text(character.name);

            $statusBlockEmpty
                .find(`.${htmlSuffix}-avatar`)
                .attr('src', thumbnail)
                .attr('title', character.avatar);

            $statusBlockEmpty
                .find(`.create-status`)
                .data({avatar, is_user, statusId});

            return $statusBlockEmpty;
        }

        status = StatUsMaximus.addStatus(avatar, is_user);

        if (!status) return;
    };

    const $statusBlock = await HTML_TEMPLATES.get('popupStatus', {clone: true});
    const $selectRoles = $statusBlock.find('select[name="role"]');
    const $entriesContainer = $statusBlock.find('.status-entries');
    const statusId = `${generateUUID()}_stat_block`;

    /** @type {[string, StatusEntry][]} */
    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    $statusBlock
        .attr('id', statusId)
        .attr('avatar', avatar)
        .attr('is_user', String(status.is_user));

    $statusBlock
        .find(`.${htmlSuffix}-name`)
        .text(status.getCharacter().name);

    $statusBlock
        .find(`.${htmlSuffix}-avatar`)
        .attr('src', status.getThumbnail())
        .attr('title', status.avatar);

    $statusBlock
        .find('.status-toolbar .menu_button.kill-switch')
        .toggleClass('toggleEnabled', status.enabled);

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
            const doEscapeNewlines = typeof value === 'string';

            $input
                .data({avatar, statusId})
                .val(doEscapeNewlines ? escapeNewlines(value) : value)
                .trigger('change');
        });

    for (const [uid, entry] of entries) {
        const $entryBlock = await createEntryBlock(entry, uid, avatar, statusId);
        $entriesContainer.append($entryBlock);
    }

    // @ts-ignore
    $statusBlock.sortable({
        items: '.stat-us-maximus-popup-row',
        delay: getSortableDelay(),
        handle: '.drag-handle',
        stop: function () {
            const $rows = $statusBlock.find('.stat-us-maximus-popup-row');
            const UIDsOrder = [];
            let cancel = false;
            let order = 0;

            for (const row of $rows.get()) {
                const $row = $(row);
                const rowUID = $row.attr('entry-uid');
                const rowUIDClean = Number(rowUID);

                if (isNaN(rowUIDClean) || !status.getEntry(rowUIDClean)) {
                    cancel = true;
                    break;
                }

                UIDsOrder.push(rowUIDClean);
            }

            if (cancel) return;

            for (const uid of UIDsOrder) {
                try {
                    status.getEntry(uid).set('display_position', order);
                    order++;
                } catch (err) {
                    StatUsMaximus.error(err);
                }
            }
        },
    });

    return $statusBlock;
}

/**
 * @param {string} avatar
 * @param {{is_user?: boolean; onOpen?: () => void}} [options]
 */
async function openSingleStatusPopup(avatar, {is_user = false, onOpen = () => {}} = {}) {
    const $statusBlock = await getStatusPopupBlock(avatar, is_user);

    if (!$statusBlock) return;

    await callGenericPopup($statusBlock, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onOpen,
        onClose: () => {
            $statusBlock.remove();
        }
    });

    StatUsMaximus.renderStatusesSafe();
}

/**
 * @param {{avatar: string; is_user?: boolean}[]} avatars
 */
async function openMultiStatusPopup(avatars = []) {
    if (!avatars?.length) return;

    const statusesWrapper = createElement('div', {
        class: `${htmlSuffix}-popup-wrapper flex-container flexFlowColumn flexnowrap gap10px padding0`
    });

    const $statusesWrapper = $(statusesWrapper);
    let noBlocksCreated = true;

    for (const {avatar, is_user} of avatars) {
        const $statusBlock = await getStatusPopupBlock(avatar, is_user);

        if (!$statusBlock) continue;

        $statusesWrapper.append($statusBlock);
        noBlocksCreated = false;
    }

    if (noBlocksCreated) return;

    await callGenericPopup($statusesWrapper, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: () => {
            $statusesWrapper.each(function(i, elem) {
                $(elem).remove();
            });

            $statusesWrapper.remove();
        }
    });

    StatUsMaximus.renderStatusesSafe();
}

// * MARK:Shortcuts

/**
 * @param {EventData<HTMLImageElement>} e
 */
async function onGroupMemberListClick(e) {
    if (!isChatOpen()) return;

    const img = e.currentTarget;
    const avatar = img.title;

    if (!avatar) return;

    await openSingleStatusPopup(avatar);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onShortcutClick(e) {
    if (!isChatOpen()) return;

    const $button = $(e.currentTarget);
    const type = $button.attr('type');

    if (type === 'save') return saveMetadataSafe();

    if (type === 'user') {
        const user = getUser();
        const avatar = user.avatar;
        return await openSingleStatusPopup(avatar, {is_user: true});
    }

    if (type === 'characters') {
        const { chars } = getActiveParticipants();
        return await openMultiStatusPopup(chars);
    }

    const members = StatUsMaximus.getStatuses();

    if (type === 'all') {
        const { chars, user } = getActiveParticipants(members.map(m => m.avatar));

        /** @type {(Character|UserCharacter|Status)[]} */
        const participants = [
            ...members,
            ...chars
        ];

        const userIncluded = participants.some(p => p.avatar === user.avatar);

        if (user && !userIncluded) participants.push(user);
        return await openMultiStatusPopup(participants);
    }

    if (type === 'users') {
        const users = members
            .filter(status => status.is_user);

        if (!users.length) return;

        return await openMultiStatusPopup(users);
    }
}

// * MARK:Input Listeners

/**
 * @param {string} field
 * @param {string|number} value
 * @returns {string|number}
 */
function cleanWonkyStatusValues(field, value) {
    const numValue = Number(value);
    const isEmpty = (value ?? '') === '';

    if (field === 'force_depth' && isEmpty) return -1;
    if (field === 'force_depth') return numValue;

    return value;
}

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onStatusInput(e) {
    const $input = $(e.currentTarget);
    const newValue = $input.val();
    const field = $input.attr('name');
    const { avatar } = $input.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    status.set(field, cleanWonkyStatusValues(field, newValue));
}

/**
 * @param {EventData<HTMLInputElement|HTMLTextAreaElement>} e
 */
function onEntryInput(e) {
    const $input = $(e.currentTarget);
    const newValue = $input.val();
    const field = $input.attr('name');
    const { uid, avatar } = $input.data();

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const entry = status.getEntry(uid);
    const valueClean = field === 'value_uid' ? Number(newValue) : newValue;

    entry.set(field, valueClean, entry.value_uid);
}

/**
 * @param {EventData<HTMLInputElement>} e
 */
function onAltTitleInput(e) {
    const $input = $(e.currentTarget);
    const newValue = $input.val();
    const { uid, statusId } = $input.data();

    const $statusBlock =  $(`#${statusId}`);
    const $valuesOption = $statusBlock
        .find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`)
        .find('select[name="value_uid"]')
        .find(':selected');

    $valuesOption.text(newValue || `UID: ${uid}`);
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
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onCreateEntryValueClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, uid, statusId } = $button.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

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
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteEntryValueClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, uid, statusId } = $button.data();

    /** @type {Status|false} */
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete this entry value');

        if (!accepted) return toastr.info(t`Entry value deletion cancelled`, extensionName);

        const entry = status.getEntry(uid);
        const deletionSuccess = entry.delValue();

        if (!deletionSuccess) return;

        const $statusBlock =  $(`#${statusId}`);
        const $entryBlock = $statusBlock.find(`.stat-us-maximus-popup-row[entry-uid="${uid}"]`);
        const $valuesSelect = $entryBlock.find('select[name="value_uid"]');

        $valuesSelect
            .find(':selected')
            .remove();
        $valuesSelect
            .val(entry.value_uid)
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
    } catch (err) {
        StatUsMaximus.error(err);
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

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateStatusClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, is_user, statusId } = $button.data();

    if (!avatar) return;

    const status = StatUsMaximus.addStatus(avatar, is_user);

    if (!status) return;

    const $statusBlockEmpty = $(`#${statusId}`);
    const $statusBlock = await getStatusPopupBlock(avatar, is_user);

    if (!$statusBlock) return;

    $statusBlockEmpty.after($statusBlock);
    $statusBlockEmpty.remove();
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCopyEntryClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, uid } = $button.data();

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const entry = status.getEntry(uid);

    await exportObjectToClipboard(entry);
    toastr.info(t`Entry copied into the clipboard`, extensionName)
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onCreateEntryFromClipboardClick(e) {
    if (!navigator.clipboard)
        return toastr.warning(t`Clipboard API not available in this context.`);

    const $button = $(e.currentTarget);
    const { avatar, statusId } = $button.data();
    const $statusBlock = $(`#${statusId}`);
    const $entriesContainer = $statusBlock.find('.status-entries');

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    let newEntry;

    try {
        newEntry = await navigator.clipboard.readText();
        newEntry = JSON.parse(newEntry);
    } catch (error) {
        StatUsMaximus.error('Error reading clipboard:', error);
        return toastr.warning(t`Failed to read clipboard text. Make sure you granted permissions to the page and the text is a JSON object.`, extensionName);
    }

    const uid = status.addEntry(newEntry);
    const entry = status.getEntry(uid);
    const $entryBlock = await createEntryBlock(entry, uid, avatar, statusId);
    $entriesContainer.append($entryBlock);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onTransferStatusClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, statusId } = $button.data();
    const $statusBlock = $(`#${statusId}`);

    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const {
        status: newStatus,
        keepOriginal,
        onlyEntries
    } = await cloneStatusPopup(status.getCharacter());

    if (!newStatus) return;

    const $newStatusBlock = await getStatusPopupBlock(newStatus.avatar, newStatus.is_user);

    if (!$newStatusBlock) return;

    $statusBlock.after($newStatusBlock);

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
function onToggleStatusClick(e) {
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
function onToggleEntrySwitch(e) {
    const $entrySwitch = $(e.currentTarget);
    const { uid, avatar, enabled } = $entrySwitch.data();
    const nextState = !enabled;
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    const entry = status.getEntry(uid);

    if (!entry) return;

    entry.set('enabled', nextState);
    $entrySwitch
        .data({enabled: nextState})
        .toggleClass('fa-toggle-on', nextState)
        .toggleClass('fa-toggle-off', !nextState);
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
async function onDeleteStatusClick(e) {
    const $button = $(e.currentTarget);
    const { avatar, statusId } = $button.data();
    const status = StatUsMaximus.getStatus(avatar);

    if (!status) return;

    try {
        const accepted = await popupConfirmAction('delete Status data for this character');

        if (!accepted) return toastr.info(t`Status deletion cancelled`, extensionName);

        const { is_user } = status;
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

        $statusBlock.after($statusBlockEmpty);
        $statusBlock.remove();
    } catch (err) {
        StatUsMaximus.error(err);
    }
}

/**
 * @param {EventData<HTMLDivElement>} e
 */
function onMacroShortcutClick(e) {
    const $button = $(e.currentTarget);
    const macro = $button.attr('macro');
    const { uid, avatar, statusId } = $button.data();

    if (!extensionSettings.altMacroTemplateBehavior)
        return copyText(macro);

    const status = StatUsMaximus.getStatus(avatar);

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

// * MARK:Init Triggers

function initPopupTriggers() {
    // @ts-ignore
    $('#rm_group_members').on('click', '.avatar img', onGroupMemberListClick);

    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .menu_button.create-status`, onCreateStatusClick);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup .status-fields .text_pole`, onStatusInput);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.kill-switch`, onToggleStatusClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-file-clipboard`, onCreateEntryFromClipboardClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-plus`, onCreateEntryClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.status-bulk-toggle`, onBulkToggleEntryDrawer);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-truck-arrow-right`, onTransferStatusClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-trash-can`, onDeleteStatusClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-plus`, onCreateEntryValueClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-trash-can`, onDeleteEntryValueClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-copy`, onCopyEntryClick);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button[macro]`, onMacroShortcutClick);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup-row .text_pole`, onEntryInput);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .fa-solid.kill-switch`, onToggleEntrySwitch)
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup-row .text_pole[name="title"]`, onAltTitleInput);
    // @ts-ignore
    $(document).on('input', `.${htmlSuffix}-popup-row select[name="value_uid"]`, onEntryValueSwap);
    // @ts-ignore
    $(document).on('click', `.${htmlSuffix}-popup-row .delete-row`, onDeleteEntryClick);

    // * Right Menu Button

    const saveMetadataButton = createElement('div', { attr: { role: 'button', type: 'save' }, class: 'menu_button flex1 fa-solid fa-floppy-disk bg-bot' });
    const charactersButton = createElement('div', { attr: { role: 'button', type: 'characters' }, class: 'menu_button flex1 fa-solid fa-table bg-bot' });
    const userButton = createElement('div', { attr: { role: 'button', type: 'user' }, class: 'menu_button flex1 fa-solid fa-user-cog bg-bot' });
    const usersButton = createElement('div', { attr: { role: 'button', type: 'users' }, class: 'menu_button flex1 fa-solid fa-users-cog bg-bot' });
    const buttonWrapper = createElement('div', {
        class: 'flex-container flexnowrap gap5px padding0',
        append: [ saveMetadataButton, charactersButton, userButton, usersButton ]
    });

    const title = createElement('small', { innerText: extensionName, class: 'paddingTop5' });
    const toolbar = createElement('div', {
        attr: { style: 'justify-content: space-between' },
        class: `${htmlSuffix}-right-menu-toolbar ${htmlSuffix}-custom-css flex-container flexFlowColumn flexnowrap gap0 padding0 paddingLeftRight5 standoutHeader`,
        append: [ title, buttonWrapper ]
    });

    $('#rm_group_chats_block .inline-drawer:has(> #groupCurrentMemberListToggle)')
        .prepend($(toolbar).clone());

    $('#avatar-and-name-block')
        .after($(toolbar).clone());

    // @ts-ignore
    $(`.${htmlSuffix}-right-menu-toolbar`).on('click', '.menu_button', onShortcutClick);

    // * Wand Menu Button

    const wandMenuShortcutText = createElement('span', { innerText: extensionName });
    const wandMenuShortcutIcon = createElement('div', { class: 'fa-solid fa-table extensionsMenuExtensionButton' });

    const wandMenuShortcut = createElement('div', {
        attr: { role: 'listitem' },
        class: 'list-group-item flex-container flexGap5 interactable',
        append: [ wandMenuShortcutIcon, wandMenuShortcutText ]
    });

    const wandMenuShortcutContainer = createElement('div', {
        attr: { id: `${htmlSuffix}-wand-menu-shortcut`, tabindex: '0', type: 'all' },
        class: 'extension_container interactable',
        append: [ wandMenuShortcut ]
    });

    $('#extensionsMenu').append(wandMenuShortcutContainer);

    // @ts-ignore
    $(`#${htmlSuffix}-wand-menu-shortcut`).on('click', onShortcutClick);
}