/**
 * Onboarding flow for first-time Strict Mode users
 * Explains features and walks through first approval
 */

import * as vscode from 'vscode';
import { outputChannel } from '../utils/outputChannel';

export class OnboardingManager {
    private static readonly ONBOARDING_KEY = 'vibetty.onboarding.strictMode.completed';
    private static readonly TOUR_KEY = 'vibetty.onboarding.strictMode.tourShown';
    private static readonly FIRST_RUN_KEY = 'vibetty.onboarding.firstRun.completed';

    /**
     * Check if user has completed onboarding
     */
    static hasCompletedOnboarding(context: vscode.ExtensionContext): boolean {
        return context.globalState.get<boolean>(this.ONBOARDING_KEY, false);
    }

    /**
     * Check if this is the first time running the extension
     */
    static isFirstRun(context: vscode.ExtensionContext): boolean {
        return !context.globalState.get<boolean>(this.FIRST_RUN_KEY, false);
    }

    /**
     * Check if tour has been shown
     */
    static hasTourBeenShown(context: vscode.ExtensionContext): boolean {
        return context.globalState.get<boolean>(this.TOUR_KEY, false);
    }

    /**
     * Show first-run welcome message
     */
    static async showFirstRunWelcome(context: vscode.ExtensionContext): Promise<void> {
        if (!this.isFirstRun(context)) {
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            'Welcome to VibeTTY!\n\n' +
            'VibeTTY is a network engineer\'s SSH session manager with AI integration.\n\n' +
            'Key Features:\n' +
            '  - SSH/Telnet/Serial connections with folder organization\n' +
            '  - MCP (Model Context Protocol) for AI assistant integration\n' +
            '  - Password detection with auto-focus\n' +
            '  - Session logging and keyword highlighting\n' +
            '  - Strict Mode for secure LLM interactions\n\n' +
            'Click the + button in the sidebar to add your first connection!',
            { modal: true },
            'Quick Start Guide',
            'Got It',
            'Documentation'
        );

        if (choice === 'Quick Start Guide') {
            const quickstartUri = vscode.Uri.joinPath(context.extensionUri, 'QUICKSTART.md');
            try {
                const doc = await vscode.workspace.openTextDocument(quickstartUri);
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                vscode.window.showErrorMessage('Could not open the Quick Start Guide.');
                outputChannel.error('Failed to open Quick Start Guide', error as Error);
            }
        } else if (choice === 'Documentation') {
            await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/anthropics/vibetty')
            );
        }

