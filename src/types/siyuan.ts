/**
 * SiYuan Plugin Type Definitions
 * Strong type definitions for SiYuan plugin API
 */

import { Plugin } from "siyuan";

/**
 * Dock configuration options
 */
export interface DockOptions {
    position: 'Left' | 'Right' | 'Bottom';
    size: {
        width: number;
        height: number;
    };
    icon: string;
    title: string;
    hotkey?: string;
}

/**
 * Dock model returned by addDock()
 */
export interface DockModel {
    element: HTMLElement;
    data: any;
    type: string;
    position: 'Left' | 'Right' | 'Bottom';
    toggleModel(type: string, show?: boolean): void;
    resize?(): void;
}

/**
 * Top bar configuration options
 */
export interface TopBarOptions {
    icon: string;
    title: string;
    position?: 'left' | 'right';
    click?: () => void;
}

/**
 * Command configuration options
 */
export interface CommandOptions {
    langKey: string;
    hotkey: string;
    callback: () => void;
    fileTreeCallback?: (file: any) => void;
    editorCallback?: (protyle: IProtyle) => void;
}

/**
 * Menu item configuration
 */
export interface MenuItemOptions {
    icon?: string;
    label: string;
    click?: () => void;
    type?: 'separator' | 'submenu' | 'readonly';
    submenu?: MenuItemOptions[];
    accelerator?: string;
    disabled?: boolean;
    id?: string;
    element?: HTMLElement;
}

/**
 * Menu interface
 */
export interface IMenu {
    addItem(options: MenuItemOptions): void;
    addSeparator(): void;
    showAtMouseEvent(event: MouseEvent): void;
    close(): void;
}

/**
 * Protyle editor interface (SiYuan's rich text editor)
 */
export interface IProtyle {
    wysiwyg?: {
        element: HTMLElement;
        lastHTMLs?: Record<string, string>;
    };
    toolbar?: {
        element: HTMLElement;
        subElement: HTMLElement;
    };
    upload?: {
        element: HTMLElement;
    };
    block?: {
        id: string;
        rootID: string;
        showAll: boolean;
        mode: number;
        blockCount: number;
        action: string[];
    };
    title?: {
        element: HTMLElement;
    };
    background?: {
        element: HTMLElement;
    };
    element: HTMLElement;
    notebookId?: string;
    path?: string;
}

/**
 * Event bus interface
 */
export interface IEventBus {
    on(event: string, callback: (e: CustomEvent) => void): void;
    off(event: string, callback: (e: CustomEvent) => void): void;
    emit(event: string, detail?: any): void;
}

/**
 * Block icon menu event detail
 */
export interface BlockIconEvent {
    blockElements: HTMLElement[];
    menu: IMenu;
}

/**
 * Content menu event detail
 */
export interface ContentMenuEvent {
    menu: IMenu;
    range: Range | null;
    protyle: IProtyle;
    element: HTMLElement;
}

/**
 * SiYuan Plugin extended interface
 * Provides strong typing for SiYuan plugin API
 */
export interface ISiYuanPlugin extends Plugin {
    // Data persistence
    saveData(key: string, data: string | object): Promise<void>;
    loadData(key: string): Promise<string | object | null>;

    // UI components
    addIcons(svgIcons: string): void;
    addDock(options: DockOptions): DockModel;
    addTopBar(options: TopBarOptions): HTMLElement;
    addCommand(options: CommandOptions): void;

    // Event bus
    eventBus: IEventBus;

    // i18n
    i18n: Record<string, string>;

    // Plugin info
    name: string;
    displayName: string;
    author: string;
    version: string;
    protyleOptions?: any;
}

/**
 * Block element interface
 */
export interface IBlockElement extends HTMLElement {
    getAttribute(name: 'data-node-id'): string | null;
    getAttribute(name: 'data-type'): string | null;
    getAttribute(name: string): string | null;
}

/**
 * SiYuan API response format
 */
export interface SiYuanApiResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

/**
 * Block insert response
 */
export interface BlockInsertResponse {
    doOperations: Array<{
        id: string;
        action: string;
        data: string;
    }>;
}

/**
 * SQL query response
 */
export interface SqlQueryResponse {
    id: string;
    content: string;
    markdown?: string;
    type?: string;
    [key: string]: any;
}

/**
 * File tree item
 */
export interface IFileTree {
    id: string;
    name: string;
    type: 'notebook' | 'folder' | 'file';
    path: string;
    children?: IFileTree[];
}

/**
 * Notebook interface
 */
export interface INotebook {
    id: string;
    name: string;
    icon: string;
    sort: number;
    closed: boolean;
}
