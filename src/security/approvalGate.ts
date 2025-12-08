/**
 * Approval Gate - Strict mode for LLM interactions
 *
 * When enabled, all output to LLM and all commands from LLM require user approval
 * This is for users who want complete control over what data is shared with LLM providers
 */

import * as vscode from 'vscode';
import { ApprovalDialog } from '../ui/approvalDialog';

export interface ApprovalRequest {
    type: 'output' | 'command';
    sessionId: string;
    content: string;
    context: string;
    timestamp: Date;
}

export interface ApprovalResult {
    approved: boolean;
    modifiedContent?: string; // User can edit before approving
}

/**
 * Approval gate for strict mode
 * When strict mode is enabled, all LLM interactions require user approval
 */
export class ApprovalGate {
    private static instance: ApprovalGate;
    private strictModeEnabled = false;

    private constructor() {
        // Load strict mode setting from VSCode config
        this.loadSettings();
    }

    static getInstance(): ApprovalGate {
        if (!ApprovalGate.instance) {
            ApprovalGate.instance = new ApprovalGate();
        }
        return ApprovalGate.instance;
    }

    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration('vibetty');
        this.strictModeEnabled = config.get<boolean>('security.strictMode', false);
    }

    /**
     * Check if strict mode is enabled
     */
    isStrictMode(): boolean {
        return this.strictModeEnabled;
    }

    /**
     * Enable or disable strict mode
     */
    setStrictMode(enabled: boolean): void {
        this.strictModeEnabled = enabled;

        // Update VSCode settings
        const config = vscode.workspace.getConfiguration('vibetty');
        config.update('security.strictMode', enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * Request approval for output going to LLM
     * Returns null if rejected, original or modified content if approved
     */
    async approveOutput(request: ApprovalRequest): Promise<string | null> {
        if (!this.strictModeEnabled) {
            return request.content; // Auto-approve in normal mode
        }

        const result = await this.showApprovalDialog(request);
        if (!result.approved) {
            return null;
        }

        return result.modifiedContent ?? request.content;
    }

    /**
     * Request approval for command from LLM
     * Returns null if rejected, original or modified command if approved
     */
    async approveCommand(request: ApprovalRequest): Promise<string | null> {
        if (!this.strictModeEnabled) {
            return request.content; // Auto-approve in normal mode
        }

        const result = await this.showApprovalDialog(request);
        if (!result.approved) {
            return null;
        }

        return result.modifiedContent ?? request.content;
    }

    /**
     * Show approval dialog to user
     */
    private async showApprovalDialog(request: ApprovalRequest): Promise<ApprovalResult> {
        // Use improved dialog UI
        return ApprovalDialog.show(request);
    }

    /**
     * Show info message about strict mode
     */
    async showStrictModeInfo(): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            'Strict Mode is enabled. All LLM interactions require your approval.',
            'Disable Strict Mode',
            'Keep Enabled'
        );

        if (action === 'Disable Strict Mode') {
            this.setStrictMode(false);
            vscode.window.showInformationMessage('Strict Mode disabled. LLM can access terminal output automatically.');
        }
    }

    /**
     * Show warning when enabling strict mode
     */
    async confirmEnableStrictMode(): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            'Enable Strict Mode? You will need to manually approve every LLM interaction (output reads and command sends).',
            { modal: true },
            'Enable',
            'Cancel'
        );

        if (choice === 'Enable') {
            this.setStrictMode(true);
            vscode.window.showInformationMessage('Strict Mode enabled. All LLM interactions now require approval.');
            return true;
        }

        return false;
    }
}