        await context.globalState.update(this.FIRST_RUN_KEY, true);
    }

    /**
     * Show welcome message when strict mode is first enabled
     */
    static async showWelcome(context: vscode.ExtensionContext): Promise<void> {
        const hasCompleted = this.hasCompletedOnboarding(context);

        if (hasCompleted) {
            // Already seen it
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            'Strict Mode Enabled\n\n' +
            'You will now manually approve every LLM interaction. This gives you complete control over:\n\n' +
            '  - What output LLMs can read\n' +
            '  - What commands LLMs can execute\n' +
            '  - The ability to edit content before sharing\n\n' +
            'Passwords are automatically filtered regardless of this setting.',
            { modal: true },
            'Take Tour',
            'Got It',
            'Documentation'
        );

        if (choice === 'Take Tour') {
            await this.showTour(context);
        } else if (choice === 'Documentation') {
            await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/anthropics/vibetty#strict-mode')
            );
        }

        // Mark as completed
        await context.globalState.update(this.ONBOARDING_KEY, true);
    }

    /**
     * Interactive tour of strict mode features
     */
    static async showTour(context: vscode.ExtensionContext): Promise<void> {
        // Step 1: Explain approval workflow
        await vscode.window.showInformationMessage(
            '📋 **Tour: Step 1 of 4**\n\n' +
            '**Approval Workflow**\n\n' +
            'When an LLM tries to read output or send a command, you\'ll see an approval dialog with three options:\n\n' +
            '✅ **Approve** - Send as-is\n' +
            '✏️ **Edit & Approve** - Modify before sending\n' +
            '❌ **Reject** - Block the interaction',
            'Next'
        );

        // Step 2: Explain keyboard shortcuts
        await vscode.window.showInformationMessage(
            '⌨️ **Tour: Step 2 of 4**\n\n' +
            '**Keyboard Shortcuts**\n\n' +
            '* **Enter** - Approve\n' +
            '* **Escape** - Reject\n' +
            '* **Ctrl+E** - Edit & Approve\n\n' +
            'Use these to quickly approve/reject without mouse clicks.',
            'Next'
        );

        // Step 3: Explain status bar
        await vscode.window.showInformationMessage(
            '📊 **Tour: Step 3 of 4**\n\n' +
            '**Status Bar Indicators**\n\n' +
            'Look at the bottom-left corner of VSCode:\n\n' +
            '🔒 **Strict Mode** - Shows current mode (click to toggle)\n' +
            '🛡️ **Secrets** - Shows count of filtered passwords\n\n' +
            'Click these for quick actions!',
            'Next'
        );

        // Step 4: How to disable
        await vscode.window.showInformationMessage(
            '⚙️ **Tour: Step 4 of 4**\n\n' +
            '**Disabling Strict Mode**\n\n' +
            'To disable strict mode:\n\n' +
            '1. Click the 🔒 status bar indicator, or\n' +
            '2. Open Command Palette (Ctrl+Shift+P)\n' +
            '3. Run "VibeTTY Security: Disable Strict Mode"\n\n' +
            '**Note:** Password filtering remains active even when disabled.',
            'Finish Tour'
        );

        await context.globalState.update(this.TOUR_KEY, true);
    }

    /**
     * Show context-sensitive help during first approval
     */
    static async showFirstApprovalHelp(
        context: vscode.ExtensionContext,
        type: 'output' | 'command'
    ): Promise<void> {
        const key = `vibetty.onboarding.firstApproval.${type}`;
        const alreadyShown = context.globalState.get<boolean>(key, false);

        if (alreadyShown) {
            return;
        }

        const message = type === 'output'
            ? '💡 **First Output Approval**\n\n' +
              'The LLM is trying to read terminal output. Review the content and choose:\n\n' +
              '* Approve if the content looks safe to share\n' +
              '* Edit if you want to redact additional information\n' +
              '* Reject if the content is too sensitive\n\n' +
              'Passwords are already filtered automatically.'
            : '💡 **First Command Approval**\n\n' +
              'The LLM wants to execute a command. Review it carefully:\n\n' +
              '* Approve if the command looks safe\n' +
              '* Edit if you want to modify the command\n' +
              '* Reject if the command is risky\n\n' +
              'Remember: This runs on your actual device!';

        await vscode.window.showInformationMessage(message, 'Got It');

        await context.globalState.update(key, true);
    }

    /**
     * Show quick tips periodically
     */
    static async showTip(context: vscode.ExtensionContext): Promise<void> {
        const tips = [
            '💡 **Tip:** Click the 🔒 status bar to quickly toggle Strict Mode on/off',
            '💡 **Tip:** Press Enter to approve, Escape to reject during approval dialogs',
            '💡 **Tip:** Click 🛡️ Secrets in the status bar to see what\'s been filtered',
            '💡 **Tip:** Use "Edit & Approve" to redact additional sensitive info before sharing',
            '💡 **Tip:** Strict Mode adds overhead. Disable it for faster LLM interactions during development'
        ];

        const lastTipIndex = context.globalState.get<number>('vibetty.onboarding.lastTipIndex', -1);
        const nextIndex = (lastTipIndex + 1) % tips.length;

        await vscode.window.showInformationMessage(tips[nextIndex]);
        await context.globalState.update('vibetty.onboarding.lastTipIndex', nextIndex);
    }

    /**
     * Reset onboarding (for testing)
     */
    static async reset(context: vscode.ExtensionContext): Promise<void> {
        await context.globalState.update(this.FIRST_RUN_KEY, undefined);
        await context.globalState.update(this.ONBOARDING_KEY, undefined);
        await context.globalState.update(this.TOUR_KEY, undefined);
        await context.globalState.update('vibetty.onboarding.firstApproval.output', undefined);
        await context.globalState.update('vibetty.onboarding.firstApproval.command', undefined);
        await context.globalState.update('vibetty.onboarding.lastTipIndex', undefined);

        vscode.window.showInformationMessage('Onboarding state reset. Reload window to see first-run welcome.');
    }
}
