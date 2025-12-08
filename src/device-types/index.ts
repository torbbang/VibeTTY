import { Vendor } from './vendor';
import { genericVendor } from './generic';
import { ciscoVendor } from './cisco_ios';
import { junosVendor } from './juniper_junos';
import { fortiosVendor } from './fortinet_fortios';

export type { Vendor };

const deviceTypes: { [key: string]: Vendor } = {
    'cisco_ios': ciscoVendor,
    'cisco_ios-xe': ciscoVendor,  // IOS-XE uses same patterns as IOS
    'juniper_junos': junosVendor,
    'fortinet_fortios': fortiosVendor,
    'generic': genericVendor
};

/**
 * Get the list of actually supported device types
 * This should be used for tool definitions and error messages
 */
export function getSupportedDeviceTypes(): string[] {
    return Object.keys(deviceTypes);
}

/**
 * Get vendor/device-type configuration by device type string
 */
export function getVendor(deviceType: string): Vendor {
    const key = deviceType.toLowerCase();
    if (key in deviceTypes) {
        return deviceTypes[key];
    }
    return deviceTypes.generic;
}
