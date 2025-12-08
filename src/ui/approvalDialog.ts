/**
 * Enhanced Approval Dialog with full content view
 * Shows device context, syntax highlighting, and keyboard shortcuts
 */

import * as vscode from 'vscode';
import { ApprovalRequest, ApprovalResult } from '../security/approvalGate';

export class ApprovalDialog {
    /**
     * Show enhanced approval dialog with full content
     */
    static async show(request: ApprovalRequest): Promise<ApprovalResult> {
        // Determine if content is multi-line
        const isMultiLine = request.content.includes('\n') || request.content.includes('\r');

        // For single-line content or very short multi-line content, use quick pick
        // Also consider total length for quick pick to avoid very long single lines
        if (!isMultiLine || request.content.length < 100) { // Single line, or very short multi-line content
            return this.showQuickPick(request);
        }

        // For multi-line content (or long single line > 100 chars), show in a dedicated panel
        return this.showPanel(request);
    }

    /**
     * Quick pick dialog for short content
     */
    private static async showQuickPick(request: ApprovalRequest): Promise<ApprovalResult> {
        const type = request.type === 'output' ? 'Output to LLM' : 'Command from LLM';
        const icon = request.type === 'output' ? '📤' : '📥';

        const items: vscode.QuickPickItem[] = [
            {
                label: `$(check) Approve`,
                description: 'Send this content (Enter)',
                detail: undefined
            },
            {
                label: `$(edit) Edit & Approve`,
                description: 'Modify before sending (Ctrl+E)',
                detail: undefined
            },
            {
                label: `$(eye) View Full Content`,
                description: 'Open in editor window',
                detail: undefined
            },
            {
                label: `$(x) Reject`,
                description: 'Block this interaction (Escape)',
                detail: undefined
            }
        ];

        // Add session/device context to placeholder
        const contextInfo = `${request.sessionId}`;
        const preview = request.content.length > 200
            ? request.content.substring(0, 200) + '...'
            : request.content;

        const choice = await vscode.window.showQuickPick(items, {
            title: `${icon} ${type} - ${contextInfo}`,
            placeHolder: preview,
            ignoreFocusOut: true
        });

        if (!choice) {
            return { approved: false };
        }

        if (choice.label.includes('Approve') && !choice.label.includes('Edit')) {
            return { approved: true };
        }

        if (choice.label.includes('Edit')) {
            return this.showEditor(request);
        }

        if (choice.label.includes('View Full')) {
            // Show full content, then ask again
            await this.showFullContent(request);
            return this.showQuickPick(request); // Recurse after viewing
        }

        return { approved: false };
    }

    /**
     * Show editor for modifying content
     */
    private static async showEditor(request: ApprovalRequest): Promise<ApprovalResult> {
        const doc = await vscode.workspace.openTextDocument({
            content: request.content,
            language: 'text'
        });

        const editor = await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });

        const choice = await vscode.window.showInformationMessage(
            '✏️ Edit the content in the editor, then click Approve or Reject',
            'Approve Edited',
            'Reject'
        );

        const editedContent = editor.document.getText();

        // Close the editor without save prompt (revert discards unsaved changes)
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

        if (choice === 'Approve Edited') {
            return {
                approved: true,
                modifiedContent: editedContent
            };
        }

        // Dismissed or rejected
        return { approved: false };
    }

    /**
     * Show full content in read-only editor
     */
    private static async showFullContent(request: ApprovalRequest): Promise<void> {
        const type = request.type === 'output' ? 'OUTPUT' : 'COMMAND';
        const header = `# ${type} TO REVIEW\n# Session: ${request.sessionId}\n# Context: ${request.context}\n\n`;

        const doc = await vscode.workspace.openTextDocument({
            content: header + request.content,
            language: 'text'
        });

        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });
    }

    /**
     * Show panel with full content and device context
     */
    private static async showPanel(request: ApprovalRequest): Promise<ApprovalResult> {
        const type = request.type === 'output' ? 'OUTPUT' : 'COMMAND';

        // Show content in editor first
        await this.showFullContent(request);

        // Then show decision dialog (non-blocking notification)
        const choice = await vscode.window.showWarningMessage(
            `⚠️ ${type}: ${request.sessionId} - Review the content in the editor, then choose:`,
            'Approve',
            'Edit',
            'Reject'
        );

        if (choice === 'Approve') {
            // Close editor without save prompt (temporary approval document)
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            return { approved: true };
        }

        if (choice === 'Edit') {
            // Keep editor open, allow editing
            return this.showEditor(request);
        }

        // Dismissed or rejected - close editor without save prompt
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        return { approved: false };
    }
}
