// src/platform.ts
import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
  Characteristic,
  PlatformConfig,
} from 'homebridge';

import {Client} from './sleepme/client.js';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';
import {SleepmePlatformAccessory} from './platformAccessory.js';
import axios from 'axios';

export type PluginConfig = {
  api_keys: string[];
  platform: string;
  sleepme_api_url: string;
  api_interval_ms?: number;
  verification_delay_ms?: number; 
  cache_ttl_ms?: number;
};

const validateConfig = (config: PlatformConfig): [boolean, string] => {
  if (!config.api_keys || !Array.isArray(config.api_keys)) {
    return [false, 'No API keys configured - plugin will not start'];
  }

  if (!config.sleepme_api_url) {
    return [false, 'Missing SleepMe API URL - plugin will not start'];
  }

  if (config.api_keys.some((s: unknown) => typeof s !== 'string')) {
    return [false, 'Some API keys are invalid'];
  }

  if (!config as unknown as PluginConfig) {
    return [false, 'this configuration is invalid'];
  }

  return [true, ''];
};

// When this event is fired it means Homebridge has restored all cached accessories from disk.
// Dynamic Platform plugins should only register new accessories after this event was fired,
// in order to ensure they weren't added to homebridge already. This event can also be used
// to start discovery of new accessories.
const didFinishLaunching = 'didFinishLaunching';

export class SleepmePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const [validConfig, message] = validateConfig(this.config);
    if (!validConfig) {
      this.log.error(message);
      return;
    }

    this.log.debug('Finished initializing platform:', config.platform);
    if (!log.success) {
      log.success = log.info;
    }
    this.api.on(didFinishLaunching, () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices().catch(err => {
        this.log.error(`error during device discovery (${err})`);
      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices(): Promise<void[]> {
    return Promise.all(this.config.api_keys.map((key: string) => {
      const client = new Client(key, this.config.sleepme_api_url);
      return client.listDevices().then(r => {
        r.data.forEach(device => {
          const uuid = this.api.hap.uuid.generate(device.id);
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
          
          // Add global queue configuration
          const deviceConfig = {
            apiIntervalMs: this.config.api_interval_ms,
            verificationDelayMs: this.config.verification_delay_ms,
            cacheTtlMs: this.config.cache_ttl_ms
          };
          
          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // Update the accessory context with the latest device info and config
            existingAccessory.context.device = device;
            existingAccessory.context.apiKey = key;
            existingAccessory.context.config = deviceConfig;
            this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            new SleepmePlatformAccessory(this, existingAccessory);
          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', device.name);
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.name, uuid);

            // store a copy of the device object in the `accessory.context`
            accessory.context.device = device;
            accessory.context.apiKey = key;
            accessory.context.config = deviceConfig;

            // create the accessory handler for the newly create accessory
            new SleepmePlatformAccessory(this, accessory);
            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        });
      }).catch(err => {
        if (axios.isAxiosError(err)) {
          if (err.status === 403) {
            this.log.error(`the token ending in ${key.substring(key.length - 4)} is invalid.`);
          } else {
            this.log.error(`API error with token ending in ${key.substring(key.length - 4)}: ${err.message}`);
          }
        } else {
          this.log.error(`Unknown error with token ending in ${key.substring(key.length - 4)}: ${err}`);
        }
      });
    }));
  }
}