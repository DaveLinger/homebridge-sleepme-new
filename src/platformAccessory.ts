import {PlatformAccessory} from 'homebridge';
import {SleepmePlatform} from './platform.js';
import {Client, Device} from './sleepme/client.js';
import ReadThroughCache from './readThroughCache.js';
import {createThermostatService} from './thermostat/service.js';
import {createBatteryService} from './battery/service.js';

type SleepmeContext = {
  device: Device;
  apiKey: string;
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
    const {apiKey, device} = this.accessory.context as SleepmeContext;
    
    // Create client with logging
    const client = new Client(
      apiKey, 
      this.platform.config.sleepme_api_url, 
      (message) => this.platform.log.debug(`[${device.name}] ${message}`)
    );
    
    const readThroughCache = new ReadThroughCache(client, device.id, platform.log);
    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Sleepme')
      .setCharacteristic(Characteristic.Model, 'Dock Pro')
      .setCharacteristic(Characteristic.SerialNumber, device.id);

    createThermostatService(this, readThroughCache, device.id);
    createBatteryService(this, readThroughCache);
  }
}