/**
 * Status Bar UI for VibeTTY Security Features
 * Shows strict mode status and secret counter
 */

import * as vscode from 'vscode';
import { ApprovalGate } from '../security/approvalGate';
import { SecretRegistry } from '../security/secretRegistry';
import { SessionManager } from '../sessions/sessionManager';

export class SecurityStatusBar {
    private static instance: SecurityStatusBar;
    private strictModeItem: vscode.StatusBarItem;
    private secretCountItem: vscode.StatusBarItem;
    private vendorWarningItem: vscode.StatusBarItem;
    private updateInterval?: NodeJS.Timeout;

    private constructor() {
        // Strict Mode indicator (left side, high priority)
        this.strictModeItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.strictModeItem.command = 'vibetty.toggleStrictMode';
        this.strictModeItem.tooltip = 'Click to toggle Strict Mode';

        // Secret counter (left side, lower priority)
        this.secretCountItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.secretCountItem.command = 'vibetty.showSecretStats';
        this.secretCountItem.tooltip = 'Secrets filtered today';

        // Vendor warning (left side, highest priority)
        this.vendorWarningItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            101
        );
        this.vendorWarningItem.command = 'vibetty.showHostSettings';
        this.vendorWarningItem.tooltip = 'Set device vendor to enable secret filtering';
        this.vendorWarningItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.vendorWarningItem.text = '$(warning) No Vendor';

        this.updateStatusBar();

        // Update every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updateStatusBar();
        }, 5000);
    }

    static getInstance(): SecurityStatusBar {
        if (!SecurityStatusBar.instance) {
            SecurityStatusBar.instance = new SecurityStatusBar();
        }
        return SecurityStatusBar.instance;
    }

    /**
     * Show status bar items
     */
    show(): void {
        this.strictModeItem.show();
        this.secretCountItem.show();
        // vendorWarningItem is shown/hidden based on active terminal
    }

    /**
     * Hide status bar items
     */
    hide(): void {
        this.strictModeItem.hide();
        this.secretCountItem.hide();
        this.vendorWarningItem.hide();
    }

    /**
     * Update status bar content
     */
    public updateStatusBar(sessionManager?: SessionManager): void {
        const gate = ApprovalGate.getInstance();
        const isStrictMode = gate.isStrictMode();

        // Strict Mode indicator
        if (isStrictMode) {
            this.strictModeItem.text = '$(lock) Strict Mode';
            this.strictModeItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.strictModeItem.tooltip = 'Strict Mode ENABLED - Click to disable';
        } else {
            this.strictModeItem.text = '$(unlock) Normal Mode';
            this.strictModeItem.backgroundColor = undefined;
            this.strictModeItem.tooltip = 'Strict Mode disabled - Click to enable';
        }

        // Secret counter
        const registry = SecretRegistry.getInstance();
        const secrets = registry.listSecrets();
        const secretCount = secrets.length;

        if (secretCount > 0) {
            this.secretCountItem.text = `$(shield) ${secretCount} secret${secretCount === 1 ? '' : 's'}`;
            this.secretCountItem.tooltip = `${secretCount} secret${secretCount === 1 ? '' : 's'} filtered (click for details)`;
            this.secretCountItem.show();
        } else {
            this.secretCountItem.text = '$(shield) 0 secrets';
            this.secretCountItem.tooltip = 'No secrets filtered yet';
        }

        // Vendor warning
        if (sessionManager) {
            const activeTerminal = vscode.window.activeTerminal;
            const session = activeTerminal ? sessionManager.getSessionByTerminal(activeTerminal) : undefined;

            // Check if device type is set (not generic or undefined)
            const currentDeviceType = session?.connection.device_type;
            const isDeviceTypeSet = currentDeviceType && currentDeviceType !== 'generic';

            if (session && !isDeviceTypeSet) {
                this.vendorWarningItem.show();
            } else {
                this.vendorWarningItem.hide();
            }
        } else {
            this.vendorWarningItem.hide();
        }
    }

    /**
     * Force update (call after strict mode toggle or secret detection)
     */
    refresh(sessionManager?: SessionManager): void {
        this.updateStatusBar(sessionManager);
    }

    /**
     * Dispose of status bar items
     */
    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.strictModeItem.dispose();
        this.secretCountItem.dispose();
        this.vendorWarningItem.dispose();
    }
}
