/**
 * SecureCRT-compatible keyword highlight parser
 * Parses .ini files with keyword highlighting definitions
 *
 * Format example:
 * [Keywords]
 * Keyword List 1=error,fail,down,invalid
 *
 * [Colors]
 * Keyword List 1=red
 */

export interface KeywordSet {
    name: string;
    keywords: string[];
    color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
    caseSensitive?: boolean;
}

export class KeywordParser {
    /**
     * Parse SecureCRT-style .ini keyword file
     */
    static parseIniFile(content: string): KeywordSet[] {
        const lines = content.split('\n');
        const keywordSets: Map<string, string[]> = new Map();
        const colors: Map<string, string> = new Map();
        const options: Map<string, boolean> = new Map();

        let currentSection = '';

        for (let line of lines) {
            line = line.trim();

            // Skip empty lines and comments
            if (!line || line.startsWith(';') || line.startsWith('#')) {
                continue;
            }

            // Section header
            if (line.startsWith('[') && line.endsWith(']')) {
                currentSection = line.substring(1, line.length - 1).toLowerCase();
                continue;
            }

            // Key=Value pair
            const equalsIndex = line.indexOf('=');
            if (equalsIndex === -1) {
                continue;
            }

            const key = line.substring(0, equalsIndex).trim();
            const value = line.substring(equalsIndex + 1).trim();

            if (currentSection === 'keywords') {
                // Parse comma-separated keywords
                const keywords = value.split(',').map(k => k.trim()).filter(k => k);
                keywordSets.set(key, keywords);
            } else if (currentSection === 'colors') {
                colors.set(key, value.toLowerCase());
            } else if (currentSection === 'options') {
                options.set(key, value.toLowerCase() === 'true' || value === '1');
            }
        }

        // Combine keywords with their colors
        const result: KeywordSet[] = [];
        for (const [name, keywords] of keywordSets) {
            const color = this.normalizeColor(colors.get(name) || 'yellow');
            const caseSensitive = options.get(name + ' Case Sensitive') || false;

            result.push({
                name,
                keywords,
                color,
                caseSensitive
            });
        }

        return result;
    }

    /**
     * Parse simple format: one keyword per line with optional color
     * Format: keyword [color]
     * Example:
     *   error red
     *   warning yellow
     *   success green
     */
    static parseSimpleFormat(content: string): KeywordSet[] {
        const lines = content.split('\n');
        const byColor: Map<string, string[]> = new Map();

        for (let line of lines) {
            line = line.trim();

            // Skip empty lines and comments
            if (!line || line.startsWith(';') || line.startsWith('#')) {
                continue;
            }

            // Parse line: keyword [color]
            const parts = line.split(/\s+/);
            const keyword = parts[0];
            const colorName = parts.length > 1 ? parts[1].toLowerCase() : 'yellow';
            const color = this.normalizeColor(colorName);

            if (!byColor.has(color)) {
                byColor.set(color, []);
            }
            byColor.get(color)!.push(keyword);
        }

        // Convert to KeywordSet array
        const result: KeywordSet[] = [];
        let index = 1;
        for (const [color, keywords] of byColor) {
            result.push({
                name: `Keywords ${index}`,
                keywords,
                color: color as 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white',
                caseSensitive: false
            });
            index++;
        }

        return result;
    }

    /**
     * Normalize color names to supported colors
     */
    private static normalizeColor(colorName: string): 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' {
        type SupportedColor = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
        const normalized = colorName.toLowerCase().trim();

        // Map common color variations
        const colorMap: { [key: string]: SupportedColor } = {
            'red': 'red',
            'green': 'green',
            'yellow': 'yellow',
            'blue': 'blue',
            'magenta': 'magenta',
            'purple': 'magenta',
            'cyan': 'cyan',
            'white': 'white',
            'orange': 'yellow', // Fallback
            'gray': 'white',     // Fallback
            'grey': 'white'      // Fallback
        };

        return colorMap[normalized] || 'yellow';
    }

    /**
     * Auto-detect format and parse
     */
    static parse(content: string): KeywordSet[] {
        // Check if it looks like INI format (has sections)
        if (content.includes('[Keywords]') || content.includes('[Colors]')) {
            return this.parseIniFile(content);
        }

        // Otherwise use simple format
        return this.parseSimpleFormat(content);
    }
}
