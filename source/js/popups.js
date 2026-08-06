import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    Popup,
    powerUserSettings,
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
    context,
    // HTML related
    HTML_TEMPLATES,
    htmlSuffix,
    createElement
} from '../../index.js';

import {Status} from '../classes/Status.js';
import {StatusEntry} from '../classes/StatusEntry.js';
import * as eventMethods from './eventMethods.js';

export {
    initPopupTriggers,
    openSingleStatusPopup,
    createEntryBlock,
    popupConfirmAction,
    popupRequestInput,
    getStatusPopupBlock,
    cloneStatusPopup,
};

/**
 * @template T
 * @typedef {StatUsMaximus.EventData<T>} EventData
 */

/** @typedef {StatUsMaximus.UserCharacter} UserCharacter */
/** @typedef {StatUsMaximus.EntryData} EntryData */
/** @typedef {StatUsMaximus.AltValueData} AltValueData */

// * MARK:Popup Creation

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
 * @param {Object} [options]
 * @param {string} [options.defaultValue] Default value for the input
 * @param {string} [options.actionLabel] Input a new value (def)
 * @returns {Promise<string>}
 */
async function popupRequestInput({actionLabel = 'Input a new value', defaultValue = ''} = {}) {
    const result = await Popup.show.input(
        extensionName,
        t`${actionLabel}?`,
        defaultValue || '',
        {
            okButton: t`Confirm`,
            cancelButton: t`Cancel`,
        }
    );

    return (result || '').trim();
};

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
 * MARK:createEntryBlock
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
        .find('.menu_button.make-private')
        .data({uid, avatar, statusId, enabled: entry.private})
        .toggleClass('text-quote', entry.private);

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
 * @param {boolean} [deleteOldBlock]
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function createDetachedStatusBlock(deleteOldBlock = true) {
    if (deleteOldBlock) $(`#${htmlSuffix}-popup-create-detached`).remove();

    const $container = await HTML_TEMPLATES.get('popupStatusDetached', {clone: true});

    $container
        .find(`.create-status`)
        .data({
            is_user: false,
            is_detached: true,
            statusId: 'stat-us-maximus-popup-create-detached'
        });

    return $container;
}

/**
 * MARK:getStatusPopupBlock
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
                .attr('id', statusId)
                .attr('avatar', character.avatar);

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

        status = StatUsMaximus.addStatus(avatar, {is_user});

        if (!status) return;
    };

    const $statusBlock = await HTML_TEMPLATES.get('popupStatus', {clone: true});
    const $selectRoles = $statusBlock.find('select[name="role"]');
    const $entriesContainer = $statusBlock.find('.status-entries');
    const statusId = `${generateUUID()}_stat_block`;
    const thumbnail = status.getThumbnail();
    const thumbnailSuffix = thumbnail.includes('/thumbnail?') ? '' : `?v=${Date.now()}`;

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
        .attr('src', thumbnail + thumbnailSuffix)
        .attr('title', status.avatar);

    $statusBlock
        .find('.status-toolbar .menu_button.kill-switch')
        .toggleClass('toggleEnabled', status.enabled);

    $statusBlock
        .find('.status-toolbar .menu_button')
        .data({avatar, statusId});

    $statusBlock
        .find(`.${htmlSuffix}-avatar-upload`)
        .data({avatar, statusId});

    $statusBlock
        .find('.status-collapse-entries')
        .attr('collapsed', String(status.is_collapsed))
        .data({avatar});

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
 * @param {{avatar: string; is_user?: boolean}[]} members
 * @param {Object} [options]
 * @param {boolean} [options.detachedCreation]
 */
async function openMultiStatusPopup(members = [], {detachedCreation = true} = {}) {
    if (!members?.length) return;

    const statusesWrapper = createElement('div', {
        class: `${htmlSuffix}-popup-wrapper flex-container flexFlowColumn flexnowrap gap10px padding0`
    });

    const $statusesWrapper = $(statusesWrapper);

    for (const {avatar, is_user} of members) {
        const $statusBlock = await getStatusPopupBlock(avatar, is_user);

        if (!$statusBlock) continue;

        $statusesWrapper.append($statusBlock);
    }

    if (detachedCreation) {
        const $detachedCreationBlock = await createDetachedStatusBlock();
        $statusesWrapper.append($detachedCreationBlock);
    }

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
    const getParticipantsOptions = {
        forceMutedIn: extensionSettings.showMutedMembersBlocks,
    };

    if (type === 'save') return saveMetadataSafe();

    if (type === 'user') {
        const user = getUser();
        return await openSingleStatusPopup(user.avatar, {is_user: true});
    }

    const members = StatUsMaximus.getStatuses();
    const detachedStatuses = members
        .filter(status => status.is_detached);

    if (type === 'characters') {
        const { chars } = getActiveParticipants([], getParticipantsOptions);
        return await openMultiStatusPopup([...chars, ...detachedStatuses.filter(s => s.enabled)]);
    }

    if (type === 'all') {
        return await openMultiStatusPopup(members);
    }

    if (type === 'users') {
        const users = members.filter(status => status.is_user);

        if (!users.length) return;

        return await openMultiStatusPopup(users, {detachedCreation: false});
    }
}

// * MARK:Init Triggers

function initPopupTriggers() {
    $('#rm_group_members').on('click', '.avatar img', onGroupMemberListClick);

    $(document).on('click', `.${htmlSuffix}-popup .menu_button.create-status`, eventMethods.onCreateStatus);
    $(document).on('input', `.${htmlSuffix}-popup .${htmlSuffix}-avatar-upload`, eventMethods.onAvatarFileUpload);
    $(document).on('input', `.${htmlSuffix}-popup .status-fields .text_pole`, eventMethods.onPopupStatusInput);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.kill-switch`, eventMethods.onToggleStatus);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.status-rename`, eventMethods.onRenameStatus);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-file-clipboard`, eventMethods.onCreateEntryFromClipboard);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-plus`, eventMethods.onCreateEntry);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.status-bulk-toggle`, eventMethods.onBulkToggleEntryDrawer);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-truck-arrow-right`, eventMethods.onTransferStatus);
    $(document).on('click', `.${htmlSuffix}-popup .status-toolbar .menu_button.fa-trash-can`, eventMethods.onDeleteStatus);
    $(document).on('click', `.${htmlSuffix}-popup .status-collapse-entries`, eventMethods.onCollapsePopupBlock);
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-plus`, eventMethods.onCreateEntryValue);
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-trash-can`, eventMethods.onDeleteEntryValue);
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.fa-copy`, eventMethods.onCopyEntry);
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button.make-private`, eventMethods.onTogglePrivateEntry);
    $(document).on('click', `.${htmlSuffix}-popup-row .status-entry-toolbar .menu_button[macro]`, eventMethods.onMacroShortcut);
    $(document).on('input', `.${htmlSuffix}-popup-row .text_pole`, eventMethods.onPopupEntryInput);
    $(document).on('click', `.${htmlSuffix}-popup-row .fa-solid.kill-switch`, eventMethods.onToggleEntry);
    $(document).on('input', `.${htmlSuffix}-popup-row .text_pole[name="title"]`, eventMethods.onAltTitleInput);
    $(document).on('input', `.${htmlSuffix}-popup-row select[name="value_uid"]`, eventMethods.onEntryValueSwap);
    $(document).on('click', `.${htmlSuffix}-popup-row .delete-row`, eventMethods.onDeleteEntry);

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

    $('#extensionsMenu')
        .append(wandMenuShortcutContainer)
        .on('click', `#${htmlSuffix}-wand-menu-shortcut`, onShortcutClick);
}