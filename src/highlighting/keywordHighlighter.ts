/**
 * Keyword highlighting for terminal output
 * Applies ANSI color codes to keywords based on configuration
 */

import { KeywordSet } from './keywordParser';

export class KeywordHighlighter {
    private keywordSets: KeywordSet[] = [];
    private enabled = true;

    /**
     * ANSI color codes
     */
    private static readonly ANSI_COLORS = {
        red: '\x1b[91m',      // Bright red
        green: '\x1b[92m',    // Bright green
        yellow: '\x1b[93m',   // Bright yellow
        blue: '\x1b[94m',     // Bright blue
        magenta: '\x1b[95m',  // Bright magenta
        cyan: '\x1b[96m',     // Bright cyan
        white: '\x1b[97m',    // Bright white
        reset: '\x1b[0m'      // Reset
    };

    constructor(keywordSets: KeywordSet[] = []) {
        this.keywordSets = keywordSets;
    }

    /**
     * Load keyword sets
     */
    setKeywordSets(keywordSets: KeywordSet[]): void {
        this.keywordSets = keywordSets;
    }

    /**
     * Enable/disable highlighting
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if highlighting is enabled
     */
    isEnabled(): boolean {
        return this.enabled && this.keywordSets.length > 0;
    }

    /**
     * Apply keyword highlighting to text
     * Returns text with ANSI color codes applied
     */
    highlight(text: string): string {
        if (!this.enabled || this.keywordSets.length === 0) {
            return text;
        }

        let result = text;

        // Apply each keyword set
        for (const keywordSet of this.keywordSets) {
            for (const keyword of keywordSet.keywords) {
                result = this.highlightKeyword(result, keyword, keywordSet.color, keywordSet.caseSensitive);
            }
        }

        return result;
    }

    /**
     * Highlight a specific keyword in text
     */
    private highlightKeyword(
        text: string,
        keyword: string,
        color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white',
        caseSensitive = false
    ): string {
        if (!keyword || keyword.length === 0) {
            return text;
        }

        const colorCode = KeywordHighlighter.ANSI_COLORS[color];
        const resetCode = KeywordHighlighter.ANSI_COLORS.reset;

        // Build regex with word boundaries to match whole words only
        const flags = caseSensitive ? 'g' : 'gi';
        const escapedKeyword = this.escapeRegex(keyword);

        // Match as whole word (with word boundaries)
        const regex = new RegExp(`\\b(${escapedKeyword})\\b`, flags);

        // Replace with colored version
        // Preserve any existing ANSI codes by not replacing within them
        return text.replace(regex, `${colorCode}$1${resetCode}`);
    }

    /**
     * Escape special regex characters
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get statistics about keyword matches
     */
    getMatchStatistics(text: string): Map<string, number> {
        const stats = new Map<string, number>();

        for (const keywordSet of this.keywordSets) {
            for (const keyword of keywordSet.keywords) {
                const flags = keywordSet.caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, flags);
                const matches = text.match(regex);
                const count = matches ? matches.length : 0;

                if (count > 0) {
                    stats.set(keyword, count);
                }
            }
        }

        return stats;
    }
}
