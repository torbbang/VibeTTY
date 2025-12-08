/**
 * Device Detection Module
 * Handles automatic detection and management of device types
 */

import { Vendor, getVendor } from '../device-types';
import { genericVendor } from '../device-types/generic';

export class DeviceDetector {
    private vendor: Vendor;
    private detectionData = '';
    private detectionComplete = false;

    constructor() {
        this.vendor = genericVendor;
    }

    /**
     * Get the current vendor configuration
     */
    getVendor(): Vendor {
        return this.vendor;
    }

    /**
     * Set device type manually
     */
    setDeviceType(deviceType: string): boolean {
        const vendor = getVendor(deviceType);
        if (vendor) {
            this.vendor = vendor;
            return true;
        }
        return false;
    }

    /**
     * Process output data for device detection
     * Accumulates data for the first few seconds to identify device type
     */
    processOutputForDetection(data: string): void {
        if (this.detectionComplete) {
            return;
        }

        this.detectionData += data;

        // Limit detection data to prevent memory issues
        if (this.detectionData.length > 10000) {
            this.performDetection();
            this.detectionComplete = true;
        }
    }

    /**
     * Force detection completion
     */
    completeDetection(): void {
        if (!this.detectionComplete) {
            this.performDetection();
            this.detectionComplete = true;
        }
    }

    /**
     * Perform actual device detection based on accumulated data
     */
    private performDetection(): void {
        // Check for Cisco IOS patterns
        if (this.detectionData.match(/Cisco IOS|IOS \(tm\)|cisco.*ios/i)) {
            this.setDeviceType('cisco_ios');
        }
        // Check for Juniper Junos
        else if (this.detectionData.match(/JUNOS|Juniper Networks/i)) {
            this.setDeviceType('juniper_junos');
        }
        // Check for FortiOS
        else if (this.detectionData.match(/FortiGate|FortiOS/i)) {
            this.setDeviceType('fortinet_fortios');
        }
        // Default to generic
        else {
            this.vendor = genericVendor;
        }
    }

    /**
     * Check if detection is complete
     */
    isDetectionComplete(): boolean {
        return this.detectionComplete;
    }
}
