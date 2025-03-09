// src/platformAccessory.ts
import {PlatformAccessory} from 'homebridge';
import {SleepmePlatform} from './platform.js';
import {Client, Device} from './sleepme/client.js';
import ReadThroughCache from './readThroughCache.js';
import {createThermostatService} from './thermostat/service.js';
import {createBatteryService} from './battery/service.js';
import {ApiQueue} from './queue/apiQueue.js';

type SleepmeContext = {
  device: Device;
  apiKey: string;
  config?: {
    apiIntervalMs?: number;
    verificationDelayMs?: number;
  };
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different Service types.
 */
export class SleepmePlatformAccessory {
  constructor(
    readonly platform: SleepmePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    const {Characteristic, Service} = this.platform;
    const context = this.accessory.context as SleepmeContext;
    const {apiKey, device, config = {}} = context;
    
    // Create the Sleepme API client
    const client = new Client(apiKey, platform.config.sleepme_api_url);
    
    // Create the API queue with configurable settings
    const apiQueue = new ApiQueue(
      client, 
      platform.log,
      config.apiIntervalMs || 2000, // Default to 2 seconds between API calls
      3, // Max retries 
      config.verificationDelayMs || 30000 // Default to 30 seconds verification delay
    );
    
    // Create the cache for device status
    const readThroughCache = new ReadThroughCache(client, device.id, platform.log);
    
    // Set up the accessory information
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Sleepme')
      .setCharacteristic(Characteristic.Model, 'Dock Pro')
      .setCharacteristic(Characteristic.SerialNumber, device.id);

    // Create the services
    createThermostatService(this, readThroughCache, apiQueue, device.id);
    createBatteryService(this, readThroughCache);
  }
}