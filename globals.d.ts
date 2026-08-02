declare namespace StatUsMaximus {
    type Instance = import('@popperjs/core/index.js').Instance;

    type Status = import('./source/classes/Status.js').Status;
    type StatusClass = typeof import('./source/classes/Status.js').Status;

    type StatusEntry = import('./source/classes/StatusEntry.js').StatusEntry;
    type StatusEntryClass = typeof import('./source/classes/StatusEntry.js').StatusEntry;

    type StatusData = {
        avatar: string;
        name?: string;
        role?: number;
        separator?: string;
        def_entry_separator?: string;
        prefix?: string;
        suffix?: string;
        depth?: number;
        force_depth?: number;
        /** @deprecated Use 'force_depth' instead. */
        forceDepth?: string;
        last_mes_id?: number;
        enabled?: boolean;
        is_user?: boolean;
        is_detached?: boolean;
        is_collapsed?: boolean;
        entries?: Record<string, StatusEntry>;
    }

    type EntryData = {
        enabled?: boolean;
        key?: string;
        separator?: string;
        value_uid?: number;
        display_position?: number;
        private?: boolean;
        values?: Record<string, AltValueData>;
        /** @deprecated Must be transformed into a valid 'values' instance */
        alt_values?: ({uid: number; key: string; value: string;})[];
    }

    type AltValueData = {
        title?: string;
        value?: string;
    }

    type UserCharacter = {
        name: string;
        description: string;
        avatar: string;
        is_user: boolean;
    }

    type TransferStatusOptions = {
        onlyEntries?: boolean;
        isUser?: boolean;
    }

    type RenderStatusesSafeOptions = {
        filter?: string;
        filter_is_user?: boolean;
        allowDetached?: boolean;
    }

    type AddStatusOptions = {
        is_user?: boolean;
        is_detached?: boolean;
        name?: string;
    }

    type GlobalInterface = {
        Status: StatusClass;
        StatusEntry: StatusEntryClass;
        getStatuses: () => Status[];
        getStatus: (avatar: string) => false | Status;
        addStatus: (avatar: string, options: AddStatusOptions) => false | Status;
        delStatus: (status: Status) => boolean | Status;
        transferStatus: (avatar: string, newAvatar: string, options?: TransferStatusOptions) => false | Status;
        openPopupSingle: (avatar: string, options?: { is_user?: boolean; onOpen?: () => void }) => Promise<void>;
        renderStatuses: () => Promise<void>;
        renderStatusSafe: (status: Status) => Promise<void>;
        renderStatusesSafe: (options?: RenderStatusesSafeOptions) => Promise<void>;
        log: (...mess: any[]) => void;
        debug: (...mess: any[]) => void;
        error: (...mess: any[]) => void;
        comment_avatar: 'img/quill.png';
    }

    type ExtensionSettings = {
        enabled: boolean;
        editNumbersFromChat: boolean;
        autoDetectParticipants: boolean;
        hideInputLabels: boolean;
        rangeInputWidth: string;
        showWhiteSpaces: boolean;
        defaultPromptRole: number;
        minPromptDepth: number;
        alwaysIncludeUnmutedMembers: boolean;
        forceMutedMembersInclusion: boolean;
        altMacroTemplateBehavior: boolean;
        autoSaveMetadata: boolean;
        showMutedMembersBlocks: boolean;
        showPrivateLampOnChat: boolean;
        debug: boolean;
    }

    type RefreshDepthOptions = {
        isGenerating?: boolean;
    }

    type HTMLTemplateGetOptions = {
        clone?: boolean;
    };

    type EventData<T> = JQuery.TypeEventHandler & { data: Record<string, any>; currentTarget: T; };

    type EntityFilter = 'true' | 'false' | 'all' | 'detached';
};