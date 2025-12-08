/**
 * Mock VSCode API for testing
 * This file provides mock implementations of VSCode APIs used by VibeTTY
 */

// Type definitions for mock implementations
interface QuickPickOptions {
  placeHolder?: string;
  canPickMany?: boolean;
}

interface InputBoxOptions {
  prompt?: string;
  value?: string;
  password?: boolean;
}

interface OutputChannel {
  appendLine: (message: string) => void;
  append: (message: string) => void;
  clear: () => void;
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

interface StatusBarItem {
  text: string;
  tooltip: string;
  command: string;
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

interface TerminalOptions {
  name?: string;
  pty?: unknown;
}

interface Terminal {
  name: string;
  show: () => void;
  hide: () => void;
  dispose: () => void;
  sendText: (text: string) => void;
}

interface TreeViewOptions {
  treeDataProvider: unknown;
  showCollapseAll?: boolean;
}

interface TreeView {
  reveal: () => void;
  dispose: () => void;
}

interface WorkspaceConfiguration {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  has(key: string): boolean;
}

interface Disposable {
  dispose(): void;
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export class Uri {
  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static parse(value: string): Uri {
    const match = value.match(/^(\w+):\/\/([^/]*)(.*)$/);
    if (match) {
      return new Uri(match[1], match[2], match[3], '', '');
    }
    return new Uri('file', '', value, '', '');
  }

  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string
  ) {}

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  get event() {
    return (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
  }

  fire(data: T): void {
    this.listeners.forEach(listener => listener(data));
  }

  dispose(): void {
    this.listeners = [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace window {
  export function showErrorMessage(_message: string, ..._items: string[]): Thenable<string | undefined> {
    return Promise.resolve(undefined);
  }

  export function showWarningMessage(_message: string, ..._items: string[]): Thenable<string | undefined> {
    return Promise.resolve(undefined);
  }

  export function showInformationMessage(_message: string, ..._items: string[]): Thenable<string | undefined> {
    return Promise.resolve(undefined);
  }

  export function showQuickPick(items: string[], _options?: QuickPickOptions): Thenable<string | undefined> {
    return Promise.resolve(items[0]);
  }

  export function showInputBox(_options?: InputBoxOptions): Thenable<string | undefined> {
    return Promise.resolve(undefined);
  }

  export function createOutputChannel(_name: string): OutputChannel {
    return {
      appendLine: (_message: string) => {},
      append: (_message: string) => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
    };
  }

  export function createStatusBarItem(_alignment?: StatusBarAlignment, _priority?: number): StatusBarItem {
    return {
      text: '',
      tooltip: '',
      command: '',
      show: () => {},
      hide: () => {},
      dispose: () => {},
    };
  }

  export function createTerminal(options: TerminalOptions): Terminal {
    return {
      name: options.name || 'terminal',
      show: () => {},
      hide: () => {},
      dispose: () => {},
      sendText: (_text: string) => {},
    };
  }

  export function createTreeView(_viewId: string, _options: TreeViewOptions): TreeView {
    return {
      reveal: () => {},
      dispose: () => {},
    };
  }

  export const activeTextEditor = undefined;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace workspace {
  export function getConfiguration(section?: string): WorkspaceConfiguration {
    const config: Record<string, unknown> = {
      'vibetty.security.strictMode': false,
      'vibetty.logging.enabled': false,
      'vibetty.logging.directory': '~/.vibetty/logs',
      'vibetty.ssh.serverAliveInterval': 60,
      'vibetty.highlighting.enabled': true,
      'vibetty.highlighting.customKeywordFile': '',
      'vibetty.connections': [],
    };

    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const fullKey = section ? `${section}.${key}` : key;
        return (config[fullKey] as T) ?? defaultValue;
      },
      update: async (key: string, value: unknown) => {
        const fullKey = section ? `${section}.${key}` : key;
        config[fullKey] = value;
      },
      has: (key: string) => {
        const fullKey = section ? `${section}.${key}` : key;
        return fullKey in config;
      },
    };
  }

  export const workspaceFolders = undefined;
  export const onDidChangeConfiguration = new EventEmitter<unknown>().event;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace commands {
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

  export function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(command, callback);
    return { dispose: () => registeredCommands.delete(command) };
  }

  export async function executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    const callback = registeredCommands.get(command);
    if (callback) {
      return callback(...args);
    }
    return undefined;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  constructor(
    public label: string,
    public collapsibleState?: TreeItemCollapsibleState
  ) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: new EventEmitter<void>().event,
  };

  cancel(): void {
    this.token.isCancellationRequested = true;
  }

  dispose(): void {}
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace env {
  export const machineId = 'test-machine-id-1234567890';
  export const sessionId = 'test-session-id-0987654321';
  export const language = 'en';
  export const appName = 'Visual Studio Code';
}
